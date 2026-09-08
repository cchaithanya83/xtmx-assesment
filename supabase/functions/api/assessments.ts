import type { Caller } from '../_server/auth.ts'
import { resolveCandidateId } from '../_server/auth.ts'
import { badRequest, conflict, forbidden, notFound } from '../_server/http.ts'
import {
  attemptToRow,
  countAttempts,
  getCandidate,
  getCertification,
  getSettings,
  listAttempts,
  saveCertification,
} from '../_server/repo.ts'
import { getAssignment } from '../_shared/tasks.ts'
import { PASSAGE_POOLS } from '../_shared/passages.ts'
import {
  activePassagePool,
  resolveLevelFields,
  resolvePools,
} from '../_server/content.ts'
import { generateScenario } from '../_shared/scenario.ts'
import { applyInput, computeMetrics, createTypingState } from '../_shared/typing.ts'
import { scoreTask1, scoreTask2 } from '../_shared/scoring.ts'
import { buildTask1Feedback, buildTask2Feedback } from '../_shared/feedback.ts'
import {
  buildCertification,
  computeAssessmentResult,
  deriveProgress,
  task1Completion,
} from '../_shared/certification.ts'
import { uid } from '../_shared/core.ts'
import type {
  Attempt,
  TypingPassage,
  AudioAttemptTelemetry,
  AudioScenario,
  IntegrityLog,
  ScriptSegment,
  VerificationPrompt,
} from '../_shared/types.ts'

/**
 * Assessment issuance and scoring.
 *
 * Two properties matter here, and both are enforced on this side of the wire:
 *
 *  1. **The answer key never reaches the browser.** The Task 2 scenario is
 *     generated and stored server-side; the client receives field *metadata*
 *     and the spoken script, but not the `expected` value of any field.
 *
 *  2. **The score is computed here, from the stored session.** Elapsed time is
 *     measured against the server's own `started_at`, so a client cannot claim
 *     to have typed 500 words in one second, and cannot submit a score at all.
 */

/** How long an issued session stays valid before it must be restarted. */
const SESSION_GRACE_SECONDS = 900

/* -------------------------------------------------------------------------- */
/*  Start                                                                      */
/* -------------------------------------------------------------------------- */

export interface StartResult {
  sessionId: string
  taskId: number
  assignmentId: number
  attemptNumber: number
  mode: 'certification' | 'practice'
  startedAt: string
  timeLimitSeconds: number
  /** Task 1 only. */
  passage?: { id: string; label: string; kind: string; text: string }
  /** Task 2 only — answer key removed. */
  scenario?: PublicScenario
}

/** The client-safe projection of a scenario: everything except the answers. */
export interface PublicScenario {
  id: string
  level: number
  fields: {
    key: string
    label: string
    type: string
    critical: boolean
    placeholder?: string
    options?: string[]
    hint?: string
  }[]
  segments: ScriptSegment[]
  verificationPrompts: { id: string; question: string; options: string[]; triggerAtProgress: number }[]
  wordsPerMinute: number
  estimatedDurationSeconds: number
  hasCorrections: boolean
  outOfOrder: boolean
}

/**
 * Strips everything a candidate must not see.
 *
 * Note what remains: `segments` still carries the spoken script, because the
 * browser's speech engine has to read it aloud — the candidate is *meant* to
 * receive that information, by ear. Switching to a hosted TTS provider removes
 * even that, since the client would then receive audio instead of text. See
 * docs/TTS_INTEGRATION.md.
 */
function toPublicScenario(scenario: AudioScenario): PublicScenario {
  return {
    id: scenario.id,
    level: scenario.level,
    fields: scenario.fields.map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      critical: f.critical,
      placeholder: f.placeholder,
      options: f.options,
      hint: f.hint,
    })),
    segments: scenario.segments,
    verificationPrompts: scenario.verificationPrompts.map((p) => ({
      id: p.id,
      question: p.question,
      options: p.options,
      triggerAtProgress: p.triggerAtProgress,
    })),
    wordsPerMinute: scenario.wordsPerMinute,
    estimatedDurationSeconds: scenario.estimatedDurationSeconds,
    hasCorrections: scenario.corrections.length > 0,
    outOfOrder: scenario.level >= 3,
  }
}

