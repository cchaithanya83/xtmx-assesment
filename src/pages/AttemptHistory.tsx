import * as React from 'react'
import { ChevronDown, ChevronRight, History, ShieldAlert } from 'lucide-react'
import type { Attempt } from '@/types'
import { TASKS } from '@/data/tasks'
import { useAppStore, useCurrentCandidate } from '@/store/appStore'
import { me } from '@/api/client'
import { AttemptTrendChart, SpeedAccuracyChart } from '@/components/charts'
import { EmptyState, FeedbackPanel, GateList, PageHeader } from '@/components/shared'
import { Badge, Button, Card, Tabs } from '@/components/ui'
import { cn, formatDateTime, formatDuration, round } from '@/lib/utils'

/**
 * Full attempt log for the signed-in candidate.
 *
 * Every attempt is retained — retrying never erases history (product rule #3),
 * so the first attempt and the best attempt both remain visible.
 */
export default function AttemptHistory() {
  const candidate = useCurrentCandidate()
  const settings = useAppStore((s) => s.settings)
  const [filter, setFilter] = React.useState<'all' | '1' | '2'>('all')
  const [all, setAll] = React.useState<Attempt[]>([])
  const [loading, setLoading] = React.useState(true)

  // Fetched per view and scoped to the caller by the server — a candidate
  // cannot widen this to anyone else's history.
  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    me.attempts()
      .then((data) => {
        if (!cancelled) setAll(data.attempts)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!candidate) return null

  const attempts = all.filter((a) => filter === 'all' || String(a.taskId) === filter)

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Attempt History"
        description="Every attempt is permanently recorded. Retrying an assignment never removes a previous attempt."
      />

      {loading ? (
        <EmptyState title="Loading your attempt history…" />
      ) : all.length === 0 ? (
        <EmptyState
          icon={<History className="size-8" />}
          title="No attempts recorded yet"
          description="Start Task 1 Assignment 1 to begin building your assessment history."
        />
      ) : (
        <>
          <div className="mb-5 grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Score trend by attempt
              </h2>
              <AttemptTrendChart attempts={all} passingScore={settings.passingScore} />
            </Card>
            <Card className="p-5">
              <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Typing speed vs accuracy
              </h2>
              <SpeedAccuracyChart
                attempts={all}
                minWpm={settings.minWpm}
                minAccuracy={settings.minAccuracy}
              />
            </Card>
          </div>

          <Tabs
            className="mb-4"
            value={filter}
            onChange={(v) => setFilter(v as typeof filter)}
            items={[
              { value: 'all', label: 'All attempts', count: all.length },
              { value: '1', label: 'Task 1 · Typing', count: all.filter((a) => a.taskId === 1).length },
              { value: '2', label: 'Task 2 · Listening', count: all.filter((a) => a.taskId === 2).length },
            ]}
          />

          <div className="space-y-2">
            {[...attempts].reverse().map((attempt) => (
              <AttemptRow key={attempt.id} attempt={attempt} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */

export function AttemptRow({ attempt, dense }: { attempt: Attempt; dense?: boolean }) {
  const [open, setOpen] = React.useState(false)
  const task = TASKS.find((t) => t.id === attempt.taskId)
  const assignment = task?.assignments.find((a) => a.id === attempt.assignmentId)
  const elapsed =
    (new Date(attempt.completedAt).getTime() - new Date(attempt.startedAt).getTime()) / 1000

  return (
    <Card className={cn('overflow-hidden', attempt.passed && 'border-emerald-200')}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
      >
        {open ? (
          <ChevronDown className="size-4 shrink-0 text-navy-400" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-navy-400" />
        )}

        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="font-mono text-[11px] font-bold text-brand-700">
            T{attempt.taskId}-A{attempt.assignmentId}
          </span>
          {!dense && (
            <span className="truncate text-sm font-semibold text-navy-900">
              {assignment?.title}
            </span>
          )}
          <Badge variant="outline">Attempt {attempt.attemptNumber}</Badge>
          {attempt.mode === 'practice' && <Badge variant="accent">Practice</Badge>}
          {attempt.integrity.flagged && (
            <Badge variant="warning">
              <ShieldAlert className="size-3" />
              Flagged
            </Badge>
          )}
          <span className="text-[11px] text-muted-foreground">
            {formatDateTime(attempt.completedAt)}
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-4 sm:gap-6">
          {attempt.taskId === 1 ? (
            <>
              <Cell label="WPM" value={String(attempt.wpm ?? '—')} />
              <Cell label="Accuracy" value={`${attempt.accuracy ?? 0}%`} />
            </>
          ) : (
            <>
              <Cell label="Data" value={`${attempt.dataAccuracy ?? 0}%`} />
              <Cell label="Critical" value={`${attempt.criticalDataAccuracy ?? 0}%`} />
            </>
          )}
          <Cell label="Score" value={String(attempt.score)} strong />
          <Badge variant={attempt.passed ? 'success' : 'danger'}>
            {attempt.passed ? 'Passed' : 'Failed'}
          </Badge>
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-border bg-muted/20 p-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Feedback
              </h4>
              <FeedbackPanel feedback={attempt.feedback} />
            </div>
            <div>
              <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Passing gates
              </h4>
              <GateList gates={attempt.gates} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border border-border bg-card p-4 sm:grid-cols-4 lg:grid-cols-6">
            <Detail label="Time taken" value={formatDuration(elapsed)} />
            <Detail label="Completion" value={`${round(attempt.completionPercentage)}%`} />
            <Detail label="Keystrokes" value={String(attempt.totalKeystrokes)} />
            <Detail label="Errors" value={String(attempt.incorrectKeystrokes)} />
            <Detail label="Backspaces" value={String(attempt.backspaces)} />
            {attempt.typingMetrics && (
              <Detail
                label="Uncorrected errors"
                value={String(attempt.typingMetrics.uncorrectedErrors)}
              />
            )}
            {attempt.multitaskingScore !== undefined && (
              <Detail label="Multitasking" value={`${attempt.multitaskingScore}%`} />
            )}
            {attempt.correctionScore !== undefined && (
              <Detail label="Correction handling" value={`${attempt.correctionScore}%`} />
            )}
            <Detail label="Focus losses" value={String(attempt.integrity.blurCount)} />
            <Detail label="Blocked pastes" value={String(attempt.integrity.pasteAttempts)} />
          </div>
        </div>
      )}
    </Card>
  )
}

const Cell = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <span className="hidden text-right sm:block">
    <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {label}
    </span>
    <span className={cn('metric-value block text-sm', strong ? 'text-navy-900' : 'text-navy-700')}>
      {value}
    </span>
  </span>
)

const Detail = ({ label, value }: { label: string; value: string }) => (
  <div>
    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {label}
    </p>
    <p className="metric-value text-sm text-navy-900">{value}</p>
  </div>
)

export { Button }
