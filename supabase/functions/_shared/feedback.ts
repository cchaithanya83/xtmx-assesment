import type { AttemptFeedback, TrainerSettings, TypingMetrics } from './types.ts'
import type { FieldResult, Task2ScoreResult } from './scoring.ts'

/**
 * Rules-based feedback engine.
 *
 * Produces the Strengths / Improvement Areas / Recommended Practice block shown
 * after every attempt.
 *
 * ---------------------------------------------------------------------------
 * FUTURE: AI-generated coaching
 * ---------------------------------------------------------------------------
 * The signature below is intentionally synchronous and pure so it can be
 * swapped for an async LLM call without touching callers:
 *
 *   export interface CoachingProvider {
 *     generate(input: FeedbackInput): Promise<AttemptFeedback>
 *   }
 *
 * Implement `RulesCoachingProvider` (this file) and, later, an
 * `AiCoachingProvider` that posts the same `FeedbackInput` to a server route
 * which calls the model. Keep the rules provider as the fallback so an API
 * outage never blocks an assessment.
 */

const MAX_ITEMS = 4

function take(items: string[]): string[] {
  return items.slice(0, MAX_ITEMS)
}

/* -------------------------------------------------------------------------- */
/*  Task 1                                                                     */
/* -------------------------------------------------------------------------- */

export function buildTask1Feedback(
  metrics: TypingMetrics,
  score: number,
  settings: TrainerSettings,
  assignmentId: number,
): AttemptFeedback {
  const strengths: string[] = []
  const improvements: string[] = []
  const recommendation: string[] = []

  /* --- strengths ---------------------------------------------------------- */
  if (metrics.wpm >= settings.minWpm + 8) {
    strengths.push(`Comfortably above the speed target at ${metrics.wpm} WPM`)
  } else if (metrics.wpm >= settings.minWpm) {
    strengths.push(`Met the typing speed target at ${metrics.wpm} WPM`)
  }
  if (metrics.accuracy >= 95) {
    strengths.push(`Excellent keystroke accuracy at ${metrics.accuracy}%`)
  } else if (metrics.accuracy >= settings.minAccuracy) {
    strengths.push(`Accuracy above the ${settings.minAccuracy}% standard`)
  }
  if (metrics.numericAccuracy >= 95) {
    strengths.push('Strong handling of numbers, IDs and punctuation-heavy fields')
  }
  if (metrics.longestStreak >= 120) {
    strengths.push(`Sustained a ${metrics.longestStreak}-character error-free streak`)
  }
  if (metrics.completionPercentage >= 100) {
    strengths.push('Completed the full passage within the time limit')
  }
  if (metrics.backspaces <= Math.max(5, metrics.totalKeystrokes * 0.02)) {
    strengths.push('Clean first-pass typing with very little rework')
  }
  if (!strengths.length) {
    strengths.push('Completed the attempt and generated a full metric baseline')
  }

  /* --- improvements ------------------------------------------------------- */
  if (metrics.wpm < settings.minWpm) {
    improvements.push(
      `Typing speed below target — ${metrics.wpm} WPM against a ${settings.minWpm} WPM minimum`,
    )
  }
  if (metrics.accuracy < settings.minAccuracy) {
    improvements.push(
      `Keystroke accuracy below standard — ${metrics.accuracy}% against ${settings.minAccuracy}%`,
    )
  }
  if (metrics.numericAccuracy < settings.minAccuracy) {
    improvements.push(
      `Numeric and identifier accuracy at ${metrics.numericAccuracy}% — digits and hyphens are the weak point`,
    )
  }
  if (metrics.backspaces > metrics.totalKeystrokes * 0.08 && metrics.totalKeystrokes > 50) {
    improvements.push(
      `High correction rate (${metrics.backspaces} backspaces) — slow down slightly to type it right the first time`,
    )
  }
  if (metrics.completionPercentage < settings.minCompletion) {
    improvements.push(
      `Only ${Math.round(metrics.completionPercentage)}% of the passage was transcribed — ${settings.minCompletion}% is required`,
    )
  } else if (metrics.completionPercentage < 100) {
    improvements.push(
      `${Math.round(100 - metrics.completionPercentage)}% of the passage was left untyped before time expired`,
    )
  }
  if (metrics.longPauses >= 4) {
    improvements.push(
      `${metrics.longPauses} pauses longer than ${settings.pauseThresholdMs / 1000}s — keep your eyes one phrase ahead`,
    )
  }
  if (!improvements.length) {
    improvements.push('No material weaknesses detected — maintain this standard on the next assignment')
  }

  /* --- recommendations ---------------------------------------------------- */
  if (metrics.wpm < settings.minWpm) {
    recommendation.push('5-minute home-row rhythm drill before your next attempt')
    recommendation.push('Practice mode on this assignment — focus on flow, not correction')
  }
  if (metrics.numericAccuracy < 90) {
    recommendation.push('Task 1 Assignment 3 practice — alphanumeric identifier drill')
    recommendation.push('5-minute numeric keypad and digit-string drill')
  }
  if (metrics.accuracy < settings.minAccuracy) {
    recommendation.push('Reduce pace by roughly 10% and re-run for accuracy over speed')
  }
  if (assignmentId >= 4 && metrics.accuracy < 92) {
    recommendation.push('Review healthcare terminology spelling: deductible, coinsurance, prior authorization')
  }
  if (!recommendation.length) {
    recommendation.push(
      score >= 90
        ? 'Proceed to the next assignment — no remediation required'
        : 'Optional practice run before moving on to lock in consistency',
    )
  }

  return {
    strengths: take(strengths),
    improvements: take(improvements),
    recommendation: take(recommendation),
  }
}

/* -------------------------------------------------------------------------- */
/*  Task 2                                                                     */
/* -------------------------------------------------------------------------- */