export async function startAssessment(
  ctx: Caller,
  input: { taskId: number; assignmentId: number; mode?: string },
): Promise<StartResult> {
  const candidateId = resolveCandidateId(ctx)
  const taskId = Number(input.taskId)
  const assignmentId = Number(input.assignmentId)
  const mode = input.mode === 'practice' ? 'practice' : 'certification'

  if (taskId !== 1 && taskId !== 2) throw badRequest('taskId must be 1 or 2')
  if (!Number.isInteger(assignmentId) || assignmentId < 1 || assignmentId > 5) {
    throw badRequest('assignmentId must be between 1 and 5')
  }

  const settings = await getSettings(ctx.db)
  const attempts = await listAttempts(ctx.db, candidateId)

  // Sequential unlocking is enforced here, not only in the UI — a hand-crafted
  // request cannot skip ahead to Assignment 5.
  if (mode === 'certification') {
    const progress = deriveProgress(attempts, {
      requireSequentialUnlock: settings.requireSequentialUnlock,
      requireTask1BeforeTask2: settings.requireTask1BeforeTask2,
      minAverageWpm: settings.minAverageWpm,
    })
    const target = progress.find((p) => p.taskId === taskId && p.assignmentId === assignmentId)
    if (!target || target.status === 'locked') {
      // Say which gate is holding them, rather than a generic refusal.
      if (taskId === 2 && settings.requireTask1BeforeTask2) {
        const t1 = task1Completion(attempts, settings.minAverageWpm)
        if (!t1.complete) {
          throw forbidden(
            t1.passedAll
              ? `Task 2 unlocks once your Task 1 average reaches ${settings.minAverageWpm} WPM. Yours is ${t1.averageWpm} WPM.`
              : 'Task 2 unlocks once all five Task 1 assignments are passed.',
          )
        }
      }
      throw forbidden('That assignment is locked. Pass the previous one first.')
    }
    if (!settings.unlimitedRetries && target.attempts >= settings.maxAttempts) {
      throw forbidden(
        `You have used all ${settings.maxAttempts} attempts. Ask your trainer to reset this assignment.`,
      )
    }
  }

  const assignment = getAssignment(taskId, assignmentId)
  const attemptNumber = (await countAttempts(ctx.db, candidateId, taskId, assignmentId, mode)) + 1

  // Abandon any session still open for this candidate; one at a time.
  await ctx.db
    .from('assessment_sessions')
    .delete()
    .eq('candidate_id', candidateId)
    .is('consumed_at', null)

  const startedAt = new Date()
  const expiresAt = new Date(
    startedAt.getTime() + (assignment.timeLimitSeconds + SESSION_GRACE_SECONDS) * 1000,
  )

  let passage: TypingPassage | null = null
  let scenario: AudioScenario | null = null

  if (taskId === 1) {
    // Passages are admin-editable, so the pool comes from the database.
    const pool = await activePassagePool(ctx.db, assignmentId)
    if (!pool.length) throw badRequest('No passages are configured for this assignment')
    // Rotate by attempt number so a retry never repeats the previous text.
    passage = pool[(Math.max(1, attemptNumber) - 1) % pool.length]
  } else {
    const level = assignment.audioLevel ?? 1
    const base = settings.audioLevels.find((l) => l.level === level) ?? settings.audioLevels[0]
    const config =
      assignmentId === 5
        ? { ...base, verificationPrompts: settings.verificationPromptFrequency }
        : base

    // Names, providers, amounts and the field roster are all admin-editable.
    const [pools, levelFields] = await Promise.all([
      resolvePools(ctx.db),
      resolveLevelFields(ctx.db),
    ])
    scenario = generateScenario(config, undefined, {
      pools,
      levelFields,
      nameSpelling: settings.nameSpelling,
      spellFields: settings.spellFields,
    })
  }

  const { data, error } = await ctx.db
    .from('assessment_sessions')
    .insert({
      candidate_id: candidateId,
      task_id: taskId,
      assignment_id: assignmentId,
      attempt_number: attemptNumber,
      mode,
      passage_id: passage?.id ?? null,
      // Snapshot, not a reference: an admin editing this passage mid-attempt
      // must not change what the candidate is scored against.
      passage,
      scenario,
      started_at: startedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .select('id, started_at')
    .maybeSingle()

  if (error) throw error
  if (!data) throw badRequest('Could not start the assessment')

  return {
    sessionId: data.id as string,
    taskId,
    assignmentId,
    attemptNumber,
    mode,
    startedAt: data.started_at as string,
    timeLimitSeconds: assignment.timeLimitSeconds,
    passage: passage
      ? { id: passage.id, label: passage.label, kind: passage.kind, text: passage.text }
      : undefined,
    scenario: scenario ? toPublicScenario(scenario) : undefined,
  }
}

/* -------------------------------------------------------------------------- */
/*  Abandon                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Releases an unsubmitted session.
 *
 * Called when a candidate exits an assessment deliberately, and best-effort on
 * tab close. Without it an abandoned session sits open until its expiry grace
 * elapses, and the trainer's live view keeps showing a candidate who left.
 *
 * The row is deleted rather than consumed: nothing was submitted, so there is
 * no attempt to tie it to, and deleting frees the candidate to start again.
 */
export async function abandonAssessment(
  ctx: Caller,
  input: { sessionId?: string },
): Promise<{ ok: true }> {
  const candidateId = resolveCandidateId(ctx)
  if (!input.sessionId) throw badRequest('sessionId is required')

  // Scoped to the caller and to unsubmitted sessions, so this can never delete
  // someone else's work or erase a completed attempt's session.
  const { error } = await ctx.db
    .from('assessment_sessions')
    .delete()
    .eq('id', input.sessionId)
    .eq('candidate_id', candidateId)
    .is('consumed_at', null)

  if (error) throw error
  return { ok: true }
}

/* -------------------------------------------------------------------------- */
/*  Submit                                                                     */
/* -------------------------------------------------------------------------- */

interface SubmitInput {
  sessionId?: string
  /** Task 1 */
  typedText?: string
  /**
   * Backspaces the client observed. Cannot be derived from the final text, so
   * it is reported rather than measured.
   *
   * Under-reporting is possible, but it can only ever *raise* the score back to
   * what it would have been with no backspace charge at all — it cannot push
   * accuracy above the honest character accuracy of the submitted text. The
   * count is also recorded for trainer review.
   */
  backspaces?: number
  /** Task 2 */
  answers?: Record<string, string>
  telemetry?: Partial<AudioAttemptTelemetry>
  /** Both — observational only, never scored. */
  integrity?: Partial<IntegrityLog>
}

export async function submitAssessment(ctx: Caller, raw: Record<string, unknown>) {
  const input = raw as SubmitInput
  const candidateId = resolveCandidateId(ctx)
  if (!input.sessionId) throw badRequest('sessionId is required')

  const { data: session, error } = await ctx.db
    .from('assessment_sessions')
    .select('*')
    .eq('id', input.sessionId)
    .maybeSingle()
  if (error) throw error
  if (!session) throw notFound('Assessment session not found')

  // The session must belong to the caller. Guessing another candidate's session
  // id gains nothing.
  if (session.candidate_id !== candidateId) {
    throw forbidden('That assessment session does not belong to you')
  }
  if (session.consumed_at) throw conflict('This assessment has already been submitted')

  const settings = await getSettings(ctx.db)
  const assignment = getAssignment(session.task_id, session.assignment_id)

  // Authoritative elapsed time: measured from the server's own clock, capped at
  // the assignment limit so a late submission cannot inflate the denominator.
  const startedAt = new Date(session.started_at as string)
  const completedAt = new Date()
  const elapsedSeconds = Math.min(
    Math.max(1, (completedAt.getTime() - startedAt.getTime()) / 1000),
    assignment.timeLimitSeconds,
  )

  const integrity: IntegrityLog = {
    blurCount: clampInt(input.integrity?.blurCount, 0, 9999),
    focusCount: clampInt(input.integrity?.focusCount, 0, 9999),
    pasteAttempts: clampInt(input.integrity?.pasteAttempts, 0, 9999),
    copyAttempts: clampInt(input.integrity?.copyAttempts, 0, 9999),
    events: (input.integrity?.events ?? []).slice(-100),
    flagged: false,
  }
  integrity.flagged =
    integrity.blurCount >= settings.flagBlurThreshold || integrity.pasteAttempts > 0

  const attempt =
    session.task_id === 1
      ? scoreTypingAttempt({ session, input, elapsedSeconds, settings, integrity, completedAt })
      : scoreAudioAttempt({ session, input, elapsedSeconds, settings, integrity, completedAt })

  // Consume the session before writing the attempt, so a duplicate submission
  // racing this one fails the `consumed_at` check rather than double-scoring.
  const { error: consumeError } = await ctx.db
    .from('assessment_sessions')
    .update({ consumed_at: completedAt.toISOString() })
    .eq('id', session.id)
    .is('consumed_at', null)
  if (consumeError) throw consumeError

  const { error: insertError } = await ctx.db
    .from('attempts')
    .insert(attemptToRow(attempt, session.id as string))
  if (insertError) throw insertError

  // Certification is re-evaluated after every submission, so the certificate
  // exists the moment the final gate is met rather than on the next page load.
  const certification = await maybeIssueCertificate(ctx, candidateId)

  return { attempt, certification }
}

/**
 * Issues the certificate once every gate passes. A no-op if one already exists,
 * or if any requirement is still outstanding.
 */
async function maybeIssueCertificate(ctx: Caller, candidateId: string) {
  const existing = await getCertification(ctx.db, candidateId)
  if (existing) return existing

  const settings = await getSettings(ctx.db)
  const attempts = await listAttempts(ctx.db, candidateId)
  const result = computeAssessmentResult(candidateId, attempts, settings)
  if (!result.certified) return null

  const candidate = await getCandidate(ctx.db, candidateId)
  const cert = buildCertification(candidateId, candidate.fullName, result)
  if (cert) await saveCertification(ctx.db, cert)
  return cert
}

function clampInt(value: unknown, min: number, max: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, Math.round(n)))
}

