import * as React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, Flag, Headphones, ShieldAlert } from 'lucide-react'
import type { Attempt, AudioAttemptTelemetry, FieldTelemetry, VerificationPrompt } from '@/types'
import { getAssignment } from '@/data/tasks'
import { SegmentSpeechEngine, resolveTTSProvider } from '@/audio/tts'
import { scoreTask2 } from '@/engine/scoring'
import { buildTask2Feedback } from '@/engine/feedback'
import { classifyRisk } from '@/engine/certification'
import { useAppStore } from '@/store/appStore'
import { AssessmentShell, DesktopRecommendedNotice } from '@/components/layout/AppShell'
import { AudioPlayer } from '@/components/audio/AudioPlayer'
import { CaptureSummary, ScenarioForm } from '@/components/audio/ScenarioForm'
import { VerificationPromptCard } from '@/components/audio/VerificationPromptCard'
import { DifficultyBadge } from '@/components/shared'
import { Badge, Button, Card, Dialog, Progress } from '@/components/ui'
import { clipboardGuards, useIntegrityMonitor } from '@/hooks/useIntegrityMonitor'
import { cn, formatDuration } from '@/lib/utils'

/**
 * Task 2 assessment runner.
 *
 * Orchestrates the generated audio, the structured capture form, inline
 * verification prompts and the full interaction telemetry that Task 2 scoring
 * depends on (time per field, entry timing relative to audio progress,
 * correction counts, navigation counts, skipped fields).
 */
