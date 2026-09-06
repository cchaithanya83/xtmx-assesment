import type {
  AssessmentResult,
  AssignmentProgress,
  Attempt,
  CandidateStatus,
  Certification,
  GateResult,
  PerformanceLevel,
  RiskLevel,
  TaskId,
  TrainerSettings,
} from './types.ts'
import { TASKS, TOTAL_ASSIGNMENTS } from './tasks.ts'
import { TASK_WEIGHTS } from './settings.ts'
import { average, hashString, makeCertificateId, round } from './core.ts'

/* -------------------------------------------------------------------------- */
/*  Progress derivation                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Derives per-assignment progress (status, best/first attempt, improvement)
 * from the raw attempt log. Attempts are never mutated or deleted on retry —
 * this is a pure projection, which is what keeps product rules #3 and #4
 * (retries preserve history; trainers see first *and* best) true by construction.
 */
export function deriveProgress(attempts: Attempt[]): AssignmentProgress[] {
  const out: AssignmentProgress[] = []

  for (const task of TASKS) {
    for (const assignment of task.assignments) {
      // Practice attempts are logged but never unlock or gate anything.
      const rows = attempts
        .filter(
          (a) =>
            a.taskId === task.id &&
            a.assignmentId === assignment.id &&
            a.mode === 'certification',
        )
        .sort((a, b) => a.attemptNumber - b.attemptNumber)

      const first = rows[0] ?? null
      const best = rows.reduce<Attempt | null>(
        (acc, r) => (!acc || r.score > acc.score ? r : acc),
        null,
      )
      const passing = rows.find((r) => r.passed) ?? null

      const prevPassed =
        assignment.id === 1
          ? true
          : out.some(
              (p) =>
                p.taskId === task.id &&
                p.assignmentId === assignment.id - 1 &&
                p.status === 'passed',
            )

      const status: AssignmentProgress['status'] = passing
        ? 'passed'
        : prevPassed
          ? rows.length
            ? 'in-progress'
            : 'unlocked'
          : 'locked'

      out.push({
        taskId: task.id,
        assignmentId: assignment.id,
        status,
        attempts: rows.length,
        bestScore: best ? best.score : null,
        bestWpm: best?.wpm ?? null,
        bestAccuracy: best?.accuracy ?? null,
        firstAttemptId: first?.id ?? null,
        bestAttemptId: best?.id ?? null,
        passingAttemptId: passing?.id ?? null,
        improvementPercentage:
          first && best && first.score > 0 && best.id !== first.id
            ? round(((best.score - first.score) / first.score) * 100, 1)
            : first && best && best.id === first.id
              ? 0
              : null,
      })
    }
  }

  return out
}

export function findProgress(
  progress: AssignmentProgress[],
  taskId: TaskId,
  assignmentId: number,
): AssignmentProgress | undefined {
  return progress.find((p) => p.taskId === taskId && p.assignmentId === assignmentId)
}

/** Product rule #1 — a locked assignment can never be started. */
export function isAssignmentPlayable(
  progress: AssignmentProgress[],
  taskId: TaskId,
  assignmentId: number,
): boolean {
  return findProgress(progress, taskId, assignmentId)?.status !== 'locked'
}

/* -------------------------------------------------------------------------- */
/*  Aggregate scoring                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Final certification calculation:
 *
 *   Task 1 average × 40% + Task 2 average × 60% = Final Certification Score
 *
 * Task averages use the *best passing-or-highest* attempt per assignment, so a
 * candidate is measured on their demonstrated best, not their worst day.
 */
