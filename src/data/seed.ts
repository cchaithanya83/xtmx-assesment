import type { Attempt, Candidate, TaskId, TrainerSettings } from '@/types'
import { BATCHES, FIRST_NAMES, LAST_NAMES, LOCATIONS, TRAINERS } from './pools'
import { TASKS } from './tasks'
import { createRng, clamp, pick, randInt, round, uid, type Rng } from '@/lib/utils'

/**
 * Deterministic demo workspace.
 *
 * Seeded so the trainer/admin portal looks identical on every reload, which
 * makes it usable for demos, screenshots and training walkthroughs. Demo
 * candidates are tagged `isDemo` and can be cleared from Settings.
 */

interface SeedProfile {
  /** How far through the 10 assignments this candidate has progressed. */
  reach: number
  /** Typical score band for their attempts. */
  scoreBase: number
  /** Whether their final assignment attempt passes. */
  finishes: boolean
  wpmBase: number
  accuracyBase: number
}

const PROFILES: SeedProfile[] = [
  { reach: 10, scoreBase: 93, finishes: true, wpmBase: 46, accuracyBase: 97 }, // High performance
  { reach: 10, scoreBase: 88, finishes: true, wpmBase: 39, accuracyBase: 95 }, // Mid
  { reach: 10, scoreBase: 86, finishes: true, wpmBase: 36, accuracyBase: 94 }, // Mid
  { reach: 10, scoreBase: 82, finishes: true, wpmBase: 33, accuracyBase: 90 }, // Low — monitor
  { reach: 10, scoreBase: 78, finishes: true, wpmBase: 31, accuracyBase: 88 }, // Danger
  { reach: 9, scoreBase: 74, finishes: false, wpmBase: 29, accuracyBase: 86 }, // Not certified
  { reach: 7, scoreBase: 71, finishes: false, wpmBase: 27, accuracyBase: 83 }, // Danger / coaching
  { reach: 6, scoreBase: 80, finishes: false, wpmBase: 34, accuracyBase: 91 }, // In progress
  { reach: 5, scoreBase: 84, finishes: false, wpmBase: 37, accuracyBase: 93 }, // In progress
  { reach: 4, scoreBase: 68, finishes: false, wpmBase: 24, accuracyBase: 80 }, // Needs coaching
  { reach: 3, scoreBase: 77, finishes: false, wpmBase: 32, accuracyBase: 89 }, // In progress
  { reach: 2, scoreBase: 63, finishes: false, wpmBase: 22, accuracyBase: 78 }, // Danger
  { reach: 8, scoreBase: 90, finishes: false, wpmBase: 42, accuracyBase: 96 }, // Strong, in progress
  { reach: 1, scoreBase: 66, finishes: false, wpmBase: 25, accuracyBase: 81 }, // Early / struggling
]

export function buildSeedWorkspace(settings: TrainerSettings): {
  candidates: Candidate[]
  attempts: Attempt[]
} {
  const rng = createRng(0x5eed)
  const candidates: Candidate[] = []
  const attempts: Attempt[] = []
  const now = Date.now()

  PROFILES.forEach((profile, i) => {
    const first = FIRST_NAMES[(i * 5 + 3) % FIRST_NAMES.length]
    const last = LAST_NAMES[(i * 7 + 2) % LAST_NAMES.length]
    const createdAt = new Date(now - (30 - i) * 86400000).toISOString()

    const candidate: Candidate = {
      id: `demo_${String(i + 1).padStart(2, '0')}`,
      fullName: `${first} ${last}`,
      candidateId: `XTMX-${String(4100 + i * 7)}`,
      email: `${first.toLowerCase()}.${last.toLowerCase().replace(/[^a-z]/g, '')}@xtransmatrix.com`,
      batch: BATCHES[i % BATCHES.length],
      location: LOCATIONS[i % LOCATIONS.length],
      trainerName: TRAINERS[i % TRAINERS.length],
      createdAt,
      lastActiveAt: new Date(now - randInt(1, 72, rng) * 3600000).toISOString(),
      isDemo: true,
    }
    candidates.push(candidate)
    attempts.push(...buildAttemptsFor(candidate, profile, settings, rng, now))
  })

  return { candidates, attempts }
}

