import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Search,
  ShieldCheck,
  TrendingDown,
  UserCheck,
  Users,
} from 'lucide-react'
import type { CandidateStatus, PerformanceLevel, RiskLevel } from '@/types'
import { trainer, type RosterRow } from '@/api/client'
import { useApi, useDebounced } from '@/hooks/useApi'
import { classifyPerformance, classifyRisk, STATUS_LABEL } from '@/engine/certification'
import { TOTAL_ASSIGNMENTS } from '@/data/tasks'
import { ScoreDistributionChart } from '@/components/charts'
import {
  Avatar,
  EmptyState,
  MetricCard,
  PageHeader,
  PerformanceBadge,
  RiskBadge,
  StatusBadge,
} from '@/components/shared'
import { Badge, Button, Card, Input, Select } from '@/components/ui'
import { cn, downloadBlob, round, toCsv } from '@/lib/utils'

const PAGE_SIZE = 25

/**
 * Trainer / Admin overview.
 *
 * Every number on this page is computed in Postgres and paged over the API —
 * the browser never receives the full attempt history of the cohort. Searching,
 * filtering and sorting are query parameters, not array operations.
 */
export default function TrainerDashboard() {
  const navigate = useNavigate()

  const [search, setSearch] = React.useState('')
  const [batch, setBatch] = React.useState('all')
  const [status, setStatus] = React.useState('all')
  const [risk, setRisk] = React.useState('all')
  const [sort, setSort] = React.useState('score')
  const [direction, setDirection] = React.useState<'asc' | 'desc'>('desc')
  const [page, setPage] = React.useState(0)

  const debouncedSearch = useDebounced(search)

  React.useEffect(() => setPage(0), [debouncedSearch, batch, sort, direction])

  const roster = useApi(
    () =>
      trainer.roster({
        search: debouncedSearch,
        batch,
        sort,
        direction,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    [debouncedSearch, batch, sort, direction, page],
  )

  const batches = useApi(() => trainer.batches(), [])

  const settings = roster.data?.settings
  const rows = React.useMemo(() => roster.data?.rows ?? [], [roster.data])

  /**
   * Status and risk are presentation-level derivations of the aggregate the
   * server returned, so they are applied here rather than in SQL. They are
   * filters over the current page only — which is why the count is labelled
   * "on this page".
   */
  const decorated = React.useMemo(
    () =>
      rows.map((row) => {
        const certified = row.certified
        const derivedStatus: CandidateStatus = certified
          ? 'certified'
          : row.totalAttempts === 0
            ? 'not-started'
            : row.assignmentsPassed === TOTAL_ASSIGNMENTS
              ? 'not-certified'
              : row.finalScore > 0 && row.finalScore < 70
                ? 'danger'
                : row.finalScore > 0 && row.finalScore < 78
                  ? 'needs-coaching'
                  : 'in-progress'
        return {
          row,
          status: derivedStatus,
          risk: classifyRisk(row.finalScore, certified, row.assignmentsPassed),
          performance: classifyPerformance(row.finalScore, certified),
        }
      }),
    [rows],
  )

  const visible = decorated.filter(
    (d) => (status === 'all' || d.status === status) && (risk === 'all' || d.risk === risk),
  )

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
      count: rows.filter((r) => r.finalScore >= b.min && r.finalScore < b.max).length,
    }))
  }, [rows])

  const kpis = React.useMemo(
    () => ({
      total: roster.data?.total ?? 0,
      certified: decorated.filter((d) => d.status === 'certified').length,
      inProgress: decorated.filter((d) => d.status === 'in-progress').length,
      coaching: decorated.filter((d) => d.status === 'needs-coaching').length,
      danger: decorated.filter((d) => d.status === 'danger').length,
      notCertified: decorated.filter((d) => d.status === 'not-certified').length,
    }),
    [decorated, roster.data],
  )

  const toggleSort = (key: string) => {
    if (sort === key) setDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSort(key)
      setDirection('desc')
    }
  }

  /** Exports the current page. The full cohort export lives on Results & Export. */
  const exportPage = () => {
    downloadBlob(
      new Blob(
        [
          toCsv(
            visible.map((d) => ({
              candidate: d.row.fullName,
              candidateId: d.row.candidateId,
              email: d.row.email,
              batch: d.row.batch,
              location: d.row.location,
              trainer: d.row.trainerName,
              assignmentsPassed: d.row.assignmentsPassed,
              attempts: d.row.totalAttempts,
              avgWpm: d.row.avgWpm,
              avgAccuracy: d.row.avgAccuracy,
              criticalDataAccuracy: d.row.criticalDataAccuracy,
              multitasking: d.row.multitaskingScore,
              task1Average: d.row.task1Average,
              task2Average: d.row.task2Average,
              finalScore: d.row.finalScore,
              performance: d.performance,
              risk: d.risk,
              status: STATUS_LABEL[d.status],
              certified: d.row.certified,
            })),
          ),
        ],
        { type: 'text/csv;charset=utf-8' },
      ),
      `xtmx-roster-page-${page + 1}.csv`,
    )
  }

  const total = roster.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        eyebrow="Trainer / Admin portal"
        title="Candidate Overview"
        description="Every candidate, their current position in the assessment, and why they passed or failed."
        actions={
          <Button variant="outline" onClick={exportPage} disabled={!visible.length}>
            <Download className="size-4" />
            Export page
          </Button>
        }
      />

      {roster.error && (
        <p
          role="alert"
          className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800"
        >
          {roster.error}
        </p>
      )}

      {/* ---- KPIs ---- */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Total candidates" value={kpis.total} icon={<Users className="size-3.5" />} />
        <MetricCard
          label="Certified"
          value={kpis.certified}
          tone="success"
          icon={<ShieldCheck className="size-3.5" />}
          hint="on this page"
        />
        <MetricCard
          label="In progress"
          value={kpis.inProgress}
          icon={<UserCheck className="size-3.5" />}
          hint="on this page"
        />
        <MetricCard
          label="Needs coaching"
          value={kpis.coaching}
          tone="warning"
          icon={<AlertTriangle className="size-3.5" />}
          hint="on this page"
        />
        <MetricCard
          label="Danger"
          value={kpis.danger}
          tone="danger"
          icon={<TrendingDown className="size-3.5" />}
          hint="on this page"
        />
        <MetricCard label="Not certified" value={kpis.notCertified} tone="danger" hint="on this page" />
      </div>

      {/* ---- Distribution + thresholds ---- */}
      <div className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <Card className="p-5">
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Score distribution (current page)
          </h2>
          <ScoreDistributionChart data={distribution} />
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Active thresholds
          </h2>
          {settings ? (
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
          ) : (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
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
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-navy-300" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, ID or email…"
              className="pl-8"
            />
          </div>
          <Select value={batch} onChange={(e) => setBatch(e.target.value)}>
            <option value="all">All batches</option>
            {(batches.data?.batches ?? []).map((b) => (
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
          <Select value={risk} onChange={(e) => setRisk(e.target.value)}>
            <option value="all">All risk levels</option>
            {(['green', 'mid', 'low', 'danger', 'below-standard'] as RiskLevel[]).map((r) => (
              <option key={r} value={r}>
                {r === 'below-standard' ? 'Below Standard' : r[0].toUpperCase() + r.slice(1)}
              </option>
            ))}
          </Select>
        </div>
        <p className="mt-2 px-1 text-[11px] text-muted-foreground">
          Search and batch filter the whole cohort on the server. Status and risk refine the
          {' '}{PAGE_SIZE} rows on this page.
        </p>
      </Card>

      {/* ---- Roster ---- */}
      {roster.loading && !roster.data ? (
        <Card className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading candidates…
        </Card>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Users className="size-8" />}
          title="No candidates match these filters"
          description="Adjust the search or filters to widen the result set."
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch('')
                setBatch('all')
                setStatus('all')
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
                  <SortHeader label="Candidate" col="name" sort={sort} dir={direction} onClick={toggleSort} />
                  <th>Progress</th>
                  <SortHeader label="Attempts" align="right" col="attempts" sort={sort} dir={direction} onClick={toggleSort} />
                  <SortHeader label="WPM" align="right" col="wpm" sort={sort} dir={direction} onClick={toggleSort} />
                  <SortHeader label="Accuracy" align="right" col="accuracy" sort={sort} dir={direction} onClick={toggleSort} />
                  <th className="text-right">Critical</th>
                  <SortHeader label="Score" align="right" col="score" sort={sort} dir={direction} onClick={toggleSort} />
                  <th>Performance</th>
                  <th>Risk</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ row, status: rowStatus, risk: rowRisk, performance }) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/trainer/candidate/${row.id}`)}
                  >
                    <td>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={row.fullName} />
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-navy-900">
                            {row.fullName}
                          </p>
                          <p className="truncate font-mono text-[11px] text-muted-foreground">
                            {row.candidateId} · {row.batch}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Badge variant={row.assignmentsPassed === TOTAL_ASSIGNMENTS ? 'success' : 'outline'}>
                        {row.assignmentsPassed}/{TOTAL_ASSIGNMENTS}
                      </Badge>
                    </td>
                    <td className="text-right tabular font-mono text-[13px]">{row.totalAttempts}</td>
                    <td className="text-right tabular font-mono text-[13px]">{row.avgWpm || '—'}</td>
                    <td className="text-right tabular font-mono text-[13px]">
                      {row.avgAccuracy ? `${row.avgAccuracy}%` : '—'}
                    </td>
                    <td className="text-right tabular font-mono text-[13px]">
                      {row.criticalDataAccuracy ? `${row.criticalDataAccuracy}%` : '—'}
                    </td>
                    <td className="text-right">
                      <span
                        className={cn(
                          'metric-value text-[13px]',
                          row.finalScore >= 85
                            ? 'text-emerald-700'
                            : row.finalScore >= 75
                              ? 'text-navy-900'
                              : 'text-red-700',
                        )}
                      >
                        {round(row.finalScore, 1)}
                      </span>
                    </td>
                    <td>
                      <PerformanceBadge level={performance as PerformanceLevel} />
                    </td>
                    <td>
                      <RiskBadge risk={rowRisk} />
                    </td>
                    <td>
                      <StatusBadge status={rowStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ---- Pagination ---- */}
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
            <p className="text-[11px] text-muted-foreground">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
              {roster.loading && ' · refreshing…'}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft className="size-3.5" />
                Previous
              </Button>
              <span className="px-2 text-[11px] tabular text-muted-foreground">
                {page + 1} / {pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page + 1 >= pageCount}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function SortHeader({
  label,
  col,
  sort,
  dir,
  onClick,
  align = 'left',
}: {
  label: string
  col: string
  sort: string
  dir: 'asc' | 'desc'
  onClick: (col: string) => void
  align?: 'left' | 'right'
}) {
  const active = sort === col
  return (
    <th className={align === 'right' ? 'text-right' : undefined}>
      <button
        onClick={() => onClick(col)}
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

export type { RosterRow }