export function computeAssessmentResult(
  candidateId: string,
  attempts: Attempt[],
  settings: TrainerSettings,
): AssessmentResult {
  const certAttempts = attempts.filter((a) => a.mode === 'certification')
  const progress = deriveProgress(certAttempts)

  const bestFor = (taskId: TaskId, assignmentId: number): Attempt | null => {
    const rows = certAttempts.filter(
      (a) => a.taskId === taskId && a.assignmentId === assignmentId,
    )
    return rows.reduce<Attempt | null>((acc, r) => (!acc || r.score > acc.score ? r : acc), null)
  }

  const task1Best = TASKS[0].assignments.map((a) => bestFor(1, a.id)).filter(Boolean) as Attempt[]
  const task2Best = TASKS[1].assignments.map((a) => bestFor(2, a.id)).filter(Boolean) as Attempt[]

  const task1Average = round(average(task1Best.map((a) => a.score)), 1)
  const task2Average = round(average(task2Best.map((a) => a.score)), 1)

  const finalScore = round(
    task1Average * TASK_WEIGHTS[1] + task2Average * TASK_WEIGHTS[2],
    1,
  )

  const avgWpm = round(average(task1Best.map((a) => a.wpm ?? 0).filter((v) => v > 0)))
  const avgAccuracy = round(average(task1Best.map((a) => a.accuracy ?? 0).filter((v) => v > 0)), 1)
  const listeningAccuracy = round(
    average(task2Best.map((a) => a.listeningScore ?? a.dataAccuracy ?? 0).filter((v) => v > 0)),
    1,
  )
  const criticalDataAccuracy = round(
    average(task2Best.map((a) => a.criticalDataAccuracy ?? 0).filter((v) => v > 0)),
    1,
  )
  const a5 = bestFor(2, 5)
  const multitaskingScore = round(a5?.multitaskingScore ?? 0, 1)

  const assignmentsPassed = progress.filter((p) => p.status === 'passed').length
  const task1Passed = progress.filter((p) => p.taskId === 1 && p.status === 'passed').length
  const task2Passed = progress.filter((p) => p.taskId === 2 && p.status === 'passed').length

  /* ---- Certification gates (all must pass) ------------------------------- */
  const gates: GateResult[] = [
    {
      label: 'Task 1 assignments passed',
      actual: task1Passed,
      required: 5,
      unit: 'pts',
      passed: task1Passed === 5,
    },
    {
      label: 'Task 2 assignments passed',
      actual: task2Passed,
      required: 5,
      unit: 'pts',
      passed: task2Passed === 5,
    },
    {
      label: 'Overall score',
      actual: finalScore,
      required: settings.passingScore,
      unit: 'pts',
      passed: finalScore >= settings.passingScore,
    },
    {
      label: 'Average typing speed',
      actual: avgWpm,
      required: settings.minWpm,
      unit: 'wpm',
      passed: avgWpm >= settings.minWpm,
    },
    {
      label: 'Typing accuracy',
      actual: avgAccuracy,
      required: settings.minAccuracy,
      unit: '%',
      passed: avgAccuracy >= settings.minAccuracy,
    },
    {
      label: 'Critical-data accuracy',
      actual: criticalDataAccuracy,
      required: settings.minCriticalAccuracy,
      unit: '%',
      passed: criticalDataAccuracy >= settings.minCriticalAccuracy,
    },
    {
      label: 'Assignment 5 multitasking',
      actual: multitaskingScore,
      required: settings.minMultitaskingScore,
      unit: '%',
      passed: multitaskingScore >= settings.minMultitaskingScore,
    },
  ]

  const certified = gates.every((g) => g.passed)
  const performanceLevel = classifyPerformance(finalScore, certified)
  const status = deriveCandidateStatus({
    certified,
    assignmentsPassed,
    totalAttempts: certAttempts.length,
    finalScore,
    settings,
  })

  return {
    candidateId,
    task1Average,
    task2Average,
    finalScore,
    avgWpm,
    avgAccuracy,
    listeningAccuracy,
    criticalDataAccuracy,
    multitaskingScore,
    assignmentsPassed,
    totalAssignments: TOTAL_ASSIGNMENTS,
    totalAttempts: certAttempts.length,
    performanceLevel,
    risk: classifyRisk(finalScore, certified, assignmentsPassed),
    status,
    certified,
    gates,
  }
}