/** Builds a realistic attempt history: early failures, then improvement. */
function buildAttemptsFor(
  candidate: Candidate,
  profile: SeedProfile,
  settings: TrainerSettings,
  rng: Rng,
  now: number,
): Attempt[] {
  const rows: Attempt[] = []
  const flat = TASKS.flatMap((t) => t.assignments.map((a) => ({ taskId: t.id, assignmentId: a.id })))

  let clock = now - 26 * 86400000

  for (let i = 0; i < profile.reach; i++) {
    const { taskId, assignmentId } = flat[i]
    const isLast = i === profile.reach - 1
    const mustPass = !isLast || profile.finishes

    // Difficulty drift: later assignments score a little lower.
    const drift = (assignmentId - 1) * 1.6
    const target = clamp(profile.scoreBase - drift + randInt(-3, 3, rng), 45, 99)

    // Number of attempts: weaker candidates retry more.
    const retries = target >= 85 ? 1 : target >= 78 ? randInt(1, 2, rng) : randInt(2, 3, rng)

    for (let attemptNumber = 1; attemptNumber <= retries; attemptNumber++) {
      const isFinalTry = attemptNumber === retries
      // Improvement curve — each retry climbs toward the target.
      const gap = (retries - attemptNumber) * randInt(5, 9, rng)
      const score = clamp(
        isFinalTry && mustPass ? Math.max(target, settings.passingScore + randInt(1, 6, rng)) : target - gap,
        40,
        99,
      )
      const passed = mustPass && isFinalTry

      clock += randInt(20, 90, rng) * 60000
      rows.push(
        makeAttempt({
          candidate,
          taskId: taskId as TaskId,
          assignmentId,
          attemptNumber,
          score,
          passed,
          profile,
          settings,
          rng,
          at: clock,
        }),
      )
      if (passed) break
    }
  }

  return rows
}

interface MakeAttemptArgs {
  candidate: Candidate
  taskId: TaskId
  assignmentId: number
  attemptNumber: number
  score: number
  passed: boolean
  profile: SeedProfile
  settings: TrainerSettings
  rng: Rng
  at: number
}

