import { useNavigate } from 'react-router-dom'
import { Award, Download, Headphones, Keyboard, TrendingUp } from 'lucide-react'
import { TASKS } from '@/data/tasks'
import { useAppStore, useCurrentCandidate } from '@/store/appStore'
import { findProgress } from '@/engine/certification'
import { AssignmentScoreChart, AttemptTrendChart, CompetencyRadar } from '@/components/charts'
import {
  DetailRow,
  GateList,
  Metric,
  MetricCard,
  PageHeader,
  PerformanceBadge,
} from '@/components/shared'
import { Badge, Button, Card, Progress } from '@/components/ui'
import { cn, downloadBlob, round, toCsv } from '@/lib/utils'

/**
 * Candidate-facing final results: per-assignment breakdown, competency profile
 * and the exact certification gates.
 */
export default function FinalResults() {
  const navigate = useNavigate()
  const candidate = useCurrentCandidate()
  const getProgress = useAppStore((s) => s.getProgress)
  const getResult = useAppStore((s) => s.getResult)
  const getAttempts = useAppStore((s) => s.getAttempts)
  const settings = useAppStore((s) => s.settings)

  if (!candidate) return null

  const progress = getProgress(candidate.id)
  const result = getResult(candidate.id)
  const attempts = getAttempts(candidate.id)

  const chartData = progress.map((p) => ({
    label: `T${p.taskId}A${p.assignmentId}`,
    score: p.bestScore ?? 0,
    passed: p.status === 'passed',
  }))

  const radarData = [
    { competency: 'Typing Speed', value: Math.min(100, (result.avgWpm / 50) * 100) },
    { competency: 'Typing Accuracy', value: result.avgAccuracy },
    { competency: 'Listening', value: result.listeningAccuracy },
    { competency: 'Critical Data', value: result.criticalDataAccuracy },
    { competency: 'Multitasking', value: result.multitaskingScore },
    { competency: 'Task 1 Avg', value: result.task1Average },
    { competency: 'Task 2 Avg', value: result.task2Average },
  ].map((d) => ({ ...d, value: round(d.value, 1) }))

  const exportCsv = () => {
    const rows = attempts.map((a) => ({
      candidate: candidate.fullName,
      candidateId: candidate.candidateId,
      task: a.taskId,
      assignment: a.assignmentId,
      attempt: a.attemptNumber,
      mode: a.mode,
      score: a.score,
      passed: a.passed,
      wpm: a.wpm ?? '',
      accuracy: a.accuracy ?? '',
      dataAccuracy: a.dataAccuracy ?? '',
      criticalDataAccuracy: a.criticalDataAccuracy ?? '',
      multitaskingScore: a.multitaskingScore ?? '',
      completedAt: a.completedAt,
    }))
    downloadBlob(
      new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }),
      `${candidate.candidateId}-attempts.csv`,
    )
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow={`${candidate.candidateId} · ${candidate.batch}`}
        title="Final Results"
        description="Task 1 average × 40% + Task 2 average × 60% = final certification score."
        actions={
          <>
            <Button variant="outline" onClick={exportCsv}>
              <Download className="size-4" />
              Export CSV
            </Button>
            {result.certified && (
              <Button onClick={() => navigate('/certificate')}>
                <Award className="size-4" />
                Certificate
              </Button>
            )}
          </>
        }
      />

      {/* ---- Headline ---- */}
      <Card className="mb-5 p-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <div className="flex flex-col justify-center rounded-lg border border-border bg-muted/30 p-5 text-center">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Final certification score
            </p>
            <p
              className={cn(
                'metric-value mt-1 text-6xl leading-none',
                result.certified ? 'text-emerald-700' : 'text-navy-900',
              )}
            >
              {round(result.finalScore, 1)}
            </p>
            <p className="mt-1 text-xs font-semibold text-muted-foreground">out of 100</p>
            <div className="mt-3 flex justify-center">
              <PerformanceBadge level={result.performanceLevel} />
            </div>
            <div className="mt-4 space-y-1 text-left">
              <DetailRow
                label="Task 1 average × 40%"
                value={`${round(result.task1Average, 1)} → ${round(result.task1Average * 0.4, 1)}`}
                mono
              />
              <DetailRow
                label="Task 2 average × 60%"
                value={`${round(result.task2Average, 1)} → ${round(result.task2Average * 0.6, 1)}`}
                mono
              />
            </div>
          </div>

          <div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              <Metric label="Assignments passed" value={`${result.assignmentsPassed}/${result.totalAssignments}`} size="lg" />
              <Metric label="Average WPM" value={result.avgWpm} size="lg" />
              <Metric label="Typing accuracy" value={`${result.avgAccuracy}%`} size="lg" />
              <Metric label="Listening accuracy" value={`${result.listeningAccuracy}%`} size="lg" />
              <Metric label="Critical-data accuracy" value={`${result.criticalDataAccuracy}%`} size="lg" />
              <Metric label="Multitasking" value={`${result.multitaskingScore}%`} size="lg" />
            </div>
            <div className="mt-5">
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Certification requirements
              </h3>
              <GateList gates={result.gates} />
            </div>
          </div>
        </div>
      </Card>

      {/* ---- Charts ---- */}
      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Best score per assignment
          </h2>
          <AssignmentScoreChart data={chartData} passingScore={settings.passingScore} />
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Competency profile
          </h2>
          <CompetencyRadar data={radarData} />
        </Card>
      </div>

      {attempts.length > 1 && (
        <Card className="mb-5 p-5">
          <h2 className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            <TrendingUp className="size-3.5" />
            Improvement across all attempts
          </h2>
          <AttemptTrendChart attempts={attempts} passingScore={settings.passingScore} height={200} />
        </Card>
      )}

      {/* ---- Per-task tables ---- */}
      <div className="grid gap-4 xl:grid-cols-2">
        {TASKS.map((task) => (
          <Card key={task.id} className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
              <div className="flex items-center gap-2">
                {task.id === 1 ? (
                  <Keyboard className="size-4 text-brand-700" />
                ) : (
                  <Headphones className="size-4 text-brand-700" />
                )}
                <h2 className="text-sm font-bold text-navy-900">
                  Task {task.id} — {task.title}
                </h2>
              </div>
              <span className="metric-value text-sm text-navy-900">
                {round(task.id === 1 ? result.task1Average : result.task2Average, 1)}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="data-grid">
                <thead>
                  <tr>
                    <th>Assignment</th>
                    <th className="text-right">Best</th>
                    {task.id === 1 ? (
                      <>
                        <th className="text-right">WPM</th>
                        <th className="text-right">Accuracy</th>
                      </>
                    ) : (
                      <>
                        <th className="text-right">Critical</th>
                        <th className="text-right">Multitask</th>
                      </>
                    )}
                    <th className="text-right">Attempts</th>
                    <th className="text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {task.assignments.map((assignment) => {
                    const p = findProgress(progress, task.id, assignment.id)
                    const best = attempts
                      .filter(
                        (a) =>
                          a.taskId === task.id &&
                          a.assignmentId === assignment.id &&
                          a.mode === 'certification',
                      )
                      .reduce<(typeof attempts)[number] | null>(
                        (acc, r) => (!acc || r.score > acc.score ? r : acc),
                        null,
                      )
                    return (
                      <tr key={assignment.id}>
                        <td>
                          <span className="flex items-center gap-2">
                            <span className="font-mono text-[11px] font-bold text-navy-400">
                              A{assignment.id}
                            </span>
                            <span className="truncate text-[13px] font-medium text-navy-800">
                              {assignment.title}
                            </span>
                          </span>
                        </td>
                        <td className="text-right">
                          <span className="metric-value text-sm">{p?.bestScore ?? '—'}</span>
                        </td>
                        {task.id === 1 ? (
                          <>
                            <td className="text-right tabular font-mono text-sm">{p?.bestWpm ?? '—'}</td>
                            <td className="text-right tabular font-mono text-sm">
                              {p?.bestAccuracy !== null && p?.bestAccuracy !== undefined
                                ? `${p.bestAccuracy}%`
                                : '—'}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="text-right tabular font-mono text-sm">
                              {best?.criticalDataAccuracy !== undefined
                                ? `${best.criticalDataAccuracy}%`
                                : '—'}
                            </td>
                            <td className="text-right tabular font-mono text-sm">
                              {best?.multitaskingScore !== undefined
                                ? `${best.multitaskingScore}%`
                                : '—'}
                            </td>
                          </>
                        )}
                        <td className="text-right tabular font-mono text-sm">{p?.attempts ?? 0}</td>
                        <td className="text-right">
                          <Badge
                            variant={
                              p?.status === 'passed'
                                ? 'success'
                                : p?.status === 'locked'
                                  ? 'muted'
                                  : 'warning'
                            }
                          >
                            {p?.status === 'passed'
                              ? 'Passed'
                              : p?.status === 'locked'
                                ? 'Locked'
                                : p?.status === 'in-progress'
                                  ? 'Retry'
                                  : 'Ready'}
                          </Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center gap-3 border-t border-border px-5 py-3">
              <Progress
                value={
                  (progress.filter((p) => p.taskId === task.id && p.status === 'passed').length /
                    task.assignments.length) *
                  100
                }
                tone="brand"
                size="sm"
              />
              <span className="metric-value shrink-0 text-xs text-navy-700">
                {progress.filter((p) => p.taskId === task.id && p.status === 'passed').length}/
                {task.assignments.length}
              </span>
            </div>
          </Card>
        ))}
      </div>

      {/* ---- Standing summary ---- */}
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Total attempts" value={result.totalAttempts} />
        <MetricCard label="Task 1 average" value={round(result.task1Average, 1)} />
        <MetricCard label="Task 2 average" value={round(result.task2Average, 1)} />
        <MetricCard
          label="Certification"
          value={result.certified ? 'Passed' : 'Pending'}
          tone={result.certified ? 'success' : 'warning'}
        />
      </div>
    </div>
  )
}
