import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, Radio } from 'lucide-react'
import { useAppStore, useRoster } from '@/store/appStore'
import { Avatar, EmptyState, MetricCard, PageHeader, RiskBadge } from '@/components/shared'
import { Badge, Card, Progress } from '@/components/ui'
import { cn, relativeTime, round } from '@/lib/utils'

/**
 * Live assessment monitoring.
 *
 * Assessment runners publish a `LiveSession` every couple of seconds while a
 * candidate is mid-attempt; this view renders whatever is currently in flight.
 * Sessions clear themselves on submit or abandon.
 *
 * ---------------------------------------------------------------------------
 * FUTURE: multi-machine live view
 * ---------------------------------------------------------------------------
 * Live sessions are in-memory and therefore scoped to this browser. To monitor a
 * whole training room from a trainer's own machine, publish the same
 * `LiveSession` payload to a Supabase Realtime channel from
 * `appStore.publishLive()` and subscribe here — no other change is required,
 * because this component only reads `liveSessions`.
 */
export default function TrainerLive() {
  const navigate = useNavigate()
  const liveSessions = useAppStore((s) => s.liveSessions)
  const settings = useAppStore((s) => s.settings)
  const rows = useRoster()

  // Re-render on a timer so "updated Xs ago" stays honest.
  const [, force] = React.useState(0)
  React.useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  const recentlyActive = React.useMemo(
    () =>
      [...rows]
        .filter((r) => !r.live)
        .sort((a, b) => b.candidate.lastActiveAt.localeCompare(a.candidate.lastActiveAt))
        .slice(0, 8),
    [rows],
  )

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        eyebrow="Trainer / Admin portal"
        title="Live Assessment Monitoring"
        description="Candidates currently taking an assessment, with live speed, accuracy and provisional score."
        actions={
          <span className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold text-navy-800">
            <span
              className={cn(
                'inline-flex size-2 rounded-full',
                liveSessions.length ? 'animate-pulse-soft bg-brand-600' : 'bg-navy-200',
              )}
            />
            {liveSessions.length} active
          </span>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Active sessions" value={liveSessions.length} icon={<Radio className="size-3.5" />} />
        <MetricCard
          label="Avg live WPM"
          value={
            liveSessions.filter((l) => l.wpm > 0).length
              ? round(
                  liveSessions.filter((l) => l.wpm > 0).reduce((n, l) => n + l.wpm, 0) /
                    liveSessions.filter((l) => l.wpm > 0).length,
                )
              : '—'
          }
        />
        <MetricCard
          label="At risk now"
          value={liveSessions.filter((l) => l.risk === 'danger' || l.risk === 'below-standard').length}
          tone="danger"
        />
        <MetricCard label="Cohort size" value={rows.length} />
      </div>

      {liveSessions.length === 0 ? (
        <EmptyState
          icon={<Activity className="size-8" />}
          title="No assessments in progress"
          description="Live rows appear here the moment a candidate begins an assignment on this machine. Recently active candidates are listed below."
        />
      ) : (
        <Card className="mb-5 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-grid min-w-[900px]">
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Live task</th>
                  <th className="text-right">WPM</th>
                  <th className="text-right">Accuracy</th>
                  <th className="w-[180px]">Progress</th>
                  <th className="text-right">Current score</th>
                  <th>Risk</th>
                  <th className="text-right">Updated</th>
                </tr>
              </thead>
              <tbody>
                {liveSessions.map((session) => (
                  <tr
                    key={session.candidateId}
                    className="cursor-pointer"
                    onClick={() => navigate(`/trainer/candidate/${session.candidateId}`)}
                  >
                    <td>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={session.candidateName || 'Candidate'} />
                        <div>
                          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-navy-900">
                            {session.candidateName || 'Candidate'}
                            <span className="inline-flex size-1.5 animate-pulse-soft rounded-full bg-brand-600" />
                          </p>
                          <p className="text-[11px] text-muted-foreground">In assessment</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Badge variant="accent">
                        T{session.taskId}-A{session.assignmentId}
                      </Badge>
                    </td>
                    <td className="text-right">
                      <span
                        className={cn(
                          'metric-value text-[13px]',
                          session.taskId === 2
                            ? 'text-navy-300'
                            : session.wpm >= settings.minWpm
                              ? 'text-emerald-700'
                              : 'text-red-700',
                        )}
                      >
                        {session.taskId === 2 ? '—' : session.wpm}
                      </span>
                    </td>
                    <td className="text-right">
                      <span
                        className={cn(
                          'metric-value text-[13px]',
                          session.taskId === 2
                            ? 'text-navy-300'
                            : session.accuracy >= settings.minAccuracy
                              ? 'text-emerald-700'
                              : 'text-red-700',
                        )}
                      >
                        {session.taskId === 2 ? '—' : `${round(session.accuracy)}%`}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <Progress value={session.progress} tone="brand" size="sm" className="flex-1" />
                        <span className="metric-value w-9 shrink-0 text-right text-[11px] text-navy-700">
                          {round(session.progress)}%
                        </span>
                      </div>
                    </td>
                    <td className="text-right">
                      <span className="metric-value text-[13px] text-navy-900">
                        {round(session.currentScore)}
                      </span>
                    </td>
                    <td>
                      <RiskBadge risk={session.risk} />
                    </td>
                    <td className="text-right text-[11px] text-muted-foreground">
                      {relativeTime(session.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ---- Recently active ---- */}
      <h2 className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        Recently active candidates
      </h2>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {recentlyActive.map((row) => (
          <button
            key={row.candidate.id}
            onClick={() => navigate(`/trainer/candidate/${row.candidate.id}`)}
            className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/30"
          >
            <Avatar name={row.candidate.fullName} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-navy-900">
                {row.candidate.fullName}
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {row.currentTaskId
                  ? `T${row.currentTaskId}-A${row.currentAssignmentId}`
                  : 'Complete'}{' '}
                · {relativeTime(row.candidate.lastActiveAt)}
              </span>
            </span>
            <span className="metric-value shrink-0 text-sm text-navy-900">
              {round(row.result.finalScore)}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
