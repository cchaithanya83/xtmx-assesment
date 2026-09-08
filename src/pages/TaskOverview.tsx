import * as React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  CheckCircle2,
  Dumbbell,
  Gauge,
  Headphones,
  Keyboard,
  Lock,
  Play,
  Repeat,
  Target,
  TrendingUp,
  Unlock,
} from 'lucide-react'
import type { AssignmentProgress, TaskId } from '@/types'
import { getTask } from '@/data/tasks'
import { useAppStore, useCurrentCandidate } from '@/store/appStore'
import { findProgress } from '@/engine/certification'
import { DifficultyBadge, PageHeader } from '@/components/shared'
import { Badge, Button, Card, Progress } from '@/components/ui'
import { cn, round } from '@/lib/utils'

/**
 * Task overview — the assignment list with lock/unlock state.
 *
 * Locked assignments show a lock icon and the exact unlock condition, and the
 * Start button is unreachable, mirroring the store-level guard.
 */
export default function TaskOverview() {
  const { taskId: rawTaskId } = useParams()
  const taskId = (Number(rawTaskId ?? 1) === 2 ? 2 : 1) as TaskId
  const navigate = useNavigate()

  const candidate = useCurrentCandidate()
  const progress = useAppStore((s) => s.progress)
  const result = useAppStore((s) => s.result)
  const refreshProgress = useAppStore((s) => s.refreshProgress)
  const startAssignment = useAppStore((s) => s.startAssignment)
  const settings = useAppStore((s) => s.settings)
  const [launchError, setLaunchError] = React.useState<string | null>(null)
  const [launching, setLaunching] = React.useState(false)

  React.useEffect(() => {
    void refreshProgress()
  }, [refreshProgress])

  if (!candidate || !result) return null

  const task = getTask(taskId)
  const taskProgress = progress.filter((p: AssignmentProgress) => p.taskId === taskId)
  const passed = taskProgress.filter((p: AssignmentProgress) => p.status === 'passed').length
  const average = taskId === 1 ? result.task1Average : result.task2Average

  /**
   * Starting an assignment is a server decision: the API issues the content and
   * refuses if the assignment is locked or the retry limit is spent.
   */
  const launch = async (assignmentId: number, mode: 'certification' | 'practice') => {
    setLaunchError(null)
    setLaunching(true)
    try {
      await startAssignment(taskId, assignmentId, mode)
      navigate(`/assessment/${taskId}/${assignmentId}`)
    } catch (err) {
      setLaunchError((err as Error).message)
    } finally {
      setLaunching(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow={`Task ${taskId} · ${Math.round(task.weight * 100)}% of final certification`}
        title={task.title}
        description={task.subtitle}
        actions={
          <div className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-2">
            <div className="text-right">
              <p className="metric-value text-lg text-navy-900">{round(average, 1)}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Task average
              </p>
            </div>
            <div className="h-8 w-px bg-border" />
            <div className="text-right">
              <p className="metric-value text-lg text-navy-900">
                {passed}/{task.assignments.length}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Passed
              </p>
            </div>
          </div>
        }
      />

      {!settings.requireSequentialUnlock && (
        <p className="mb-4 flex items-start gap-2 rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-[13px] text-brand-900">
          <Unlock className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong className="font-semibold">Open order.</strong> Your trainer has enabled working
            through assignments in any order, so nothing is locked. All {task.assignments.length} in
            this task still need to be passed to certify.
          </span>
        </p>
      )}

      {launchError && (
        <p
          role="alert"
          className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800"
        >
          {launchError}
        </p>
      )}

      <Progress
        value={(passed / task.assignments.length) * 100}
        tone={passed === task.assignments.length ? 'emerald' : 'brand'}
        className="mb-6"
      />

      <div className="space-y-3">
        {task.assignments.map((assignment) => {
          const p = findProgress(progress, taskId, assignment.id) as AssignmentProgress
          const locked = p.status === 'locked'
          const isPassed = p.status === 'passed'

          return (
            <Card
              key={assignment.id}
              className={cn(
                'overflow-hidden transition-colors',
                locked && 'opacity-70',
                isPassed && 'border-emerald-200',
              )}
            >
              <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center">
                {/* ---- Identity ---- */}
                <div className="flex min-w-0 flex-1 items-start gap-3.5">
                  <span
                    className={cn(
                      'flex size-11 shrink-0 items-center justify-center rounded-lg font-mono text-base font-bold',
                      isPassed
                        ? 'bg-emerald-100 text-emerald-800'
                        : locked
                          ? 'bg-navy-50 text-navy-300'
                          : 'bg-navy-900 text-white',
                    )}
                  >
                    {locked ? <Lock className="size-4" /> : assignment.id}
                  </span>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[15px] font-bold text-navy-900">
                        Assignment {assignment.id} — {assignment.title}
                      </h3>
                      <DifficultyBadge difficulty={assignment.difficulty} />
                      {isPassed && (
                        <Badge variant="success">
                          <CheckCircle2 className="size-3" />
                          Passed
                        </Badge>
                      )}
                      {p.status === 'in-progress' && <Badge variant="warning">Retry required</Badge>}
                      {p.status === 'unlocked' && <Badge variant="accent">Unlocked</Badge>}
                    </div>
                    <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
                      {assignment.description}
                    </p>
                    {locked && (
                      <p className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-amber-700">
                        <Lock className="size-3.5" />
                        Pass Assignment {assignment.id - 1} to unlock
                      </p>
                    )}
                  </div>
                </div>

                {/* ---- Stats ---- */}
                <div className="grid shrink-0 grid-cols-4 gap-x-5 gap-y-1 lg:w-[320px]">
                  <Stat
                    label="Best score"
                    value={p.bestScore !== null ? String(p.bestScore) : '—'}
                    icon={<Target className="size-3" />}
                    tone={
                      p.bestScore !== null && p.bestScore >= settings.passingScore
                        ? 'good'
                        : 'default'
                    }
                  />
                  {taskId === 1 ? (
                    <>
                      <Stat
                        label="Best WPM"
                        value={p.bestWpm !== null ? String(p.bestWpm) : '—'}
                        icon={<Gauge className="size-3" />}
                        tone={p.bestWpm !== null && p.bestWpm >= settings.minWpm ? 'good' : 'default'}
                      />
                      <Stat
                        label="Accuracy"
                        value={p.bestAccuracy !== null ? `${p.bestAccuracy}%` : '—'}
                        icon={<CheckCircle2 className="size-3" />}
                        tone={
                          p.bestAccuracy !== null && p.bestAccuracy >= settings.minAccuracy
                            ? 'good'
                            : 'default'
                        }
                      />
                    </>
                  ) : (
                    <>
                      <Stat
                        label="Level"
                        value={String(assignment.audioLevel ?? '—')}
                        icon={<Headphones className="size-3" />}
                      />
                      <Stat
                        label="Improvement"
                        value={
                          p.improvementPercentage !== null && p.improvementPercentage !== 0
                            ? `${p.improvementPercentage > 0 ? '+' : ''}${p.improvementPercentage}%`
                            : '—'
                        }
                        icon={<TrendingUp className="size-3" />}
                        tone={
                          p.improvementPercentage !== null && p.improvementPercentage > 0
                            ? 'good'
                            : 'default'
                        }
                      />
                    </>
                  )}
                  <Stat
                    label="Attempts"
                    value={String(p.attempts)}
                    icon={<Repeat className="size-3" />}
                  />
                </div>

                {/* ---- Actions ---- */}
                <div className="flex shrink-0 flex-col gap-2 lg:w-[168px]">
                  <Button
                    disabled={locked || launching}
                    variant={isPassed ? 'outline' : 'default'}
                    onClick={() => void launch(assignment.id, 'certification')}
                  >
                    {locked ? (
                      <>
                        <Lock className="size-4" />
                        Locked
                      </>
                    ) : (
                      <>
                        <Play className="size-4" />
                        {p.attempts === 0 ? 'Start' : isPassed ? 'Retake' : 'Retry'}
                      </>
                    )}
                  </Button>
                  {!locked && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void launch(assignment.id, 'practice')}
                    >
                      <Dumbbell className="size-3.5" />
                      Practice mode
                    </Button>
                  )}
                </div>
              </div>

              {/* ---- Retry policy notice ---- */}
              {!locked && !isPassed && p.attempts > 0 && (
                <div className="border-t border-border bg-muted/40 px-5 py-2.5 text-[12px] text-muted-foreground">
                  {settings.unlimitedRetries ? (
                    <>
                      Unlimited retries are enabled.{' '}
                      {taskId === 1
                        ? 'Each retry uses a different equivalent passage.'
                        : 'Each retry generates a completely new scenario at the same difficulty.'}
                    </>
                  ) : (
                    <>
                      Attempt {p.attempts} of {settings.maxAttempts} used.
                      {p.attempts >= settings.maxAttempts &&
                        ' Contact your trainer to reset this assignment.'}
                    </>
                  )}
                </div>
              )}
            </Card>
          )
        })}
      </div>

      <div className="mt-6 flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-4 py-3 text-[13px] text-navy-700">
        {taskId === 1 ? (
          <Keyboard className="mt-0.5 size-4 shrink-0 text-brand-700" />
        ) : (
          <Headphones className="mt-0.5 size-4 shrink-0 text-brand-700" />
        )}
        <p>
          <strong className="font-semibold">Scoring for this task:</strong>{' '}
          {taskId === 1
            ? 'Typing speed 30 · Accuracy 40 · Data/number accuracy 20 · Completion 10. You must score at least ' +
              `${settings.passingScore}, reach ${settings.minWpm} WPM and hold ${settings.minAccuracy}% accuracy to pass.`
            : 'Information capture 25 · Data accuracy 25 · Critical-data accuracy 20 · Listening/multitasking 15 · Correction handling 10 · Completion 5. You must score at least ' +
              `${settings.passingScore} with ${settings.minDataAccuracy}% data accuracy and ${settings.minCriticalAccuracy}% critical-data accuracy.`}
        </p>
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  icon,
  tone = 'default',
}: {
  label: string
  value: string
  icon: React.ReactNode
  tone?: 'default' | 'good'
}) {
  return (
    <div>
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </p>
      <p
        className={cn(
          'metric-value text-base',
          tone === 'good' ? 'text-emerald-700' : 'text-navy-900',
        )}
      >
        {value}
      </p>
    </div>
  )
}