function makeAttempt({
  candidate,
  taskId,
  assignmentId,
  attemptNumber,
  score,
  passed,
  profile,
  settings,
  rng,
  at,
}: MakeAttemptArgs): Attempt {
  const durationMs = randInt(150, 420, rng) * 1000
  const startedAt = new Date(at - durationMs).toISOString()
  const completedAt = new Date(at).toISOString()

  // Metrics are back-derived from the score so the dashboards stay coherent:
  // a 62-point attempt should not display 45 WPM at 98% accuracy.
  const scoreDelta = (score - profile.scoreBase) / 10
  const wpm = passed
    ? Math.max(settings.minWpm, Math.round(profile.wpmBase + scoreDelta * 2 + randInt(-2, 2, rng)))
    : Math.round(clamp(profile.wpmBase + scoreDelta * 3 - randInt(2, 6, rng), 14, 55))
  const accuracy = passed
    ? round(clamp(Math.max(settings.minAccuracy, profile.accuracyBase + scoreDelta), 85, 99.5), 1)
    : round(clamp(profile.accuracyBase + scoreDelta * 2 - randInt(2, 6, rng), 62, 98), 1)

  const totalKeystrokes = randInt(600, 2200, rng)
  const incorrectKeystrokes = Math.round((totalKeystrokes * (100 - accuracy)) / 100)

  const dataAccuracy = round(clamp(accuracy + randInt(-4, 3, rng), 55, 100), 1)
  const criticalDataAccuracy = passed
    ? round(clamp(Math.max(settings.minCriticalAccuracy, accuracy + randInt(-2, 5, rng)), 85, 100), 1)
    : round(clamp(accuracy - randInt(2, 12, rng), 50, 99), 1)
  const multitaskingScore =
    taskId === 2
      ? passed && assignmentId === 5
        ? round(clamp(Math.max(settings.minMultitaskingScore, score + randInt(-2, 6, rng)), 75, 100), 1)
        : round(clamp(score + randInt(-8, 6, rng), 40, 100), 1)
      : undefined

  const blurCount = randInt(0, 4, rng)

  const gates =
    taskId === 1
      ? [
          { label: 'Overall score', actual: score, required: settings.passingScore, unit: 'pts' as const, passed: score >= settings.passingScore },
          { label: 'Typing speed', actual: wpm, required: settings.minWpm, unit: 'wpm' as const, passed: wpm >= settings.minWpm },
          { label: 'Typing accuracy', actual: accuracy, required: settings.minAccuracy, unit: '%' as const, passed: accuracy >= settings.minAccuracy },
        ]
      : [
          { label: 'Overall score', actual: score, required: settings.passingScore, unit: 'pts' as const, passed: score >= settings.passingScore },
          { label: 'Data accuracy', actual: dataAccuracy, required: settings.minDataAccuracy, unit: '%' as const, passed: dataAccuracy >= settings.minDataAccuracy },
          { label: 'Critical-data accuracy', actual: criticalDataAccuracy, required: settings.minCriticalAccuracy, unit: '%' as const, passed: criticalDataAccuracy >= settings.minCriticalAccuracy },
          ...(assignmentId === 5
            ? [{ label: 'Multitasking score', actual: multitaskingScore ?? 0, required: settings.minMultitaskingScore, unit: '%' as const, passed: (multitaskingScore ?? 0) >= settings.minMultitaskingScore }]
            : []),
        ]

  return {
    id: uid('att'),
    candidateId: candidate.id,
    taskId,
    assignmentId,
    attemptNumber,
    mode: 'certification',
    startedAt,
    completedAt,
    score,
    passed,
    ...(taskId === 1
      ? { wpm, rawWpm: wpm + randInt(2, 7, rng), accuracy }
      : {
          dataAccuracy,
          criticalDataAccuracy,
          multitaskingScore,
          correctionScore: round(clamp(score + randInt(-10, 10, rng), 0, 100), 1),
          listeningScore: round(clamp(score + randInt(-6, 8, rng), 30, 100), 1),
        }),
    totalKeystrokes,
    incorrectKeystrokes,
    backspaces: randInt(4, 60, rng),
    completionPercentage: passed ? 100 : randInt(78, 100, rng),
    breakdown: [],
    gates,
    feedback: buildSeedFeedback(taskId, passed, wpm, accuracy, settings, rng),
    integrity: {
      blurCount,
      focusCount: blurCount,
      pasteAttempts: rng() > 0.85 ? 1 : 0,
      copyAttempts: 0,
      events: [],
      flagged: blurCount >= settings.flagBlurThreshold,
    },
  }
}

function buildSeedFeedback(
  taskId: TaskId,
  passed: boolean,
  wpm: number,
  accuracy: number,
  settings: TrainerSettings,
  rng: Rng,
) {
  const strengthPool =
    taskId === 1
      ? [
          'Strong professional-text typing',
          'Good handling of names and basic IDs',
          'Maintained steady WPM across the passage',
          'Clean punctuation and capitalisation',
        ]
      : [
          'Captured all identity fields on first pass',
          'Applied spoken corrections correctly',
          'Kept typing while audio continued',
          'Accurate benefit-value capture',
        ]
  const improvementPool =
    taskId === 1
      ? [
          'Numeric accuracy',
          'DOB and date entry',
          'Alphanumeric identifier precision',
          'Sustained speed in the final third',
        ]
      : [
          'Listening while navigating fields',
          'Correction handling',
          'Out-of-order data routing',
          'Critical ID transcription',
        ]

  const strengths = passed
    ? [
        `Met the speed standard at ${wpm} WPM`,
        pick(strengthPool, rng),
        `Accuracy of ${accuracy}% above the ${settings.minAccuracy}% requirement`,
      ]
    : [pick(strengthPool, rng), 'Completed the full attempt without abandoning']

  const improvements = passed
    ? [pick(improvementPool, rng)]
    : [
        wpm < settings.minWpm ? `Typing speed below target — ${wpm} WPM` : pick(improvementPool, rng),
        accuracy < settings.minAccuracy ? `Accuracy below standard at ${accuracy}%` : pick(improvementPool, rng),
      ]

  return {
    strengths: Array.from(new Set(strengths)),
    improvements: Array.from(new Set(improvements)),
    recommendation: passed
      ? ['Proceed to the next assignment']
      : ['Task 1 Assignment 3 practice', '5-minute numeric typing drill', 'Task 2 correction simulation'],
  }
}