export default function Task2Runner() {
  const { assignmentId: rawId } = useParams()
  const assignmentId = Number(rawId ?? 1)
  const navigate = useNavigate()

  const activeSession = useAppStore((s) => s.activeSession)
  const settings = useAppStore((s) => s.settings)
  const submitAttempt = useAppStore((s) => s.submitAttempt)
  const abandonSession = useAppStore((s) => s.abandonSession)
  const publishLive = useAppStore((s) => s.publishLive)
  const clearLive = useAppStore((s) => s.clearLive)

  const assignment = getAssignment(2, assignmentId)
  const scenario = activeSession?.scenario
  const isCertification = activeSession?.mode === 'certification'
  const isFinal = assignmentId === 5

  // Practice mode always allows replay; certification follows the trainer setting.
  const replayAllowed = activeSession?.mode === 'practice' || settings.replayAllowed
  const pauseAllowed = activeSession?.mode === 'practice' || settings.pauseAllowed

  /* ---- State ------------------------------------------------------------ */
  const [values, setValues] = React.useState<Record<string, string>>({})
  const [progress, setProgress] = React.useState(0)
  const [elapsedAudio, setElapsedAudio] = React.useState(0)
  const [isPlaying, setIsPlaying] = React.useState(false)
  const [hasStarted, setHasStarted] = React.useState(false)
  const [ended, setEnded] = React.useState(false)
  const [started, setStarted] = React.useState(false)
  const [sessionElapsed, setSessionElapsed] = React.useState(0)
  const [replaysUsed, setReplaysUsed] = React.useState(0)
  const [confirmExit, setConfirmExit] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  /* Set synchronously at the start of submission. `submitting` state is not
     reliable here: the Zustand write that clears `activeSession` can trigger a
     render before the React state update is flushed, which would let the guard
     below bounce the candidate off the result screen. */
  const submittedRef = React.useRef(false)
  const [ttsWarning, setTtsWarning] = React.useState<string | null>(null)

  const [activePrompt, setActivePrompt] = React.useState<VerificationPrompt | null>(null)
  const [answeredPrompts, setAnsweredPrompts] = React.useState<
    AudioAttemptTelemetry['verificationAnswers']
  >([])

  /* ---- Refs (telemetry must not trigger re-renders) --------------------- */
  const engineRef = React.useRef<SegmentSpeechEngine | null>(null)
  const telemetryRef = React.useRef<Record<string, FieldTelemetry>>({})
  const navCountRef = React.useRef(0)
  const firedPromptsRef = React.useRef<Set<string>>(new Set())
  const progressRef = React.useRef(0)
  const startRef = React.useRef<number | null>(null)

  const integrity = useIntegrityMonitor({
    enabled: Boolean(isCertification),
    trackTabSwitching: settings.trackTabSwitching,
    flagBlurThreshold: settings.flagBlurThreshold,
  })

  /* ---- Guard ------------------------------------------------------------
     Skipped once submission has started: submitting clears `activeSession`,
     and without this the guard would race the navigation to the result screen. */
  React.useEffect(() => {
    if (submittedRef.current) return
    if (!activeSession || activeSession.taskId !== 2) {
      navigate('/task/2', { replace: true })
    }
  }, [activeSession, navigate])

  /* ---- Initialise telemetry for the scenario's fields ------------------- */
  React.useEffect(() => {
    if (!scenario) return
    const init: Record<string, FieldTelemetry> = {}
    for (const field of scenario.fields) {
      init[field.key] = {
        key: field.key,
        firstInputAt: null,
        lastEditAt: null,
        timeOnFieldMs: 0,
        corrections: 0,
        visits: 0,
        audioProgressAtEntry: null,
        audioProgressAtLastEdit: null,
        finalValue: '',
        skipped: true,
        correct: false,
      }
    }
    telemetryRef.current = init
    setValues({})
  }, [scenario])

  /* ---- Speech engine ---------------------------------------------------- */
  React.useEffect(() => {
    const engine = new SegmentSpeechEngine(resolveTTSProvider())
    engineRef.current = engine
    return () => engine.stop()
  }, [])

  React.useEffect(() => {
    if (!scenario || !engineRef.current) return
    engineRef.current.load(scenario.segments, scenario.estimatedDurationSeconds, {
      speed: settings.playbackSpeed,
      voice: settings.voiceURI ?? undefined,
    })
  }, [scenario, settings.playbackSpeed, settings.voiceURI])

  /* ---- Session timer ---------------------------------------------------- */
  React.useEffect(() => {
    if (!started || submitting) return
    const id = window.setInterval(() => {
      if (startRef.current !== null) {
        setSessionElapsed((performance.now() - startRef.current) / 1000)
      }
    }, 250)
    return () => window.clearInterval(id)
  }, [started, submitting])

  const remaining = Math.max(0, assignment.timeLimitSeconds - sessionElapsed)

  /* ---- Verification prompt scheduling ----------------------------------- */
  const handleProgress = React.useCallback(
    (p: number, elapsed: number) => {
      progressRef.current = p
      setProgress(p)
      setElapsedAudio(elapsed)

      if (!scenario) return
      // Fire the first unfired prompt whose trigger point has been reached.
      const due = scenario.verificationPrompts.find(
        (vp) => !firedPromptsRef.current.has(vp.id) && p >= vp.triggerAtProgress,
      )
      if (due) {
        firedPromptsRef.current.add(due.id)
        setActivePrompt(due)
        // Audio only pauses if the trainer configured it to — the default is
        // that the call keeps running while the candidate answers.
        if (pauseAllowed && settings.pauseAllowed) {
          engineRef.current?.pause()
          setIsPlaying(false)
        }
      }
    },
    [scenario, pauseAllowed, settings.pauseAllowed],
  )

  const playAudio = () => {
    if (!engineRef.current) return
    setHasStarted(true)
    setIsPlaying(true)
    engineRef.current.play({
      onProgress: handleProgress,
      onEnd: () => {
        setIsPlaying(false)
        setEnded(true)
        setProgress(1)
        progressRef.current = 1
      },
      onError: (err) =>
        setTtsWarning(
          `Speech synthesis reported an issue (${err.message}). The transcript timeline will continue.`,
        ),
    })
  }

  const pauseAudio = () => {
    engineRef.current?.pause()
    setIsPlaying(false)
  }

  const replayAudio = () => {
    if (!engineRef.current || !scenario) return
    setReplaysUsed((n) => n + 1)
    firedPromptsRef.current.clear()
    engineRef.current.stop()
    engineRef.current.load(scenario.segments, scenario.estimatedDurationSeconds, {
      speed: settings.playbackSpeed,
      voice: settings.voiceURI ?? undefined,
    })
    setEnded(false)
    setProgress(0)
    progressRef.current = 0
    setHasStarted(false)
    // Next tick so the engine's internal reset lands before replay.
    requestAnimationFrame(playAudio)
  }

  /* ---- Field interaction ------------------------------------------------ */
  const onFocusField = React.useCallback((key: string) => {
    const t = telemetryRef.current[key]
    if (!t) return
    t.visits += 1
    navCountRef.current += 1
  }, [])

  const onChangeField = React.useCallback((key: string, value: string) => {
    const now = performance.now()
    const t = telemetryRef.current[key]
    if (t) {
      if (t.firstInputAt === null) {
        t.firstInputAt = now
        t.audioProgressAtEntry = progressRef.current
      } else if (t.finalValue && value !== t.finalValue) {
        // Any edit after the first committed value is a correction.
        t.corrections += 1
      }
      t.lastEditAt = now
      t.audioProgressAtLastEdit = progressRef.current
      t.timeOnFieldMs = now - (t.firstInputAt ?? now)
      t.finalValue = value
      t.skipped = value.trim() === ''
    }
    setValues((prev) => ({ ...prev, [key]: value }))
  }, [])

  const answerPrompt = (answer: string) => {
    if (!activePrompt) return
    setAnsweredPrompts((prev) => [
      ...prev,
      {
        promptId: activePrompt.id,
        answer,
        correct: answer === activePrompt.correctAnswer,
        answeredAtProgress: progressRef.current,
      },
    ])
    setActivePrompt(null)
    if (!isPlaying && !ended && pauseAllowed && settings.pauseAllowed) {
      engineRef.current?.play({ onProgress: handleProgress })
      setIsPlaying(true)
    }
  }

  /* ---- Live feed to trainer monitoring ---------------------------------- */
  const candidateId = activeSession?.candidateId
  const candidateName = useAppStore((s) =>
    candidateId ? (s.candidates.find((c) => c.id === candidateId)?.fullName ?? '') : '',
  )

  React.useEffect(() => {
    if (!started || !candidateId || !scenario || submitting) return
    const id = window.setInterval(() => {
      const filled = scenario.fields.filter((f) => (values[f.key] ?? '').trim()).length
      const captureRatio = filled / (scenario.fields.length || 1)
      // Provisional score during the attempt — capture progress only, since
      // correctness must not be evaluated (or leaked) before submission.
      const provisional = Math.round(captureRatio * 100)
      publishLive({
        candidateId,
        candidateName,
        taskId: 2,
        assignmentId,
        wpm: 0,
        accuracy: 0,
        progress: Math.round(captureRatio * 100),
        currentScore: provisional,
        risk: classifyRisk(provisional, provisional >= settings.passingScore, 0),
        updatedAt: new Date().toISOString(),
      })
    }, 2500)
    return () => window.clearInterval(id)
  }, [
    started,
    candidateId,
    candidateName,
    assignmentId,
    scenario,
    values,
    settings.passingScore,
    publishLive,
    submitting,
  ])

  /* ---- Submission ------------------------------------------------------- */
  const handleSubmit = React.useCallback(
    (reason: 'manual' | 'time') => {
      if (submitting || !activeSession || !scenario) return
      submittedRef.current = true
      setSubmitting(true)
      engineRef.current?.stop()

      const totalMs =
        startRef.current !== null ? performance.now() - startRef.current : sessionElapsed * 1000

      // Finalise telemetry: mark which spoken corrections were actually applied.
      const fields: Record<string, FieldTelemetry> = {}
      for (const [key, t] of Object.entries(telemetryRef.current)) {
        const field = scenario.fields.find((f) => f.key === key)
        const applied =
          field?.supersededValue !== undefined
            ? t.finalValue.trim() !== '' &&
              t.finalValue.trim().toLowerCase() !== field.supersededValue.trim().toLowerCase()
            : undefined
        fields[key] = { ...t, appliedSpokenCorrection: applied }
      }

      const telemetry: AudioAttemptTelemetry = {
        fields,
        fieldNavigationCount: navCountRef.current,
        totalPauseMs: 0,
        totalCompletionMs: Math.round(totalMs),
        verificationAnswers: answeredPrompts,
        blurCount: integrity.log.blurCount,
        pasteAttempts: integrity.log.pasteAttempts,
        replaysUsed,
      }

      const result = scoreTask2(scenario, values, telemetry, settings, isFinal)
      const feedback = buildTask2Feedback(
        result,
        settings,
        assignmentId,
        scenario.corrections.length > 0,
        scenario.verificationPrompts.length,
      )

      const attempt: Omit<Attempt, 'id'> = {
        candidateId: activeSession.candidateId,
        taskId: 2,
        assignmentId,
        attemptNumber: activeSession.attemptNumber,
        mode: activeSession.mode,
        startedAt: activeSession.startedAt,
        completedAt: new Date().toISOString(),
        score: result.score,
        passed: result.passed,
        dataAccuracy: result.dataAccuracy,
        criticalDataAccuracy: result.criticalDataAccuracy,
        multitaskingScore: result.multitaskingScore,
        correctionScore: result.correctionScore,
        listeningScore: result.listeningScore,
        totalKeystrokes: Object.values(fields).reduce((n, f) => n + f.finalValue.length, 0),
        incorrectKeystrokes: 0,
        backspaces: Object.values(fields).reduce((n, f) => n + f.corrections, 0),
        completionPercentage: result.completionPercentage,
        breakdown: result.breakdown,
        gates: result.gates,
        feedback,
        audioTelemetry: telemetry,
        scenarioId: scenario.id,
        integrity: {
          ...integrity.log,
          events: [
            ...integrity.log.events,
            { at: new Date().toISOString(), type: `submitted:${reason}` },
          ],
        },
      }

      clearLive(activeSession.candidateId)
      submitAttempt(attempt)
      navigate('/result', { replace: true })
    },
    [
      submitting,
      activeSession,
      scenario,
      sessionElapsed,
      answeredPrompts,
      integrity.log,
      replaysUsed,
      values,
      settings,
      isFinal,
      assignmentId,
      clearLive,
      submitAttempt,
      navigate,
    ],
  )

  React.useEffect(() => {
    if (started && remaining <= 0 && !submitting) handleSubmit('time')
  }, [started, remaining, submitting, handleSubmit])

  const begin = () => {
    startRef.current = performance.now()
    setStarted(true)
  }

  const exit = () => {
    if (started) {
      setConfirmExit(true)
    } else {
      abandonSession()
      navigate('/task/2')
    }
  }

  if (!activeSession || activeSession.taskId !== 2 || !scenario) return null

  const guards = clipboardGuards(
    Boolean(isCertification) && settings.blockPaste,
    integrity.recordPaste,
    integrity.recordCopy,
  )

  return (
    <AssessmentShell
      onExit={exit}
      header={
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          <div className="flex min-w-0 items-center gap-2">
            <Headphones className="size-4 shrink-0 text-brand-700" />
            <span className="truncate text-sm font-bold text-navy-900">
              Task 2 · Assignment {assignmentId} — {assignment.title}
            </span>
          </div>
          <DifficultyBadge difficulty={assignment.difficulty} />
          {activeSession.mode === 'practice' ? (
            <Badge variant="accent">Practice</Badge>
          ) : (
            <Badge variant="muted">Certification</Badge>
          )}
          <Badge variant="outline">Attempt {activeSession.attemptNumber}</Badge>
          <Badge variant="outline">Level {scenario.level}</Badge>
          <span
            className={cn(
              'ml-auto metric-value text-base',
              remaining <= 45 ? 'text-red-700' : 'text-navy-900',
            )}
          >
            {formatDuration(remaining)}
          </span>
        </div>
      }
    >
      <DesktopRecommendedNotice />

      {!started ? (
        <StartPanel
          assignmentTitle={assignment.title}
          description={assignment.description}
          objectives={assignment.objectives}
          fieldCount={scenario.fields.length}
          criticalCount={scenario.fields.filter((f) => f.critical).length}
          duration={scenario.estimatedDurationSeconds}
          timeLimit={assignment.timeLimitSeconds}
          wpm={scenario.wordsPerMinute}
          corrections={scenario.corrections.length}
          prompts={scenario.verificationPrompts.length}
          outOfOrder={scenario.level >= 3}
          replayAllowed={replayAllowed}
          pauseAllowed={pauseAllowed}
          mode={activeSession.mode}
          settings={{
            passingScore: settings.passingScore,
            minDataAccuracy: settings.minDataAccuracy,
            minCriticalAccuracy: settings.minCriticalAccuracy,
            minMultitaskingScore: settings.minMultitaskingScore,
          }}
          isFinal={isFinal}
          onStart={begin}
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          {/* ---- Left: audio + status ---- */}
          <div className="flex flex-col gap-3">
            <AudioPlayer
              progress={progress}
              elapsedSeconds={elapsedAudio}
              durationSeconds={scenario.estimatedDurationSeconds}
              isPlaying={isPlaying}
              hasStarted={hasStarted}
              ended={ended}
              pauseAllowed={pauseAllowed}
              replayAllowed={replayAllowed}
              replaysUsed={replaysUsed}
              wordsPerMinute={scenario.wordsPerMinute}
              onPlay={playAudio}
              onPause={pauseAudio}
              onReplay={replayAudio}
            />

            {activePrompt && (
              <VerificationPromptCard
                prompt={activePrompt}
                onAnswer={answerPrompt}
                audioContinues={isPlaying}
              />
            )}

            <Card className="p-4">
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Session status
              </h3>
              <CaptureSummary fields={scenario.fields} values={values} className="mb-3" />
              <div className="space-y-2">
                <div>
                  <div className="mb-1 flex items-baseline justify-between text-[11px] text-muted-foreground">
                    <span>Time used</span>
                    <span className="tabular text-navy-800">
                      {formatDuration(sessionElapsed)} / {formatDuration(assignment.timeLimitSeconds)}
                    </span>
                  </div>
                  <Progress
                    value={(sessionElapsed / assignment.timeLimitSeconds) * 100}
                    size="sm"
                    tone={remaining <= 45 ? 'red' : 'navy'}
                  />
                </div>
                {scenario.verificationPrompts.length > 0 && (
                  <div className="flex items-baseline justify-between text-[11px] text-muted-foreground">
                    <span>Verification prompts answered</span>
                    <span className="tabular text-navy-800">
                      {answeredPrompts.length}/{scenario.verificationPrompts.length}
                    </span>
                  </div>
                )}
              </div>

              {isCertification && settings.blockPaste && (
                <p className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-amber-700">
                  <ShieldAlert className="size-3" />
                  Paste disabled for this attempt
                </p>
              )}
              {ttsWarning && (
                <p className="mt-2 flex items-start gap-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                  {ttsWarning}
                </p>
              )}
              {integrity.log.flagged && isCertification && (
                <p className="mt-2 flex items-start gap-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                  Focus loss recorded ({integrity.log.blurCount}). Logged for trainer review.
                </p>
              )}

              <Button className="mt-4 w-full" onClick={() => handleSubmit('manual')}>
                <Flag className="size-4" />
                Submit capture
              </Button>
            </Card>
          </div>

          {/* ---- Right: capture form ---- */}
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Verification form
              </h2>
              {scenario.level >= 3 && (
                <Badge variant="warning">Information may arrive out of order</Badge>
              )}
              {scenario.corrections.length > 0 && (
                <Badge variant="warning">Listen for spoken corrections</Badge>
              )}
            </div>
            <ScenarioForm
              fields={scenario.fields}
              values={values}
              onChange={onChangeField}
              onFocusField={onFocusField}
              guards={guards}
            />
          </div>
        </div>
      )}

      <Dialog
        open={confirmExit}
        onClose={() => setConfirmExit(false)}
        title="Abandon this attempt?"
        description="Nothing will be recorded. A new randomised scenario will be generated when you restart."
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmExit(false)}>
              Continue attempt
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                engineRef.current?.stop()
                abandonSession()
                navigate('/task/2')
              }}
            >
              Abandon attempt
            </Button>
          </>
        }
      />
    </AssessmentShell>
  )
}