/* -------------------------------------------------------------------------- */
/*  Classification                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Performance bands. Note that a candidate can land in a band above
 * "Not Certified" and still not be certified — the mandatory gates are
 * evaluated independently (product rule #6).
 */
export function classifyPerformance(score: number, certified = true): PerformanceLevel {
  if (score < 75) return 'Not Certified'
  if (!certified && score < 80) return 'Danger Candidate'
  if (score >= 95) return 'High Performance'
  if (score >= 85) return 'Mid Performance'
  if (score >= 80) return 'Low Performance — Monitor'
  return 'Danger Candidate'
}

export function classifyRisk(
  score: number,
  certified: boolean,
  assignmentsPassed: number,
): RiskLevel {
  if (assignmentsPassed === 0 && score === 0) return 'mid'
  if (score < 75) return 'below-standard'
  if (score < 80) return 'danger'
  if (score < 85) return 'low'
  if (score < 95) return 'mid'
  return certified ? 'green' : 'mid'
}

function deriveCandidateStatus(args: {
  certified: boolean
  assignmentsPassed: number
  totalAttempts: number
  finalScore: number
  settings: TrainerSettings
}): CandidateStatus {
  const { certified, assignmentsPassed, totalAttempts, finalScore } = args
  if (certified) return 'certified'
  if (totalAttempts === 0) return 'not-started'
  if (assignmentsPassed === TOTAL_ASSIGNMENTS) return 'not-certified'
  if (finalScore > 0 && finalScore < 70) return 'danger'
  if (finalScore > 0 && finalScore < 78) return 'needs-coaching'
  return 'in-progress'
}

export const RISK_LABEL: Record<RiskLevel, string> = {
  green: 'Green',
  mid: 'Mid',
  low: 'Low',
  danger: 'Danger',
  'below-standard': 'Below Standard',
}

export const STATUS_LABEL: Record<CandidateStatus, string> = {
  'not-started': 'Not Started',
  'in-progress': 'In Progress',
  'needs-coaching': 'Needs Coaching',
  danger: 'Danger',
  'not-certified': 'Not Certified',
  certified: 'Certified',
}

/* -------------------------------------------------------------------------- */
/*  Certificate issuance                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Builds the certificate payload. Returns `null` unless every certification
 * gate is satisfied — the UI relies on this to keep the download locked.
 */
export function buildCertification(
  candidateId: string,
  candidateName: string,
  result: AssessmentResult,
  issuedAtIso?: string,
): Certification | null {
  if (!result.certified) return null
  const issuedAt = issuedAtIso ?? new Date().toISOString()
  return {
    certificateId: makeCertificateId(
      hashString(`${candidateId}:${candidateName}:${issuedAt.slice(0, 10)}`),
      new Date(issuedAt).getFullYear(),
    ),
    candidateId,
    candidateName,
    issuedAt,
    finalScore: result.finalScore,
    wpm: result.avgWpm,
    accuracy: result.avgAccuracy,
    listeningAccuracy: result.listeningAccuracy,
    criticalDataAccuracy: result.criticalDataAccuracy,
    multitaskingScore: result.multitaskingScore,
    performanceLevel: result.performanceLevel,
    assignmentsCompleted: result.assignmentsPassed,
  }
}

/** Next playable assignment, for the dashboard's primary CTA. */
export function nextAssignment(
  progress: AssignmentProgress[],
): { taskId: TaskId; assignmentId: number } | null {
  for (const task of TASKS) {
    for (const assignment of task.assignments) {
      const p = findProgress(progress, task.id, assignment.id)
      if (p && p.status !== 'passed' && p.status !== 'locked') {
        return { taskId: task.id, assignmentId: assignment.id }
      }
    }
  }
  return null
}
