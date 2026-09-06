import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Award, Download, Loader2 } from 'lucide-react'
import type { CandidateStatus } from '@/types'
import { trainer, type RosterRow } from '@/api/client'
import { useApi } from '@/hooks/useApi'
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
import { Button, Card, Select, Tabs } from '@/components/ui'
import { average, cn, downloadBlob, round, toCsv } from '@/lib/utils'

/** The export pulls the whole cohort, in pages, rather than one huge response. */
const EXPORT_PAGE = 200

/**
 * Cohort results & export.
 *
 * The roster arrives pre-aggregated from Postgres. Deriving status and risk is
 * presentation logic and stays here; nothing recomputes a score client-side.
 */
export default function TrainerResults() {
  const navigate = useNavigate()
  const [batch, setBatch] = React.useState('all')
  const [tab, setTab] = React.useState<'cohort' | 'certificates'>('cohort')
  const [exporting, setExporting] = React.useState(false)

  const batches = useApi(() => trainer.batches(), [])
  const roster = useApi(
    () => trainer.roster({ batch, limit: EXPORT_PAGE, sort: 'score', direction: 'desc' }),
    [batch],
  )

  const rows = React.useMemo(() => roster.data?.rows ?? [], [roster.data])
  const settings = roster.data?.settings

  const decorated = React.useMemo(
    () =>
      rows.map((row) => ({
        row,
        status: deriveStatus(row),
        risk: classifyRisk(row.finalScore, row.certified, row.assignmentsPassed),
        performance: classifyPerformance(row.finalScore, row.certified),
      })),
    [rows],
  )

  const started = decorated.filter((d) => d.row.totalAttempts > 0)
  const certified = decorated.filter((d) => d.row.certified)
  const avgScore = round(average(started.map((d) => d.row.finalScore)), 1)
  const avgWpm = round(average(started.map((d) => d.row.avgWpm).filter(Boolean)))

  const distribution = [
    { band: '95–100', min: 95, max: 101, tone: 'emerald' as const },
    { band: '85–94', min: 85, max: 95, tone: 'brand' as const },
    { band: '80–84', min: 80, max: 85, tone: 'amber' as const },
    { band: '75–79', min: 75, max: 80, tone: 'orange' as const },
    { band: '< 75', min: -1, max: 75, tone: 'red' as const },
  ].map((b) => ({
    band: b.band,
    tone: b.tone,
    count: rows.filter((r) => r.finalScore >= b.min && r.finalScore < b.max).length,
  }))

  /** Pages through the whole cohort so an export is never truncated. */
  const exportAll = async () => {
    setExporting(true)
    try {
      const all: RosterRow[] = []
      let offset = 0
      for (;;) {
        const page = await trainer.roster({
          batch,
          limit: EXPORT_PAGE,
          offset,
          sort: 'score',
          direction: 'desc',
        })
        all.push(...page.rows)
        offset += EXPORT_PAGE
        if (all.length >= page.total || page.rows.length === 0) break
      }

      downloadBlob(
        new Blob(
          [
            toCsv(
              all.map((r) => ({
                candidate: r.fullName,
                candidateId: r.candidateId,
                email: r.email,
                batch: r.batch,
                location: r.location,
                trainer: r.trainerName,
                assignmentsPassed: r.assignmentsPassed,
                totalAttempts: r.totalAttempts,
                task1Average: r.task1Average,
                task2Average: r.task2Average,
                finalScore: r.finalScore,
                avgWpm: r.avgWpm,
                avgAccuracy: r.avgAccuracy,
                criticalDataAccuracy: r.criticalDataAccuracy,
                multitaskingScore: r.multitaskingScore,
                performance: classifyPerformance(r.finalScore, r.certified),
                risk: classifyRisk(r.finalScore, r.certified, r.assignmentsPassed),
                status: STATUS_LABEL[deriveStatus(r)],
                certified: r.certified,
                certificateId: r.certificateId ?? '',
              })),
            ),
          ],
          { type: 'text/csv;charset=utf-8' },
        ),
        `xtmx-results-${batch === 'all' ? 'all' : batch}.csv`,
      )
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        eyebrow="Trainer / Admin portal"
        title="Results & Export"
        description="Cohort performance and certification status, aggregated on the server."
        actions={
          <>
            <Select value={batch} onChange={(e) => setBatch(e.target.value)} className="w-40">
              <option value="all">All batches</option>
              {(batches.data?.batches ?? []).map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </Select>
            <Button variant="outline" onClick={() => void exportAll()} disabled={exporting}>
              {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              Export cohort CSV
            </Button>
          </>
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

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Candidates" value={roster.data?.total ?? 0} />
        <MetricCard label="Started" value={started.length} />
        <MetricCard label="Certified" value={certified.length} tone="success" />
        <MetricCard label="Avg final score" value={avgScore || '—'} />
        <MetricCard label="Avg WPM" value={avgWpm || '—'} />
        <MetricCard
          label="Passing standard"
          value={settings ? `${settings.passingScore}` : '—'}
          unit="/100"
        />
      </div>

      <Tabs
        className="mb-4"
        value={tab}
        onChange={(v) => setTab(v as typeof tab)}
        items={[
          { value: 'cohort', label: 'Cohort', count: rows.length },
          { value: 'certificates', label: 'Certificates', count: certified.length },
        ]}
      />

      {roster.loading && !roster.data ? (
        <Card className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading cohort…
        </Card>
      ) : tab === 'cohort' ? (
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Final score distribution
            </h2>
            <ScoreDistributionChart data={distribution} />
          </Card>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data-grid min-w-[1000px]">
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th className="text-right">Task 1 avg</th>
                    <th className="text-right">Task 2 avg</th>
                    <th className="text-right">Final</th>
                    <th className="text-right">WPM</th>
                    <th className="text-right">Critical</th>
                    <th className="text-right">Multitask</th>
                    <th>Performance</th>
                    <th>Risk</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {decorated.map(({ row, status, risk, performance }) => (
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
                      <td className="text-right tabular font-mono text-[13px]">
                        {round(row.task1Average, 1) || '—'}
                      </td>
                      <td className="text-right tabular font-mono text-[13px]">
                        {round(row.task2Average, 1) || '—'}
                      </td>
                      <td className="text-right">
                        <span
                          className={cn(
                            'metric-value text-[13px]',
                            settings && row.finalScore >= settings.passingScore
                              ? 'text-emerald-700'
                              : 'text-red-700',
                          )}
                        >
                          {round(row.finalScore, 1)}
                        </span>
                      </td>
                      <td className="text-right tabular font-mono text-[13px]">
                        {row.avgWpm || '—'}
                      </td>
                      <td className="text-right tabular font-mono text-[13px]">
                        {row.criticalDataAccuracy ? `${row.criticalDataAccuracy}%` : '—'}
                      </td>
                      <td className="text-right tabular font-mono text-[13px]">
                        {row.multitaskingScore ? `${row.multitaskingScore}%` : '—'}
                      </td>
                      <td>
                        <PerformanceBadge level={performance} />
                      </td>
                      <td>
                        <RiskBadge risk={risk} />
                      </td>
                      <td>
                        <StatusBadge status={status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {roster.data && roster.data.total > rows.length && (
              <p className="border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
                Showing the top {rows.length} of {roster.data.total}. Export the CSV for the full
                cohort.
              </p>
            )}
          </Card>
        </div>
      ) : certified.length === 0 ? (
        <EmptyState
          icon={<Award className="size-8" />}
          title="No certificates issued yet"
          description="A certificate is issued automatically the moment a candidate satisfies every certification gate."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-grid min-w-[900px]">
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Certificate ID</th>
                  <th className="text-right">Final score</th>
                  <th className="text-right">WPM</th>
                  <th className="text-right">Accuracy</th>
                  <th className="text-right">Assignments</th>
                  <th>Classification</th>
                </tr>
              </thead>
              <tbody>
                {certified.map(({ row, performance }) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/trainer/candidate/${row.id}`)}
                  >
                    <td>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={row.fullName} />
                        <div>
                          <p className="text-[13px] font-semibold text-navy-900">{row.fullName}</p>
                          <p className="font-mono text-[11px] text-muted-foreground">
                            {row.candidateId}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="font-mono text-[12px] text-navy-800">
                      {row.certificateId ?? '—'}
                    </td>
                    <td className="text-right">
                      <span className="metric-value text-[13px] text-emerald-700">
                        {round(row.finalScore, 1)}
                      </span>
                    </td>
                    <td className="text-right tabular font-mono text-[13px]">{row.avgWpm}</td>
                    <td className="text-right tabular font-mono text-[13px]">
                      {row.avgAccuracy}%
                    </td>
                    <td className="text-right tabular font-mono text-[13px]">
                      {row.assignmentsPassed}/{TOTAL_ASSIGNMENTS}
                    </td>
                    <td>
                      <PerformanceBadge level={performance} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

/** Presentation-level status, derived from the server's aggregate. */
function deriveStatus(row: RosterRow): CandidateStatus {
  if (row.certified) return 'certified'
  if (row.totalAttempts === 0) return 'not-started'
  if (row.assignmentsPassed === TOTAL_ASSIGNMENTS) return 'not-certified'
  if (row.finalScore > 0 && row.finalScore < 70) return 'danger'
  if (row.finalScore > 0 && row.finalScore < 78) return 'needs-coaching'
  return 'in-progress'
}
