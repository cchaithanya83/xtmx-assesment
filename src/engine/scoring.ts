import type {
  AudioAttemptTelemetry,
  AudioScenario,
  GateResult,
  ScoreBreakdown,
  TrainerSettings,
  TypingMetrics,
} from '@/types'
import { TASK1_WEIGHTS, TASK2_WEIGHTS } from '@/data/settings'
import { clamp, normaliseAnswer, round, similarity } from '@/lib/utils'

/* -------------------------------------------------------------------------- */
/*  Task 1 — typing score                                                      */
/* -------------------------------------------------------------------------- */

export interface Task1ScoreResult {
  score: number
  breakdown: ScoreBreakdown[]
  gates: GateResult[]
  passed: boolean
}

/**
 * Typing speed points, resolved against the trainer-editable band table.
 * Bands are sorted descending by `minWpm`; the first match wins.
 */
export function scoreWpm(wpm: number, settings: TrainerSettings): number {
  const bands = [...settings.wpmBands].sort((a, b) => b.minWpm - a.minWpm)
  for (const band of bands) {
    if (wpm >= band.minWpm) return band.points
  }
  return 0
}

/**
 * Task 1 assignment score, out of 100.
 *
 *   Typing Speed        30
 *   Accuracy            40
 *   Data/Number Accuracy 20
 *   Completion          10
 */
export function scoreTask1(
  metrics: TypingMetrics,
  settings: TrainerSettings,
): Task1ScoreResult {
  const speedPoints = clamp(scoreWpm(metrics.wpm, settings), 0, TASK1_WEIGHTS.speed)

  // Accuracy is scaled from the pass threshold upward so 85% ≈ 0.66 of the
  // band and 100% earns full marks — below the threshold degrades sharply.
  const accuracyPoints = scaleAboveThreshold(
    metrics.accuracy,
    settings.minAccuracy,
    TASK1_WEIGHTS.accuracy,
  )

  const dataPoints = scaleAboveThreshold(
    metrics.numericAccuracy,
    settings.minAccuracy,
    TASK1_WEIGHTS.dataAccuracy,
  )

  const completionPoints =
    (clamp(metrics.completionPercentage, 0, 100) / 100) * TASK1_WEIGHTS.completion

  const breakdown: ScoreBreakdown[] = [
    { label: 'Typing Speed', earned: round(speedPoints, 1), max: TASK1_WEIGHTS.speed },
    { label: 'Accuracy', earned: round(accuracyPoints, 1), max: TASK1_WEIGHTS.accuracy },
    { label: 'Data / Number Accuracy', earned: round(dataPoints, 1), max: TASK1_WEIGHTS.dataAccuracy },
    { label: 'Completion', earned: round(completionPoints, 1), max: TASK1_WEIGHTS.completion },
  ]

  const score = round(breakdown.reduce((sum, b) => sum + b.earned, 0))

  const gates: GateResult[] = [
    {
      label: 'Overall score',
      actual: score,
      required: settings.passingScore,
      unit: 'pts',
      passed: score >= settings.passingScore,
    },
    {
      label: 'Typing speed',
      actual: metrics.wpm,
      required: settings.minWpm,
      unit: 'wpm',
      passed: metrics.wpm >= settings.minWpm,
    },
    {
      label: 'Typing accuracy',
      actual: metrics.accuracy,
      required: settings.minAccuracy,
      unit: '%',
      passed: metrics.accuracy >= settings.minAccuracy,
    },
  ]

  return { score, breakdown, gates, passed: gates.every((g) => g.passed) }
}

/**
 * Maps a percentage onto a points band such that:
 *   value = 100        → full points
 *   value = threshold  → 2/3 of the band
 *   value = 0          → 0
 * This keeps a passing-but-imperfect result comfortably scoring while making
 * sub-threshold work fall away quickly.
 */
