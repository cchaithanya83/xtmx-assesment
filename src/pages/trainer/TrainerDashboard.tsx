import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowUpDown,
  Download,
  Search,
  ShieldCheck,
  TrendingDown,
  UserCheck,
  Users,
} from 'lucide-react'
import type { CandidateStatus, RiskLevel } from '@/types'
import { useAppStore, useRoster, useRosterKpis, type RosterRow } from '@/store/appStore'
import { STATUS_LABEL } from '@/engine/certification'
import { BATCHES } from '@/data/pools'
import { ScoreDistributionChart } from '@/components/charts'
import {
  Avatar,
  EmptyState,
  MetricCard,
  PageHeader,
  RiskBadge,
  StatusBadge,
} from '@/components/shared'
import { Badge, Button, Card, Input, Select } from '@/components/ui'
import { cn, downloadBlob, round, toCsv } from '@/lib/utils'

type SortKey = 'name' | 'score' | 'wpm' | 'accuracy' | 'attempts' | 'progress'

/**
 * Trainer / Admin overview.
 *
 * The roster is the operational surface: search, filter by batch/status/task/
 * risk, sort by any metric, drill into a candidate, and export the cohort.
 */
export default function TrainerDashboard() {
  const navigate = useNavigate()
  const rows = useRoster()
  const kpis = useRosterKpis(rows)
  const settings = useAppStore((s) => s.settings)

  const [query, setQuery] = React.useState('')
  const [batch, setBatch] = React.useState('all')
  const [status, setStatus] = React.useState('all')
  const [task, setTask] = React.useState('all')
  const [risk, setRisk] = React.useState('all')
  const [sortKey, setSortKey] = React.useState<SortKey>('score')
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('desc')

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    const out = rows.filter((row) => {
      const c = row.candidate
      if (
        q &&
        !c.fullName.toLowerCase().includes(q) &&
        !c.candidateId.toLowerCase().includes(q) &&
        !c.email.toLowerCase().includes(q)
      ) {
        return false
      }
      if (batch !== 'all' && c.batch !== batch) return false
      if (status !== 'all' && row.result.status !== status) return false
      if (task !== 'all' && String(row.currentTaskId ?? '') !== task) return false
      if (risk !== 'all' && row.result.risk !== risk) return false
      return true
    })

    const dir = sortDir === 'asc' ? 1 : -1
    return out.sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return dir * a.candidate.fullName.localeCompare(b.candidate.fullName)
        case 'wpm':
          return dir * (a.result.avgWpm - b.result.avgWpm)
        case 'accuracy':
          return dir * (a.result.avgAccuracy - b.result.avgAccuracy)
        case 'attempts':
          return dir * (a.result.totalAttempts - b.result.totalAttempts)
        case 'progress':
          return dir * (a.result.assignmentsPassed - b.result.assignmentsPassed)
        case 'score':
        default:
          return dir * (a.result.finalScore - b.result.finalScore)
      }
    })
  }, [rows, query, batch, status, task, risk, sortKey, sortDir])

  const sort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const distribution = React.useMemo(() => {
    const bands: { band: string; min: number; max: number; tone: 'emerald' | 'brand' | 'amber' | 'orange' | 'red' }[] = [
      { band: '95–100', min: 95, max: 101, tone: 'emerald' },
      { band: '85–94', min: 85, max: 95, tone: 'brand' },
      { band: '80–84', min: 80, max: 85, tone: 'amber' },
      { band: '75–79', min: 75, max: 80, tone: 'orange' },
      { band: '< 75', min: -1, max: 75, tone: 'red' },
    ]
    return bands.map((b) => ({
      band: b.band,
      tone: b.tone,
      count: rows.filter((r) => r.result.finalScore >= b.min && r.result.finalScore < b.max).length,
    }))
  }, [rows])

  const exportRoster = () => {
    const csv = toCsv(
      filtered.map((r) => ({
        candidate: r.candidate.fullName,
        candidateId: r.candidate.candidateId,
        email: r.candidate.email,
        batch: r.candidate.batch,
        location: r.candidate.location,
        trainer: r.candidate.trainerName,
        currentTask: r.currentTaskId ?? '',
        currentAssignment: r.currentAssignmentId ?? '',
        assignmentsPassed: r.result.assignmentsPassed,
        attempts: r.result.totalAttempts,
        avgWpm: r.result.avgWpm,
        avgAccuracy: r.result.avgAccuracy,
        criticalDataAccuracy: r.result.criticalDataAccuracy,
        multitasking: r.result.multitaskingScore,
        task1Average: r.result.task1Average,
        task2Average: r.result.task2Average,
        finalScore: r.result.finalScore,
        performance: r.result.performanceLevel,
        risk: r.result.risk,
        status: STATUS_LABEL[r.result.status],
        certified: r.result.certified,
      })),
    )
    downloadBlob(
      new Blob([csv], { type: 'text/csv;charset=utf-8' }),
      `xtmx-candidate-roster-${new Date().toISOString().slice(0, 10)}.csv`,
    )
  }

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        eyebrow="Trainer / Admin portal"
        title="Candidate Overview"
        description="Every candidate, their current position in the assessment, and why they passed or failed."
        actions={
          <Button variant="outline" onClick={exportRoster}>
            <Download className="size-4" />
            Export results
          </Button>
        }
      />

      {/* ---- KPIs ---- */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Total candidates" value={kpis.total} icon={<Users className="size-3.5" />} />
        <MetricCard
          label="Certified"
          value={kpis.certified}
          tone="success"
          icon={<ShieldCheck className="size-3.5" />}
        />
        <MetricCard label="In progress" value={kpis.inProgress} icon={<UserCheck className="size-3.5" />} />
        <MetricCard
          label="Needs coaching"
          value={kpis.coaching}
          tone="warning"
          icon={<AlertTriangle className="size-3.5" />}
        />
        <MetricCard
          label="Danger"
          value={kpis.danger}
          tone="danger"
          icon={<TrendingDown className="size-3.5" />}
        />
        <MetricCard label="Not certified" value={kpis.notCertified} tone="danger" />
      </div>

      {/* ---- Distribution ---- */}
      <div className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <Card className="p-5">
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Cohort score distribution
          </h2>
          <ScoreDistributionChart data={distribution} />
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Active thresholds
          </h2>
          <dl className="space-y-2 text-sm">
            <Threshold label="Passing score" value={`${settings.passingScore} / 100`} />
            <Threshold label="Minimum WPM" value={`${settings.minWpm} WPM`} />
            <Threshold label="Typing accuracy" value={`${settings.minAccuracy}%`} />
            <Threshold label="Data accuracy" value={`${settings.minDataAccuracy}%`} />
            <Threshold label="Critical-data accuracy" value={`${settings.minCriticalAccuracy}%`} />
            <Threshold label="Multitasking" value={`${settings.minMultitaskingScore}%`} />
            <Threshold
              label="Retries"
              value={settings.unlimitedRetries ? 'Unlimited' : `Max ${settings.maxAttempts}`}
            />
          </dl>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 w-full"
            onClick={() => navigate('/trainer/settings')}
          >
            Configure assessment
          </Button>
        </Card>
      </div>

      {/* ---- Filters ---- */}
      <Card className="mb-3 p-3">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-navy-300" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, ID or email…"
              className="pl-8"
            />
          </div>
          <Select value={batch} onChange={(e) => setBatch(e.target.value)}>
            <option value="all">All batches</option>
            {BATCHES.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All statuses</option>
            {(Object.keys(STATUS_LABEL) as CandidateStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
          <Select value={task} onChange={(e) => setTask(e.target.value)}>
            <option value="all">All tasks</option>
            <option value="1">Task 1 · Typing</option>
            <option value="2">Task 2 · Listening</option>
          </Select>
          <Select value={risk} onChange={(e) => setRisk(e.target.value)}>
            <option value="all">All risk levels</option>
            {(['green', 'mid', 'low', 'danger', 'below-standard'] as RiskLevel[]).map((r) => (
              <option key={r} value={r}>
                {r === 'below-standard' ? 'Below Standard' : r[0].toUpperCase() + r.slice(1)}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {/* ---- Roster ---- */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Users className="size-8" />}
          title="No candidates match these filters"
          description="Adjust the search or filters to widen the result set."
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setQuery('')
                setBatch('all')
                setStatus('all')
                setTask('all')
                setRisk('all')
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-grid min-w-[1080px]">
              <thead>
                <tr>
                  <SortHeader label="Candidate" active={sortKey === 'name'} dir={sortDir} onClick={() => sort('name')} />
                  <th>Task</th>
                  <th>Assignment</th>
                  <SortHeader label="Attempts" align="right" active={sortKey === 'attempts'} dir={sortDir} onClick={() => sort('attempts')} />
                  <SortHeader label="WPM" align="right" active={sortKey === 'wpm'} dir={sortDir} onClick={() => sort('wpm')} />
                  <SortHeader label="Accuracy" align="right" active={sortKey === 'accuracy'} dir={sortDir} onClick={() => sort('accuracy')} />
                  <SortHeader label="Score" align="right" active={sortKey === 'score'} dir={sortDir} onClick={() => sort('score')} />
                  <SortHeader label="Progress" align="right" active={sortKey === 'progress'} dir={sortDir} onClick={() => sort('progress')} />
                  <th>Risk</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <RosterTableRow
                    key={row.candidate.id}
                    row={row}
                    onOpen={() => navigate(`/trainer/candidate/${row.candidate.id}`)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
            Showing {filtered.length} of {rows.length} candidates
          </div>
        </Card>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function RosterTableRow({ row, onOpen }: { row: RosterRow; onOpen: () => void }) {
  const { candidate, result, currentTaskId, currentAssignmentId, live } = row
  return (
    <tr className="cursor-pointer" onClick={onOpen}>
      <td>
        <div className="flex items-center gap-2.5">
          <Avatar name={candidate.fullName} />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-[13px] font-semibold text-navy-900">
              {candidate.fullName}
              {live && (
                <span
                  title="Currently in an assessment"
                  className="inline-flex size-1.5 shrink-0 animate-pulse-soft rounded-full bg-brand-600"
                />
              )}
            </p>
            <p className="truncate font-mono text-[11px] text-muted-foreground">
              {candidate.candidateId} · {candidate.batch}
            </p>
          </div>
        </div>
      </td>
      <td>
        {currentTaskId ? (
          <Badge variant="outline">Task {currentTaskId}</Badge>
        ) : (
          <Badge variant="success">Complete</Badge>
        )}
      </td>
      <td className="font-mono text-[12px] text-navy-700">
        {currentTaskId && currentAssignmentId
          ? `T${currentTaskId}-A${currentAssignmentId}`
          : '—'}
      </td>
      <td className="text-right tabular font-mono text-[13px]">{result.totalAttempts}</td>
      <td className="text-right tabular font-mono text-[13px]">{result.avgWpm || '—'}</td>
      <td className="text-right tabular font-mono text-[13px]">
        {result.avgAccuracy ? `${result.avgAccuracy}%` : '—'}
      </td>
      <td className="text-right">
        <span
          className={cn(
            'metric-value text-[13px]',
            result.finalScore >= 85
              ? 'text-emerald-700'
              : result.finalScore >= 75
                ? 'text-navy-900'
                : 'text-red-700',
          )}
        >
          {round(result.finalScore, 1)}
        </span>
      </td>
      <td className="text-right tabular font-mono text-[13px]">
        {result.assignmentsPassed}/{result.totalAssignments}
      </td>
      <td>
        <RiskBadge risk={result.risk} />
      </td>
      <td>
        <StatusBadge status={result.status} />
      </td>
    </tr>
  )
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
  align = 'left',
}: {
  label: string
  active: boolean
  dir: 'asc' | 'desc'
  onClick: () => void
  align?: 'left' | 'right'
}) {
  return (
    <th className={align === 'right' ? 'text-right' : undefined}>
      <button
        onClick={onClick}
        className={cn(
          'inline-flex items-center gap-1 transition-colors hover:text-navy-900',
          active && 'text-navy-900',
        )}
      >
        {label}
        <ArrowUpDown className={cn('size-3', active ? 'opacity-100' : 'opacity-40')} />
        {active && <span className="text-[9px]">{dir === 'asc' ? '↑' : '↓'}</span>}
      </button>
    </th>
  )
}

const Threshold = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-baseline justify-between gap-3">
    <dt className="text-[13px] text-muted-foreground">{label}</dt>
    <dd className="metric-value text-[13px] text-navy-900">{value}</dd>
  </div>
)
