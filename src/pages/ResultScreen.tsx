import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  CheckCircle2,
  Dumbbell,
  LayoutDashboard,
  RotateCcw,
  XCircle,
} from 'lucide-react'
import { getAssignment, TASKS } from '@/data/tasks'
import { useAppStore, useCurrentCandidate } from '@/store/appStore'
import { explainFailure } from '@/engine/feedback'
import { findProgress } from '@/engine/certification'
import {
  FeedbackPanel,
  GateList,
  Metric,
  PerformanceBadge,
  ScoreBreakdownList,
} from '@/components/shared'
import { Badge, Button, Card, Separator } from '@/components/ui'
import { cn, formatDuration, round } from '@/lib/utils'

/**
 * Post-attempt result screen.
 *
 * Shows the outcome, the exact failing gates (product rule #7 applies to
 * candidates too), the score breakdown and rules-based coaching feedback.
 */
export default function ResultScreen() {
  const navigate = useNavigate()
  const candidate = useCurrentCandidate()
  const attempt = useAppStore((s) => s.lastAttempt)
  const progress = useAppStore((s) => s.progress)
  const result = useAppStore((s) => s.result)
  const startAssignment = useAppStore((s) => s.startAssignment)
  const [launchError, setLaunchError] = React.useState<string | null>(null)

  if (!candidate || !attempt || !result) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="text-sm text-muted-foreground">No recent attempt to display.</p>
        <Button className="mt-4" onClick={() => navigate('/dashboard')}>
          Return to dashboard
        </Button>
      </div>
    )
  }

  const assignment = getAssignment(attempt.taskId, attempt.assignmentId)
  const passed = attempt.passed
  const isPractice = attempt.mode === 'practice'

  // Where to go next once this assignment is passed.
  const task = TASKS.find((t) => t.id === attempt.taskId)!
  const isLastOfTask = attempt.assignmentId === task.assignments.length
  const nextInTask = !isLastOfTask ? attempt.assignmentId + 1 : null
  const nextTaskId = isLastOfTask && attempt.taskId === 1 ? 2 : null

  const elapsed =
    (new Date(attempt.completedAt).getTime() - new Date(attempt.startedAt).getTime()) / 1000

  /** Both of these ask the server to issue a new session; it may refuse. */
  const retry = async (mode: 'certification' | 'practice') => {
    setLaunchError(null)
    try {
      await startAssignment(attempt.taskId, attempt.assignmentId, mode)
      navigate(`/assessment/${attempt.taskId}/${attempt.assignmentId}`)
    } catch (err) {
      setLaunchError((err as Error).message)
    }
  }

  const goNext = async () => {
    if (nextInTask) {
      setLaunchError(null)
      try {
        await startAssignment(attempt.taskId, nextInTask, 'certification')
        navigate(`/assessment/${attempt.taskId}/${nextInTask}`)
      } catch {
        navigate(`/task/${attempt.taskId}`)
      }
    } else if (nextTaskId) {
      navigate(`/task/${nextTaskId}`)
    } else {
      navigate('/results')
    }
  }

  const attemptsForAssignment = findProgress(progress, attempt.taskId, attempt.assignmentId)

  return (
    <div className="mx-auto max-w-5xl">
      {/* ---- Banner ---- */}
      <Card
        className={cn(
          'mb-5 overflow-hidden border-2',
          passed ? 'border-emerald-300' : 'border-amber-300',
        )}
      >
        <div className={cn('px-6 py-5', passed ? 'bg-emerald-50' : 'bg-amber-50')}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {passed ? (
                  <CheckCircle2 className="size-6 text-emerald-600" />
                ) : (
                  <XCircle className="size-6 text-amber-600" />
                )}
                <h1
                  className={cn(
                    'text-2xl font-extrabold uppercase tracking-tight sm:text-3xl',
                    passed ? 'text-emerald-800' : 'text-amber-800',
                  )}
                >
                  {passed ? 'Passed' : 'Retry Required'}
                </h1>
                {isPractice && <Badge variant="accent">Practice — not recorded</Badge>}
              </div>
              <p className="mt-1.5 text-sm text-navy-700">
                Task {attempt.taskId} · Assignment {attempt.assignmentId} — {assignment.title}
                {' · '}
                Attempt {attempt.attemptNumber}
              </p>
              <p className="mt-1 text-sm font-medium text-navy-800">
                {explainFailure(attempt.gates)}
              </p>
            </div>

            <div className="shrink-0 text-right">
              <p
                className={cn(
                  'metric-value text-5xl leading-none',
                  passed ? 'text-emerald-700' : 'text-amber-700',
                )}
              >
                {attempt.score}
              </p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                out of 100
              </p>
            </div>
          </div>
        </div>

        {/* ---- Headline metrics ---- */}
        <div className="grid grid-cols-2 gap-4 border-t border-border p-5 sm:grid-cols-3 lg:grid-cols-6">
          {attempt.taskId === 1 ? (
            <>
              <Metric label="WPM" value={attempt.wpm ?? 0} />
              <Metric label="Raw WPM" value={attempt.rawWpm ?? 0} />
              <Metric label="Accuracy" value={`${attempt.accuracy ?? 0}%`} />
              <Metric
                label="Data accuracy"
                value={`${attempt.typingMetrics?.numericAccuracy ?? 0}%`}
              />
              <Metric label="Completion" value={`${round(attempt.completionPercentage)}%`} />
              <Metric label="Attempts" value={attemptsForAssignment?.attempts ?? 1} />
            </>
          ) : (
            <>
              <Metric label="Data accuracy" value={`${attempt.dataAccuracy ?? 0}%`} />
              <Metric label="Critical accuracy" value={`${attempt.criticalDataAccuracy ?? 0}%`} />
              <Metric label="Listening" value={`${attempt.listeningScore ?? 0}%`} />
              <Metric label="Multitasking" value={`${attempt.multitaskingScore ?? 0}%`} />
              <Metric label="Corrections" value={`${attempt.correctionScore ?? 0}%`} />
              <Metric label="Attempts" value={attemptsForAssignment?.attempts ?? 1} />
            </>
          )}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          {/* ---- Feedback ---- */}
          <div>
            <h2 className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Performance feedback
            </h2>
            <FeedbackPanel feedback={attempt.feedback} />
          </div>

          {/* ---- Detailed metrics ---- */}
          {attempt.typingMetrics && (
            <Card className="p-5">
              <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Keystroke analysis
              </h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Metric size="sm" label="Total keystrokes" value={attempt.typingMetrics.totalKeystrokes} />
                <Metric size="sm" label="Correct" value={attempt.typingMetrics.correctKeystrokes} />
                <Metric
                  size="sm"
                  label="Incorrect"
                  value={attempt.typingMetrics.incorrectKeystrokes}
                  tone={attempt.typingMetrics.incorrectKeystrokes > 0 ? 'warning' : 'default'}
                />
                <Metric size="sm" label="Backspaces" value={attempt.typingMetrics.backspaces} />
                <Metric size="sm" label="Corrected errors" value={attempt.typingMetrics.correctedErrors} />
                <Metric
                  size="sm"
                  label="Uncorrected errors"
                  value={attempt.typingMetrics.uncorrectedErrors}
                  tone={attempt.typingMetrics.uncorrectedErrors > 0 ? 'danger' : 'default'}
                />
                <Metric size="sm" label="Longest streak" value={attempt.typingMetrics.longestStreak} />
                <Metric
                  size="sm"
                  label="Long pauses"
                  value={attempt.typingMetrics.longPauses}
                  hint={`> ${round(attempt.typingMetrics.totalPauseMs / 1000, 1)}s total`}
                />
              </div>
            </Card>
          )}

          {attempt.audioTelemetry && (
            <Card className="p-5">
              <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Capture behaviour
              </h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Metric
                  size="sm"
                  label="Fields captured"
                  value={
                    Object.values(attempt.audioTelemetry.fields).filter((f) => !f.skipped).length
                  }
                />
                <Metric
                  size="sm"
                  label="Field navigations"
                  value={attempt.audioTelemetry.fieldNavigationCount}
                />
                <Metric
                  size="sm"
                  label="In-field corrections"
                  value={Object.values(attempt.audioTelemetry.fields).reduce(
                    (n: number, f) => n + f.corrections,
                    0,
                  )}
                />
                <Metric
                  size="sm"
                  label="Verification prompts"
                  value={`${attempt.audioTelemetry.verificationAnswers.filter((a: { correct: boolean }) => a.correct).length}/${attempt.audioTelemetry.verificationAnswers.length}`}
                />
                <Metric size="sm" label="Replays used" value={attempt.audioTelemetry.replaysUsed} />
                <Metric size="sm" label="Time taken" value={formatDuration(elapsed)} />
              </div>
            </Card>
          )}
        </div>

        {/* ---- Sidebar ---- */}
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Passing gates
            </h2>
            <GateList gates={attempt.gates} />
          </Card>

          {attempt.breakdown.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Score breakdown
              </h2>
              <ScoreBreakdownList breakdown={attempt.breakdown} />
            </Card>
          )}

          <Card className="p-5">
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Overall standing
            </h2>
            <div className="space-y-3">
              <Metric
                label="Certification score"
                value={round(result.finalScore, 1)}
                unit="/100"
                size="sm"
              />
              <Metric
                label="Assignments passed"
                value={`${result.assignmentsPassed}/${result.totalAssignments}`}
                size="sm"
              />
              <Separator />
              <PerformanceBadge level={result.performanceLevel} />
            </div>
          </Card>

          {/* ---- Actions ---- */}
          {launchError && (
            <p
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-medium text-red-800"
            >
              {launchError}
            </p>
          )}
          <div className="space-y-2">
            {passed && !isPractice ? (
              <Button size="lg" className="w-full" onClick={() => void goNext()}>
                {nextInTask
                  ? `Continue to Assignment ${nextInTask}`
                  : nextTaskId
                    ? 'Continue to Task 2'
                    : 'View final results'}
                <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button size="lg" className="w-full" onClick={() => void retry('certification')}>
                <RotateCcw className="size-4" />
                Retry assignment
              </Button>
            )}
            <Button variant="outline" className="w-full" onClick={() => void retry('practice')}>
              <Dumbbell className="size-4" />
              Practice before retry
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => navigate('/dashboard')}>
              <LayoutDashboard className="size-4" />
              Return to dashboard
            </Button>
          </div>

          {attempt.integrity.flagged && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
              Integrity note: {attempt.integrity.blurCount} focus loss event(s) and{' '}
              {attempt.integrity.pasteAttempts} blocked paste attempt(s) were recorded for trainer
              review. This does not affect your score.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