/* -------------------------------------------------------------------------- */
/*  Pre-flight panel                                                           */
/* -------------------------------------------------------------------------- */

function StartPanel(props: {
  assignmentTitle: string
  description: string
  objectives: string[]
  fieldCount: number
  criticalCount: number
  duration: number
  timeLimit: number
  wpm: number
  corrections: number
  prompts: number
  outOfOrder: boolean
  replayAllowed: boolean
  pauseAllowed: boolean
  mode: string
  isFinal: boolean
  settings: {
    passingScore: number
    minDataAccuracy: number
    minCriticalAccuracy: number
    minMultitaskingScore: number
  }
  onStart: () => void
}) {
  return (
    <Card className="mx-auto max-w-3xl p-6 sm:p-8">
      <p className="text-[11px] font-bold uppercase tracking-widest text-brand-700">
        {props.mode === 'practice'
          ? 'Practice run — not recorded for certification'
          : 'Certification attempt'}
      </p>
      <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-navy-900">
        {props.assignmentTitle}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{props.description}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            What is measured
          </h3>
          <ul className="space-y-1.5">
            {props.objectives.map((o) => (
              <li key={o} className="flex gap-2 text-sm text-navy-800">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-600" />
                {o}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-border bg-muted/40 p-4">
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            This scenario
          </h3>
          <dl className="space-y-1.5 text-sm">
            <Row label="Fields to capture" value={String(props.fieldCount)} />
            <Row label="Critical fields" value={String(props.criticalCount)} />
            <Row label="Speaking pace" value={`${props.wpm} WPM`} />
            <Row label="Audio length" value={`≈ ${formatDuration(props.duration)}`} />
            <Row label="Time limit" value={formatDuration(props.timeLimit)} />
            {props.corrections > 0 && (
              <Row label="Spoken corrections" value={String(props.corrections)} />
            )}
            {props.prompts > 0 && (
              <Row label="Verification prompts" value={String(props.prompts)} />
            )}
          </dl>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        <Badge variant={props.replayAllowed ? 'accent' : 'muted'}>
          {props.replayAllowed ? 'Replay allowed' : 'No replay'}
        </Badge>
        <Badge variant={props.pauseAllowed ? 'accent' : 'muted'}>
          {props.pauseAllowed ? 'Pause allowed' : 'Pause disabled'}
        </Badge>
        <Badge variant="muted">No rewind</Badge>
        <Badge variant="muted">No skip forward</Badge>
        {props.outOfOrder && <Badge variant="warning">Out-of-order information</Badge>}
        {props.corrections > 0 && <Badge variant="warning">Spoken corrections</Badge>}
      </div>

      <div className="mt-5 rounded-lg border border-border bg-card p-4">
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Passing standard
        </h3>
        <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          <Row label="Minimum score" value={`${props.settings.passingScore} / 100`} />
          <Row label="Data accuracy" value={`${props.settings.minDataAccuracy}%`} />
          <Row label="Critical-data accuracy" value={`${props.settings.minCriticalAccuracy}%`} />
          {props.isFinal && (
            <Row label="Multitasking score" value={`${props.settings.minMultitaskingScore}%`} />
          )}
        </dl>
      </div>

      <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <p className="font-semibold">Before you begin</p>
        <p className="mt-1 leading-relaxed">
          Put your headset on and confirm your volume. The audio is generated fresh for this attempt
          — no two attempts use the same values. Once the call starts you cannot rewind or skip, so
          capture information as you hear it.
        </p>
      </div>

      <Button size="xl" className="mt-6 w-full" onClick={props.onStart}>
        Enter assessment
      </Button>
    </Card>
  )
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-baseline justify-between gap-4">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="metric-value text-sm text-navy-900">{value}</dd>
  </div>
)