function scaleAboveThreshold(value: number, threshold: number, maxPoints: number): number {
  const v = clamp(value, 0, 100)
  const pivot = maxPoints * (2 / 3)
  if (v >= threshold) {
    const span = Math.max(1, 100 - threshold)
    return pivot + ((v - threshold) / span) * (maxPoints - pivot)
  }
  return (v / Math.max(1, threshold)) * pivot
}

/* -------------------------------------------------------------------------- */
/*  Task 2 — audio / listening score                                           */
/* -------------------------------------------------------------------------- */

export interface Task2ScoreResult {
  score: number
  breakdown: ScoreBreakdown[]
  gates: GateResult[]
  passed: boolean
  dataAccuracy: number
  criticalDataAccuracy: number
  listeningScore: number
  correctionScore: number
  multitaskingScore: number
  completionPercentage: number
  /** Per-field correctness, for the result screen's field review table. */
  fieldResults: FieldResult[]
}

export interface FieldResult {
  key: string
  label: string
  expected: string
  actual: string
  correct: boolean
  critical: boolean
  /** 0–1 similarity — a near-miss is shown differently from a blank. */
  similarity: number
  skipped: boolean
  appliedSpokenCorrection?: boolean
}

/**
 * Task 2 assignment score, out of 100.
 *
 *   Information Capture     25   — did they get a value into each field at all
 *   Data Accuracy           25   — are non-critical values right
 *   Critical Data Accuracy  20   — are critical values right (heavier penalty)
 *   Listening / Multitasking 15  — verification prompts + entry latency
 *   Correction Handling     10   — did they apply spoken corrections
 *   Completion               5   — finished within the budget
 */