/* -------------------------------------------------------------------------- */
/*  Task 1 scoring                                                             */
/* -------------------------------------------------------------------------- */

interface ScoreArgs {
  session: Record<string, unknown>
  input: SubmitInput
  elapsedSeconds: number
  settings: Awaited<ReturnType<typeof getSettings>>
  integrity: IntegrityLog
  completedAt: Date
}

/**
 * Re-derives the typing metrics from the submitted text against the passage the
 * server issued. Nothing the client reported about its own performance is
 * trusted: the engine is replayed here over the final text.
 */
function scoreTypingAttempt({
  session,
  input,
  elapsedSeconds,
  settings,
  integrity,
  completedAt,
}: ScoreArgs): Attempt {
  const assignmentId = session.assignment_id as number

  // Prefer the snapshot taken at issue time. The id lookup is only a fallback
  // for sessions created before snapshots existed.
  const snapshot = session.passage as TypingPassage | null
  const passage =
    snapshot ??
    (PASSAGE_POOLS[assignmentId] ?? []).find((p) => p.id === (session.passage_id as string))
  if (!passage) throw badRequest('The issued passage could not be resolved')

  const typed = typeof input.typedText === 'string' ? input.typedText : ''
  if (typed.length > passage.text.length * 3) {
    throw badRequest('Submitted text is implausibly long for this passage')
  }

  // Replay the whole submission as a single input event, then score the result.
  // Character accuracy, WPM and completion are all derived here from the text
  // and the server's own elapsed time; only the backspace count is reported.
  let state = createTypingState(passage.text)
  state = applyInput(state, typed, { pauseThresholdMs: settings.pauseThresholdMs, now: 0 })

  // Replaying the whole submission as one event means the engine sees no
  // backspaces, so the client's count is supplied and clamped.
  const metrics = computeMetrics(state, elapsedSeconds, {
    backspaceWeight: settings.backspacePenaltyWeight,
    backspaces: clampInt(input.backspaces, 0, typed.length * 4 + 1000),
  })

  const result = scoreTask1(metrics, settings)
  const feedback = buildTask1Feedback(metrics, result.score, settings, assignmentId)

  return {
    id: uid('att'),
    candidateId: session.candidate_id as string,
    taskId: 1,
    assignmentId,
    attemptNumber: session.attempt_number as number,
    mode: session.mode as 'certification' | 'practice',
    startedAt: session.started_at as string,
    completedAt: completedAt.toISOString(),
    score: result.score,
    passed: result.passed,
    wpm: metrics.wpm,
    rawWpm: metrics.rawWpm,
    accuracy: metrics.accuracy,
    totalKeystrokes: metrics.totalKeystrokes,
    incorrectKeystrokes: metrics.incorrectKeystrokes,
    backspaces: metrics.backspaces,
    completionPercentage: metrics.completionPercentage,
    breakdown: result.breakdown,
    gates: result.gates,
    feedback,
    typingMetrics: metrics,
    passageId: passage.id,
    integrity,
  }
}