export function buildTask2Feedback(
  result: Task2ScoreResult,
  settings: TrainerSettings,
  assignmentId: number,
  hadCorrections: boolean,
  promptCount: number,
): AttemptFeedback {
  const strengths: string[] = []
  const improvements: string[] = []
  const recommendation: string[] = []

  const wrongCritical = result.fieldResults.filter((f) => f.critical && !f.correct)
  const skipped = result.fieldResults.filter((f) => f.skipped)
  const nearMisses = result.fieldResults.filter(
    (f) => !f.correct && !f.skipped && f.similarity >= 0.8,
  )

  /* --- strengths ---------------------------------------------------------- */
  if (result.criticalDataAccuracy >= 95) {
    strengths.push(`Excellent critical-data capture at ${result.criticalDataAccuracy}%`)
  } else if (result.criticalDataAccuracy >= settings.minCriticalAccuracy) {
    strengths.push('Critical fields captured above the certification standard')
  }
  if (result.dataAccuracy >= settings.minDataAccuracy) {
    strengths.push(`Overall data accuracy of ${result.dataAccuracy}% meets the standard`)
  }
  if (!skipped.length) {
    strengths.push('Every field on the form was captured — no dropped information')
  }
  if (hadCorrections && result.correctionScore >= 100) {
    strengths.push('All spoken corrections were applied to the final values')
  }
  if (promptCount > 0 && result.multitaskingScore >= settings.minMultitaskingScore) {
    strengths.push('Maintained data entry while answering verification prompts')
  }
  if (!strengths.length) {
    strengths.push('Completed the full listening scenario without abandoning the call')
  }

  /* --- improvements ------------------------------------------------------- */
  if (wrongCritical.length) {
    improvements.push(
      `Critical field errors: ${wrongCritical.map((f) => f.label).join(', ')}`,
    )
  }
  if (result.criticalDataAccuracy < settings.minCriticalAccuracy) {
    improvements.push(
      `Critical-data accuracy at ${result.criticalDataAccuracy}% — the certification minimum is ${settings.minCriticalAccuracy}%`,
    )
  }
  if (result.dataAccuracy < settings.minDataAccuracy) {
    improvements.push(
      `Overall data accuracy at ${result.dataAccuracy}% against a ${settings.minDataAccuracy}% requirement`,
    )
  }
  if (skipped.length) {
    improvements.push(`${skipped.length} field(s) left blank: ${skipped.map((f) => f.label).join(', ')}`)
  }
  if (nearMisses.length) {
    improvements.push(
      `Near-miss entries suggest transposition on: ${nearMisses.map((f) => f.label).join(', ')}`,
    )
  }
  if (hadCorrections && result.correctionScore < 100) {
    improvements.push('Spoken corrections were not fully applied — the superseded value was submitted')
  }
  if (promptCount > 0 && result.multitaskingScore < settings.minMultitaskingScore) {
    improvements.push(
      `Multitasking score of ${result.multitaskingScore}% — typing stalled while handling verification prompts`,
    )
  }
  if (!improvements.length) {
    improvements.push('No material weaknesses detected on this scenario')
  }

  /* --- recommendations ---------------------------------------------------- */
  if (wrongCritical.some((f) => ['memberId', 'authorizationNumber', 'referenceNumber', 'policyNumber'].includes(f.key))) {
    recommendation.push('Task 1 Assignment 3 practice — alphanumeric identifier drill')
    recommendation.push('Phonetic alphabet review (Alpha through Zulu) before the next attempt')
  }
  if (wrongCritical.some((f) => ['dob', 'effectiveDate', 'terminationDate'].includes(f.key))) {
    recommendation.push('DOB and date-format drill — always confirm MM/DD/YYYY ordering')
  }
  if (wrongCritical.some((f) => ['copay', 'deductible', 'coinsurance', 'specialistCopay'].includes(f.key))) {
    recommendation.push('Benefit-value drill: distinguish copay, deductible, coinsurance and out-of-pocket max')
  }
  if (hadCorrections && result.correctionScore < 100) {
    recommendation.push('Task 2 correction simulation — practise overwriting a value after "sorry, correction"')
  }
  if (skipped.length) {
    recommendation.push('Practice mode with replay enabled to rebuild capture confidence')
  }
  if (assignmentId === 5 && result.multitaskingScore < settings.minMultitaskingScore) {
    recommendation.push('Repeat Assignment 4 in practice mode to automate correction handling first')
  }
  if (!recommendation.length) {
    recommendation.push('Proceed to the next assignment — no remediation required')
  }

  return {
    strengths: take(strengths),
    improvements: take(improvements),
    recommendation: take(recommendation),
  }
}

/** Short, human summary of *why* an attempt failed, for the result banner. */
export function explainFailure(gates: { label: string; passed: boolean }[]): string {
  const failed = gates.filter((g) => !g.passed)
  if (!failed.length) return 'All certification gates met.'
  if (failed.length === 1) {
    const only = failed[0].label.toLowerCase()
    const passedOthers = gates.filter((g) => g.passed).length > 0
    return passedOthers
      ? `Every other requirement passed, but the ${only} requirement was not met.`
      : `The ${only} requirement was not met.`
  }
  return `${failed.length} requirements were not met: ${failed.map((g) => g.label.toLowerCase()).join(', ')}.`
}

/** Summarises a `FieldResult` list into a one-line error profile. */
export function fieldErrorProfile(fields: FieldResult[]): string {
  const wrong = fields.filter((f) => !f.correct)
  if (!wrong.length) return 'All fields captured correctly.'
  const critical = wrong.filter((f) => f.critical).length
  return `${wrong.length} field${wrong.length === 1 ? '' : 's'} incorrect (${critical} critical).`
}
