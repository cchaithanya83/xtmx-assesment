import * as React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ChevronLeft,
  Download,
  Mail,
  MapPin,
  RotateCcw,
  ShieldAlert,
  Loader2,
  Users,
} from 'lucide-react'
import type { Attempt, TaskId } from '@/types'
import { TASKS } from '@/data/tasks'
import { useAppStore } from '@/store/appStore'
import { trainer } from '@/api/client'
import { useApi } from '@/hooks/useApi'
import { findProgress } from '@/engine/certification'
import {
  AssignmentScoreChart,
  AttemptTrendChart,
  CompetencyRadar,
  SpeedAccuracyChart,
} from '@/components/charts'
import { AttemptRow } from '@/pages/AttemptHistory'
import {
  DetailRow,
  EmptyState,
  GateList,
  Metric,
  MetricCard,
  PageHeader,
  PerformanceBadge,
  RiskBadge,
  StatusBadge,
} from '@/components/shared'
import { Badge, Button, Card, Dialog, Tabs } from '@/components/ui'
import { cn, downloadBlob, formatDate, round, toCsv } from '@/lib/utils'

/**
 * Trainer candidate drill-down.
 *
 * Product rule #4: both the first attempt and the best attempt stay visible, so
 * a trainer can see the improvement trajectory, not just the final number.
 * Product rule #7: the exact pass/fail gates are always shown.
 */