/* -------------------------------------------------------------------------- */
/*  Task 2 scoring                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Scores the captured answers against the scenario stored at start.
 *
 * The answer key lives only in that stored row, so correctness is decided here
 * and the client learns the expected values only in the response.
 */
function scoreAudioAttempt({
  session,
  input,
  elapsedSeconds,
  settings,
  integrity,
  completedAt,
}: ScoreArgs): Attempt {
  const scenario = session.scenario as AudioScenario | null
  if (!scenario) throw badRequest('The issued scenario could not be resolved')

  const assignmentId = session.assignment_id as number
  const isFinal = assignmentId === 5

  // Accept answers only for fields that exist, and cap their length.
  const answers: Record<string, string> = {}
  for (const field of scenario.fields) {
    const value = input.answers?.[field.key]
    answers[field.key] = typeof value === 'string' ? value.slice(0, 200) : ''
  }

  const telemetry = normaliseTelemetry(input.telemetry, scenario, answers, elapsedSeconds)
  const result = scoreTask2(scenario, answers, telemetry, settings, isFinal)
  const feedback = buildTask2Feedback(
    result,
    settings,
    assignmentId,
    scenario.corrections.length > 0,
    scenario.verificationPrompts.length,
  )

  return {
    id: uid('att'),
    candidateId: session.candidate_id as string,
    taskId: 2,
    assignmentId,
    attemptNumber: session.attempt_number as number,
    mode: session.mode as 'certification' | 'practice',
    startedAt: session.started_at as string,
    completedAt: completedAt.toISOString(),
    score: result.score,
    passed: result.passed,
    dataAccuracy: result.dataAccuracy,
    criticalDataAccuracy: result.criticalDataAccuracy,
    multitaskingScore: result.multitaskingScore,
    correctionScore: result.correctionScore,
    listeningScore: result.listeningScore,
    totalKeystrokes: Object.values(answers).reduce((n, v) => n + v.length, 0),
    incorrectKeystrokes: 0,
    backspaces: telemetry.fieldNavigationCount,
    completionPercentage: result.completionPercentage,
    breakdown: result.breakdown,
    gates: result.gates,
    feedback,
    audioTelemetry: telemetry,
    scenarioId: scenario.id,
    integrity,
    // The answer key is returned only now that the attempt is closed, so the
    // result screen can show a field-by-field review.
    fieldResults: result.fieldResults,
  } as Attempt & { fieldResults: typeof result.fieldResults }
}