export function scoreTask2(
  scenario: AudioScenario,
  answers: Record<string, string>,
  telemetry: AudioAttemptTelemetry,
  settings: TrainerSettings,
  isFinalAssignment: boolean,
): Task2ScoreResult {
  const fieldResults: FieldResult[] = scenario.fields.map((field) => {
    const raw = answers[field.key] ?? ''
    const actual = normaliseAnswer(raw, field.type)
    const expected = normaliseAnswer(field.expected, field.type)
    const correct = actual === expected
    const telem = telemetry.fields[field.key]
    return {
      key: field.key,
      label: field.label,
      expected: field.expected,
      actual: raw,
      correct,
      critical: field.critical,
      similarity: similarity(actual, expected),
      skipped: raw.trim() === '',
      appliedSpokenCorrection: telem?.appliedSpokenCorrection,
    }
  })

  const total = fieldResults.length || 1
  const filled = fieldResults.filter((f) => !f.skipped).length

  const criticalFields = fieldResults.filter((f) => f.critical)
  const nonCriticalFields = fieldResults.filter((f) => !f.critical)

  // ---- Information capture (25) -----------------------------------------
  const capturePoints = (filled / total) * TASK2_WEIGHTS.capture

  // ---- Data accuracy (25) ------------------------------------------------
  // Partial credit for near-misses (one transposed digit shouldn't zero a field)
  // but only above 0.85 similarity, and never for critical fields.
  const dataPool = nonCriticalFields.length ? nonCriticalFields : fieldResults
  const dataScore =
    dataPool.reduce((sum, f) => sum + (f.correct ? 1 : f.similarity >= 0.85 ? 0.5 : 0), 0) /
    (dataPool.length || 1)
  const dataPoints = dataScore * TASK2_WEIGHTS.dataAccuracy

  // ---- Critical data accuracy (20) — exact match only --------------------
  const criticalScore = criticalFields.length
    ? criticalFields.filter((f) => f.correct).length / criticalFields.length
    : 1
  const criticalPoints = criticalScore * TASK2_WEIGHTS.criticalAccuracy

  // ---- Listening / multitasking (15) -------------------------------------
  const promptTotal = scenario.verificationPrompts.length
  const promptCorrect = telemetry.verificationAnswers.filter((a) => a.correct).length
  const promptScore = promptTotal ? promptCorrect / promptTotal : 1

  // Concurrency: fraction of fields first filled while the audio was still
  // playing. Working *during* the call is the skill being measured.
  const concurrentEntries = Object.values(telemetry.fields).filter(
    (f) => f.audioProgressAtEntry !== null && f.audioProgressAtEntry < 0.99,
  ).length
  const concurrencyScore = filled ? clamp(concurrentEntries / filled, 0, 1) : 0

  // Replays are a listening-quality signal, not an automatic failure.
  const replayPenalty = clamp(telemetry.replaysUsed * 0.1, 0, 0.3)

  const listeningRatio = clamp(
    promptScore * 0.5 + concurrencyScore * 0.5 - replayPenalty,
    0,
    1,
  )
  const listeningPoints = listeningRatio * TASK2_WEIGHTS.listening

  // ---- Correction handling (10) ------------------------------------------
  const correctionRatio = scenario.corrections.length
    ? scenario.corrections.filter((c) => {
        const f = fieldResults.find((r) => r.key === c.field)
        return f?.correct
      }).length / scenario.corrections.length
    : 1
  const correctionPoints = correctionRatio * TASK2_WEIGHTS.correction

  // ---- Completion (5) ----------------------------------------------------
  const completionRatio = filled / total
  const completionPoints = completionRatio * TASK2_WEIGHTS.completion

  const breakdown: ScoreBreakdown[] = [
    { label: 'Information Capture', earned: round(capturePoints, 1), max: TASK2_WEIGHTS.capture },
    { label: 'Data Accuracy', earned: round(dataPoints, 1), max: TASK2_WEIGHTS.dataAccuracy },
    {
      label: 'Critical Data Accuracy',
      earned: round(criticalPoints, 1),
      max: TASK2_WEIGHTS.criticalAccuracy,
    },
    {
      label: 'Listening / Multitasking',
      earned: round(listeningPoints, 1),
      max: TASK2_WEIGHTS.listening,
    },
    { label: 'Correction Handling', earned: round(correctionPoints, 1), max: TASK2_WEIGHTS.correction },
    { label: 'Completion', earned: round(completionPoints, 1), max: TASK2_WEIGHTS.completion },
  ]

  const score = round(breakdown.reduce((sum, b) => sum + b.earned, 0))

  const dataAccuracy = round(
    (fieldResults.filter((f) => f.correct).length / total) * 100,
    1,
  )
  const criticalDataAccuracy = round(criticalScore * 100, 1)

  // Multitasking is an explicit composite, reported separately and gated on
  // Assignment 5 (product rule #10).
  const multitaskingScore = round(
    (promptScore * 0.4 + concurrencyScore * 0.35 + correctionRatio * 0.25) * 100,
    1,
  )

  const gates: GateResult[] = [
    {
      label: 'Overall score',
      actual: score,
      required: settings.passingScore,
      unit: 'pts',
      passed: score >= settings.passingScore,
    },
    {
      label: 'Data accuracy',
      actual: dataAccuracy,
      required: settings.minDataAccuracy,
      unit: '%',
      passed: dataAccuracy >= settings.minDataAccuracy,
    },
    {
      label: 'Critical-data accuracy',
      actual: criticalDataAccuracy,
      required: settings.minCriticalAccuracy,
      unit: '%',
      passed: criticalDataAccuracy >= settings.minCriticalAccuracy,
    },
  ]

  if (isFinalAssignment) {
    gates.push({
      label: 'Multitasking score',
      actual: multitaskingScore,
      required: settings.minMultitaskingScore,
      unit: '%',
      passed: multitaskingScore >= settings.minMultitaskingScore,
    })
  }

  return {
    score,
    breakdown,
    gates,
    passed: gates.every((g) => g.passed),
    dataAccuracy,
    criticalDataAccuracy,
    listeningScore: round(listeningRatio * 100, 1),
    correctionScore: round(correctionRatio * 100, 1),
    multitaskingScore,
    completionPercentage: round(completionRatio * 100, 1),
    fieldResults,
  }
}