export default function TrainerCandidateDetail() {
  const { candidateId = '' } = useParams()
  const navigate = useNavigate()

  const settings = useAppStore((s) => s.settings)

  // One candidate, fetched on demand. Staff-only on the server.
  const detail = useApi(() => trainer.candidate(candidateId), [candidateId])

  const [tab, setTab] = React.useState<'overview' | 'assignments' | 'attempts' | 'integrity'>(
    'overview',
  )
  const [confirmReset, setConfirmReset] = React.useState<
    { taskId: TaskId; assignmentId: number } | 'all' | null
  >(null)

  if (detail.loading && !detail.data) {
    return (
      <div className="mx-auto max-w-3xl py-16 text-center">
        <Loader2 className="mx-auto size-5 animate-spin text-navy-300" />
        <p className="mt-2 text-sm text-muted-foreground">Loading candidate…</p>
      </div>
    )
  }

  if (!detail.data) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={<Users className="size-8" />}
          title={detail.error ?? 'Candidate not found'}
          action={
            <Button variant="outline" onClick={() => navigate('/trainer')}>
              Back to overview
            </Button>
          }
        />
      </div>
    )
  }

  const { candidate, attempts, progress, result } = detail.data
  const flagged = attempts.filter((a: Attempt) => a.integrity.flagged)

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
    { competency: 'Task 1', value: result.task1Average },
    { competency: 'Task 2', value: result.task2Average },
  ].map((d) => ({ ...d, value: round(d.value, 1) }))

  const exportCandidate = () => {
    const csv = toCsv(
      attempts.map((a: Attempt) => ({
        candidate: candidate.fullName,
        candidateId: candidate.candidateId,
        batch: candidate.batch,
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
        correctionScore: a.correctionScore ?? '',
        keystrokes: a.totalKeystrokes,
        backspaces: a.backspaces,
        completion: a.completionPercentage,
        blurCount: a.integrity.blurCount,
        flagged: a.integrity.flagged,
        startedAt: a.startedAt,
        completedAt: a.completedAt,
      })),
    )
    downloadBlob(
      new Blob([csv], { type: 'text/csv;charset=utf-8' }),
      `${candidate.candidateId}-full-history.csv`,
    )
  }

  return (
    <div className="mx-auto max-w-[1500px]">
      <button
        onClick={() => navigate('/trainer')}
        className="mb-3 flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-navy-900"
      >
        <ChevronLeft className="size-4" />
        Back to candidate overview
      </button>

      <PageHeader
        eyebrow={`${candidate.candidateId} · ${candidate.batch}`}
        title={candidate.fullName}
        description={`Trainer: ${candidate.trainerName} · Registered ${formatDate(candidate.createdAt)}`}
        actions={
          <>
            <Button variant="outline" onClick={exportCandidate}>
              <Download className="size-4" />
              Export
            </Button>
            <Button variant="destructive" onClick={() => setConfirmReset('all')}>
              <RotateCcw className="size-4" />
              Reset all
            </Button>
          </>
        }
      />

      {/* ---- Profile + standing ---- */}
      <div className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
        <Card className="p-5">
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Profile
          </h2>
          <div className="divide-y divide-border">
            <DetailRow label="Candidate ID" value={candidate.candidateId} mono />
            <DetailRow label="Batch / cohort" value={candidate.batch} mono />
            <DetailRow
              label="Location"
              value={
                <span className="flex items-center gap-1">
                  <MapPin className="size-3 text-navy-300" />
                  {candidate.location}
                </span>
              }
            />
            <DetailRow
              label="Email"
              value={
                <span className="flex items-center gap-1 text-[12px]">
                  <Mail className="size-3 text-navy-300" />
                  {candidate.email}
                </span>
              }
            />
            <DetailRow label="Trainer" value={candidate.trainerName} />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <StatusBadge status={result.status} />
            <RiskBadge risk={result.risk} />
          </div>
          <div className="mt-2">
            <PerformanceBadge level={result.performanceLevel} />
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Overall metrics
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Metric
              label="Final score"
              value={round(result.finalScore, 1)}
              unit="/100"
              size="lg"
              tone={result.certified ? 'success' : 'default'}
            />
            <Metric label="Avg WPM" value={result.avgWpm} size="lg" />
            <Metric label="Avg accuracy" value={`${result.avgAccuracy}%`} size="lg" />
            <Metric label="Critical accuracy" value={`${result.criticalDataAccuracy}%`} size="lg" />
            <Metric label="Listening accuracy" value={`${result.listeningAccuracy}%`} size="lg" />
            <Metric label="Multitasking" value={`${result.multitaskingScore}%`} size="lg" />
            <Metric
              label="Assignments"
              value={`${result.assignmentsPassed}/${result.totalAssignments}`}
              size="lg"
            />
            <Metric label="Total attempts" value={result.totalAttempts} size="lg" />
          </div>

          <div className="mt-5">
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Why this candidate is {result.certified ? 'certified' : 'not yet certified'}
            </h3>
            <GateList gates={result.gates} />
          </div>
        </Card>
      </div>

      <Tabs
        className="mb-4"
        value={tab}
        onChange={(v) => setTab(v as typeof tab)}
        items={[
          { value: 'overview', label: 'Analytics' },
          { value: 'assignments', label: 'Assignments', count: progress.length },
          { value: 'attempts', label: 'Attempt history', count: attempts.length },
          { value: 'integrity', label: 'Integrity', count: flagged.length },
        ]}
      />

      {/* ---- Analytics ---- */}
      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Attempt number vs score
            </h2>
            {attempts.length ? (
              <AttemptTrendChart attempts={attempts} passingScore={settings.passingScore} />
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">No attempts yet</p>
            )}
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              WPM vs accuracy
            </h2>
            <SpeedAccuracyChart
              attempts={attempts}
              minWpm={settings.minWpm}
              minAccuracy={settings.minAccuracy}
            />
          </Card>
          <Card className="p-5">
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
      )}

      {/* ---- Assignment breakdown ---- */}
      {tab === 'assignments' && (
        <div className="space-y-4">
          {TASKS.map((task) => (
            <Card key={task.id} className="overflow-hidden">
              <div className="border-b border-border px-5 py-3">
                <h2 className="text-sm font-bold text-navy-900">
                  Task {task.id} — {task.title}
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="data-grid min-w-[880px]">
                  <thead>
                    <tr>
                      <th>Assignment</th>
                      <th className="text-right">First</th>
                      <th className="text-right">Best</th>
                      <th className="text-right">Improvement</th>
                      <th className="text-right">Attempts</th>
                      <th className="text-right">WPM</th>
                      <th className="text-right">Accuracy</th>
                      <th>Status</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {task.assignments.map((assignment) => {
                      const p = findProgress(progress, task.id, assignment.id)
                      const first = attempts.find((a: Attempt) => a.id === p?.firstAttemptId)
                      return (
                        <tr key={assignment.id}>
                          <td>
                            <span className="flex items-center gap-2">
                              <span className="font-mono text-[11px] font-bold text-navy-400">
                                A{assignment.id}
                              </span>
                              <span className="text-[13px] font-medium text-navy-800">
                                {assignment.title}
                              </span>
                            </span>
                          </td>
                          <td className="text-right tabular font-mono text-[13px] text-muted-foreground">
                            {first?.score ?? '—'}
                          </td>
                          <td className="text-right">
                            <span className="metric-value text-[13px]">{p?.bestScore ?? '—'}</span>
                          </td>
                          <td className="text-right">
                            <span
                              className={cn(
                                'metric-value text-[13px]',
                                (p?.improvementPercentage ?? 0) > 0
                                  ? 'text-emerald-700'
                                  : 'text-muted-foreground',
                              )}
                            >
                              {p?.improvementPercentage !== null &&
                              p?.improvementPercentage !== undefined
                                ? `${p.improvementPercentage > 0 ? '+' : ''}${p.improvementPercentage}%`
                                : '—'}
                            </span>
                          </td>
                          <td className="text-right tabular font-mono text-[13px]">
                            {p?.attempts ?? 0}
                          </td>
                          <td className="text-right tabular font-mono text-[13px]">
                            {p?.bestWpm ?? '—'}
                          </td>
                          <td className="text-right tabular font-mono text-[13px]">
                            {p?.bestAccuracy != null ? `${p.bestAccuracy}%` : '—'}
                          </td>
                          <td>
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
                                    ? 'Retry required'
                                    : 'Unlocked'}
                            </Badge>
                          </td>
                          <td className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={!p?.attempts}
                              onClick={() =>
                                setConfirmReset({ taskId: task.id, assignmentId: assignment.id })
                              }
                            >
                              <RotateCcw className="size-3.5" />
                              Reset
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ---- Attempts ---- */}
      {tab === 'attempts' &&
        (attempts.length ? (
          <div className="space-y-2">
            {[...attempts].reverse().map((attempt: Attempt) => (
              <AttemptRow key={attempt.id} attempt={attempt} />
            ))}
          </div>
        ) : (
          <EmptyState title="No attempts recorded" description="This candidate has not started the assessment." />
        ))}

      {/* ---- Integrity ---- */}
      {tab === 'integrity' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MetricCard
              label="Flagged attempts"
              value={flagged.length}
              tone={flagged.length ? 'warning' : 'default'}
              icon={<ShieldAlert className="size-3.5" />}
            />
            <MetricCard
              label="Total focus losses"
              value={attempts.reduce((n: number, a: Attempt) => n + a.integrity.blurCount, 0)}
            />
            <MetricCard
              label="Blocked pastes"
              value={attempts.reduce((n: number, a: Attempt) => n + a.integrity.pasteAttempts, 0)}
            />
            <MetricCard
              label="Flag threshold"
              value={`${settings.flagBlurThreshold} blurs`}
            />
          </div>

          <p className="rounded-md border border-border bg-muted/40 px-4 py-3 text-[13px] text-navy-700">
            Integrity signals are advisory. A single focus loss is normal during a training session
            and never fails an attempt on its own — review the pattern alongside the score before
            drawing a conclusion.
          </p>

          {flagged.length ? (
            <Card className="overflow-hidden">
              <table className="data-grid">
                <thead>
                  <tr>
                    <th>Attempt</th>
                    <th className="text-right">Focus losses</th>
                    <th className="text-right">Blocked pastes</th>
                    <th className="text-right">Score</th>
                    <th>Events</th>
                  </tr>
                </thead>
                <tbody>
                  {flagged.map((a: Attempt) => (
                    <tr key={a.id}>
                      <td className="font-mono text-[12px]">
                        T{a.taskId}-A{a.assignmentId} · #{a.attemptNumber}
                      </td>
                      <td className="text-right tabular font-mono text-[13px]">
                        {a.integrity.blurCount}
                      </td>
                      <td className="text-right tabular font-mono text-[13px]">
                        {a.integrity.pasteAttempts}
                      </td>
                      <td className="text-right">
                        <span className="metric-value text-[13px]">{a.score}</span>
                      </td>
                      <td className="text-[11px] text-muted-foreground">
                        {a.integrity.events.length
                          ? `${a.integrity.events.length} event(s) logged`
                          : 'No detail recorded'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ) : (
            <EmptyState
              title="No integrity flags"
              description="No attempt from this candidate crossed the configured review threshold."
            />
          )}
        </div>
      )}

      {/* ---- Reset confirmation ---- */}
      <Dialog
        open={confirmReset !== null}
        onClose={() => setConfirmReset(null)}
        title={confirmReset === 'all' ? 'Reset all assignments?' : 'Reset this assignment?'}
        description={
          confirmReset === 'all'
            ? `This permanently deletes every attempt for ${candidate.fullName} and revokes any certificate. This cannot be undone.`
            : 'This permanently deletes every attempt for this assignment and re-locks any assignments that depended on it. This cannot be undone.'
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmReset(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const target = confirmReset === 'all' ? undefined : (confirmReset ?? undefined)
                void trainer
                  .reset(candidate.id, target)
                  .then(() => detail.refetch())
                  .finally(() => setConfirmReset(null))
              }}
            >
              Confirm reset
            </Button>
          </>
        }
      />
    </div>
  )
}