/**
 * Rebuilds the telemetry from the client's report, discarding anything it is
 * not entitled to assert.
 *
 * Verification answers are re-graded here against the stored prompts — the
 * client's own `correct` flag is ignored. Timing signals (when a field was
 * filled relative to the audio) are inherently client-observed and are accepted
 * within bounds; they only influence the listening/multitasking component.
 */
function normaliseTelemetry(
  reported: Partial<AudioAttemptTelemetry> | undefined,
  scenario: AudioScenario,
  answers: Record<string, string>,
  elapsedSeconds: number,
): AudioAttemptTelemetry {
  const promptsById = new Map<string, VerificationPrompt>(
    scenario.verificationPrompts.map((p) => [p.id, p]),
  )

  const verificationAnswers = (reported?.verificationAnswers ?? [])
    .filter((a) => promptsById.has(a.promptId))
    .slice(0, scenario.verificationPrompts.length)
    .map((a) => ({
      promptId: a.promptId,
      answer: String(a.answer ?? '').slice(0, 100),
      // Re-graded server-side against the stored prompt.
      correct: promptsById.get(a.promptId)!.correctAnswer === a.answer,
      answeredAtProgress: clamp01(a.answeredAtProgress),
    }))

  const fields: AudioAttemptTelemetry['fields'] = {}
  for (const field of scenario.fields) {
    const r = reported?.fields?.[field.key]
    const value = answers[field.key] ?? ''
    fields[field.key] = {
      key: field.key,
      firstInputAt: null,
      lastEditAt: null,
      timeOnFieldMs: clampNumber(r?.timeOnFieldMs, 0, 3_600_000),
      corrections: clampNumber(r?.corrections, 0, 500),
      visits: clampNumber(r?.visits, 0, 500),
      audioProgressAtEntry: r?.audioProgressAtEntry == null ? null : clamp01(r.audioProgressAtEntry),
      audioProgressAtLastEdit:
        r?.audioProgressAtLastEdit == null ? null : clamp01(r.audioProgressAtLastEdit),
      finalValue: value,
      skipped: value.trim() === '',
      correct: false,
      appliedSpokenCorrection:
        field.supersededValue !== undefined
          ? value.trim() !== '' &&
            value.trim().toLowerCase() !== field.supersededValue.trim().toLowerCase()
          : undefined,
    }
  }

  return {
    fields,
    fieldNavigationCount: clampNumber(reported?.fieldNavigationCount, 0, 5000),
    totalPauseMs: clampNumber(reported?.totalPauseMs, 0, 3_600_000),
    totalCompletionMs: Math.round(elapsedSeconds * 1000),
    verificationAnswers,
    blurCount: clampNumber(reported?.blurCount, 0, 9999),
    pasteAttempts: clampNumber(reported?.pasteAttempts, 0, 9999),
    replaysUsed: clampNumber(reported?.replaysUsed, 0, 100),
  }
}

function clamp01(v: unknown): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

function clampNumber(v: unknown, min: number, max: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}
