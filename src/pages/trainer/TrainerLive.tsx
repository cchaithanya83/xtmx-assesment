import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, Loader2, Radio, RefreshCw } from 'lucide-react'
import { trainer } from '@/api/client'
import { usePolledApi } from '@/hooks/useApi'
import { getAssignment } from '@/data/tasks'
import { Avatar, EmptyState, MetricCard, PageHeader } from '@/components/shared'
import { Badge, Button, Card, Progress } from '@/components/ui'
import { cn, formatDuration, relativeTime } from '@/lib/utils'

/** How often the live view re-queries the API. */
const POLL_MS = 5000

/**
 * Live assessment monitoring.
 *
 * Backed by real server state: every assessment session that has been issued
 * and not yet submitted. Unlike the previous in-browser implementation this
 * shows candidates working on *any* machine, which is what a training room
 * actually needs.
 *
 * It polls rather than subscribing. A websocket would add a second transport
 * and a second failure mode for a screen whose data changes every few seconds
 * at most; a 5-second poll that pauses on a hidden tab is the better trade.
 */
export default function TrainerLive() {
  const navigate = useNavigate()
  const live = usePolledApi(() => trainer.live(), POLL_MS, [])

  // Re-render on a timer so the elapsed columns stay honest between polls.
  const [, tick] = React.useState(0)
  React.useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  const sessions = live.data?.sessions ?? []
  const now = Date.now()

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        eyebrow="Trainer / Admin portal"
        title="Live Assessment Monitoring"
        description="Assessments currently open, across every machine. Refreshes automatically."
        actions={
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold text-navy-800">
              <span
                className={cn(
                  'inline-flex size-2 rounded-full',
                  sessions.length ? 'animate-pulse-soft bg-brand-600' : 'bg-navy-200',
                )}
              />
              {sessions.length} active
            </span>
            <Button variant="outline" size="sm" onClick={live.refetch} disabled={live.loading}>
              {live.loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Refresh
            </Button>
          </div>
        }
      />

      {live.error && (
        <p
          role="alert"
          className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800"
        >
          {live.error}
        </p>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard
          label="Active sessions"
          value={sessions.length}
          icon={<Radio className="size-3.5" />}
        />
        <MetricCard
          label="Task 1 · typing"
          value={sessions.filter((s) => s.taskId === 1).length}
        />
        <MetricCard
          label="Task 2 · listening"
          value={sessions.filter((s) => s.taskId === 2).length}
        />
        <MetricCard
          label="Practice runs"
          value={sessions.filter((s) => s.mode === 'practice').length}
        />
      </div>

      {sessions.length === 0 ? (
        <EmptyState
          icon={<Activity className="size-8" />}
          title="No assessments in progress"
          description="A row appears here the moment any candidate starts an assignment, on any machine. This view refreshes every few seconds."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-grid min-w-[960px]">
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Assignment</th>
                  <th>Mode</th>
                  <th className="text-right">Attempt</th>
                  <th className="w-[200px]">Time used</th>
                  <th className="text-right">Started</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const assignment = getAssignment(s.taskId, s.assignmentId)
                  const elapsed = (now - new Date(s.startedAt).getTime()) / 1000
                  const ratio = Math.min(100, (elapsed / assignment.timeLimitSeconds) * 100)
                  return (
                    <tr
                      key={s.sessionId}
                      className="cursor-pointer"
                      onClick={() => navigate(`/trainer/candidate/${s.candidateId}`)}
                    >
                      <td>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={s.candidateName} />
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-navy-900">
                              {s.candidateName}
                              <span className="inline-flex size-1.5 shrink-0 animate-pulse-soft rounded-full bg-brand-600" />
                            </p>
                            <p className="truncate font-mono text-[11px] text-muted-foreground">
                              {s.candidateCode} · {s.batch}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <Badge variant="accent">
                            T{s.taskId}-A{s.assignmentId}
                          </Badge>
                          <span className="hidden text-[13px] text-navy-800 xl:inline">
                            {assignment.title}
                          </span>
                        </div>
                      </td>
                      <td>
                        <Badge variant={s.mode === 'practice' ? 'muted' : 'outline'}>
                          {s.mode === 'practice' ? 'Practice' : 'Certification'}
                        </Badge>
                      </td>
                      <td className="text-right tabular font-mono text-[13px]">
                        #{s.attemptNumber}
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <Progress
                            value={ratio}
                            tone={ratio > 85 ? 'red' : ratio > 65 ? 'amber' : 'brand'}
                            size="sm"
                            className="flex-1"
                          />
                          <span className="metric-value w-16 shrink-0 text-right text-[11px] text-navy-700">
                            {formatDuration(elapsed)}
                          </span>
                        </div>
                      </td>
                      <td className="text-right text-[11px] text-muted-foreground">
                        {relativeTime(s.startedAt)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <p className="mt-4 rounded-md border border-border bg-muted/40 px-4 py-3 text-[13px] leading-relaxed text-navy-700">
        <strong className="font-semibold">What this shows.</strong> An assessment session is created
        when a candidate starts an assignment and closed when they submit. Live scores are
        deliberately absent: an attempt is graded on submission, and showing a provisional score
        would mean grading partial work on the server for every poll.
      </p>
    </div>
  )
}
