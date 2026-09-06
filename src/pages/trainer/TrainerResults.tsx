import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Award, Download, FileSpreadsheet } from 'lucide-react'
import { TASKS } from '@/data/tasks'
import { useAppStore, useRoster } from '@/store/appStore'
import { STATUS_LABEL } from '@/engine/certification'
import { AssignmentScoreChart, ScoreDistributionChart } from '@/components/charts'
import {
  Avatar,
  MetricCard,
  PageHeader,
  PerformanceBadge,
  RiskBadge,
  StatusBadge,
} from '@/components/shared'
import { Badge, Button, Card, Select, Tabs } from '@/components/ui'
import { average, cn, downloadBlob, formatDate, round, toCsv } from '@/lib/utils'

/**
 * Cohort results & export.
 *
 * The reporting surface of the admin portal: assignment-level pass rates,
 * certification status for the whole cohort, and CSV export of both the summary
 * and the full attempt log.
 */
export default function TrainerResults() {
  const navigate = useNavigate()
  const rows = useRoster()
  const attempts = useAppStore((s) => s.attempts)
  const certifications = useAppStore((s) => s.certifications)
  const settings = useAppStore((s) => s.settings)

  const [tab, setTab] = React.useState<'cohort' | 'assignments' | 'certificates'>('cohort')
  const [batch, setBatch] = React.useState('all')

  const batches = React.useMemo(
    () => Array.from(new Set(rows.map((r) => r.candidate.batch))).sort(),
    [rows],
  )

  const scoped = React.useMemo(
    () => (batch === 'all' ? rows : rows.filter((r) => r.candidate.batch === batch)),
    [rows, batch],
  )

  const scopedIds = React.useMemo(
    () => new Set(scoped.map((r) => r.candidate.id)),
    [scoped],
  )

  const scopedAttempts = React.useMemo(
    () => attempts.filter((a) => scopedIds.has(a.candidateId) && a.mode === 'certification'),
    [attempts, scopedIds],
  )

  /* ---- Aggregates ---- */
  const started = scoped.filter((r) => r.result.totalAttempts > 0)
  const certified = scoped.filter((r) => r.result.certified)
  const avgScore = round(average(started.map((r) => r.result.finalScore)), 1)
  const avgWpm = round(average(started.map((r) => r.result.avgWpm).filter(Boolean)))
  const passRate = scopedAttempts.length
    ? round((scopedAttempts.filter((a) => a.passed).length / scopedAttempts.length) * 100, 1)
    : 0

  const distribution = [
    { band: '95–100', min: 95, max: 101, tone: 'emerald' as const },
    { band: '85–94', min: 85, max: 95, tone: 'brand' as const },
    { band: '80–84', min: 80, max: 85, tone: 'amber' as const },
    { band: '75–79', min: 75, max: 80, tone: 'orange' as const },
    { band: '< 75', min: -1, max: 75, tone: 'red' as const },
  ].map((b) => ({
    band: b.band,
    tone: b.tone,
    count: scoped.filter((r) => r.result.finalScore >= b.min && r.result.finalScore < b.max).length,
  }))

  /** Cohort-average best score per assignment. */
  const assignmentStats = React.useMemo(
    () =>
      TASKS.flatMap((task) =>
        task.assignments.map((assignment) => {
          const relevant = scopedAttempts.filter(
            (a) => a.taskId === task.id && a.assignmentId === assignment.id,
          )
          const byCandidate = new Map<string, number>()
          for (const a of relevant) {
            byCandidate.set(a.candidateId, Math.max(byCandidate.get(a.candidateId) ?? 0, a.score))
          }
          const bests = [...byCandidate.values()]
          const passers = new Set(relevant.filter((a) => a.passed).map((a) => a.candidateId))
          return {
            taskId: task.id,
            assignmentId: assignment.id,
            title: assignment.title,
            difficulty: assignment.difficulty,
            attempted: byCandidate.size,
            passed: passers.size,
            avgBest: round(average(bests), 1),
            avgAttempts: byCandidate.size
              ? round(relevant.length / byCandidate.size, 1)
              : 0,
            passRate: byCandidate.size ? round((passers.size / byCandidate.size) * 100) : 0,
          }
        }),
      ),
    [scopedAttempts],
  )

  const exportSummary = () => {
    const csv = toCsv(
      scoped.map((r) => ({
        candidate: r.candidate.fullName,
        candidateId: r.candidate.candidateId,
        email: r.candidate.email,
        batch: r.candidate.batch,
        location: r.candidate.location,
        trainer: r.candidate.trainerName,
        assignmentsPassed: r.result.assignmentsPassed,
        totalAttempts: r.result.totalAttempts,
        task1Average: r.result.task1Average,
        task2Average: r.result.task2Average,
        finalScore: r.result.finalScore,
        avgWpm: r.result.avgWpm,
        avgAccuracy: r.result.avgAccuracy,
        listeningAccuracy: r.result.listeningAccuracy,
        criticalDataAccuracy: r.result.criticalDataAccuracy,
        multitaskingScore: r.result.multitaskingScore,
        performance: r.result.performanceLevel,
        risk: r.result.risk,
        status: STATUS_LABEL[r.result.status],
        certified: r.result.certified,
      })),
    )
    downloadBlob(
      new Blob([csv], { type: 'text/csv;charset=utf-8' }),
      `xtmx-results-summary-${batch === 'all' ? 'all' : batch}.csv`,
    )
  }

  const exportAttempts = () => {
    const nameFor = new Map(scoped.map((r) => [r.candidate.id, r.candidate]))
    const csv = toCsv(
      scopedAttempts.map((a) => {
        const c = nameFor.get(a.candidateId)
        return {
          candidate: c?.fullName ?? '',
          candidateId: c?.candidateId ?? '',
          batch: c?.batch ?? '',
          task: a.taskId,
          assignment: a.assignmentId,
          attempt: a.attemptNumber,
          score: a.score,
          passed: a.passed,
          wpm: a.wpm ?? '',
          accuracy: a.accuracy ?? '',
          dataAccuracy: a.dataAccuracy ?? '',
          criticalDataAccuracy: a.criticalDataAccuracy ?? '',
          multitaskingScore: a.multitaskingScore ?? '',
          completion: a.completionPercentage,
          flagged: a.integrity.flagged,
          completedAt: a.completedAt,
        }
      }),
    )
    downloadBlob(
      new Blob([csv], { type: 'text/csv;charset=utf-8' }),
      `xtmx-attempt-log-${batch === 'all' ? 'all' : batch}.csv`,
    )
  }

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        eyebrow="Trainer / Admin portal"
        title="Results & Export"
        description="Cohort performance, assignment-level pass rates and certification status."
        actions={
          <>
            <Select
              value={batch}
              onChange={(e) => setBatch(e.target.value)}
              className="w-40"
            >
              <option value="all">All batches</option>
              {batches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </Select>
            <Button variant="outline" onClick={exportSummary}>
              <Download className="size-4" />
              Summary CSV
            </Button>
            <Button variant="outline" onClick={exportAttempts}>
              <FileSpreadsheet className="size-4" />
              Attempt log
            </Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Candidates" value={scoped.length} />
        <MetricCard label="Started" value={started.length} />
        <MetricCard label="Certified" value={certified.length} tone="success" />
        <MetricCard label="Avg final score" value={avgScore || '—'} />
        <MetricCard label="Avg WPM" value={avgWpm || '—'} />
        <MetricCard
          label="Attempt pass rate"
          value={`${passRate}%`}
          tone={passRate >= 60 ? 'success' : 'warning'}
        />
      </div>

      <Tabs
        className="mb-4"
        value={tab}
        onChange={(v) => setTab(v as typeof tab)}
        items={[
          { value: 'cohort', label: 'Cohort' },
          { value: 'assignments', label: 'Assignment analysis', count: assignmentStats.length },
          { value: 'certificates', label: 'Certificates', count: certifications.length },
        ]}
      />

      {/* ---- Cohort ---- */}
      {tab === 'cohort' && (
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
                  {[...scoped]
                    .sort((a, b) => b.result.finalScore - a.result.finalScore)
                    .map((row) => (
                      <tr
                        key={row.candidate.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/trainer/candidate/${row.candidate.id}`)}
                      >
                        <td>
                          <div className="flex items-center gap-2.5">
                            <Avatar name={row.candidate.fullName} />
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-semibold text-navy-900">
                                {row.candidate.fullName}
                              </p>
                              <p className="truncate font-mono text-[11px] text-muted-foreground">
                                {row.candidate.candidateId} · {row.candidate.batch}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="text-right tabular font-mono text-[13px]">
                          {round(row.result.task1Average, 1) || '—'}
                        </td>
                        <td className="text-right tabular font-mono text-[13px]">
                          {round(row.result.task2Average, 1) || '—'}
                        </td>
                        <td className="text-right">
                          <span
                            className={cn(
                              'metric-value text-[13px]',
                              row.result.finalScore >= settings.passingScore
                                ? 'text-emerald-700'
                                : 'text-red-700',
                            )}
                          >
                            {round(row.result.finalScore, 1)}
                          </span>
                        </td>
                        <td className="text-right tabular font-mono text-[13px]">
                          {row.result.avgWpm || '—'}
                        </td>
                        <td className="text-right tabular font-mono text-[13px]">
                          {row.result.criticalDataAccuracy
                            ? `${row.result.criticalDataAccuracy}%`
                            : '—'}
                        </td>
                        <td className="text-right tabular font-mono text-[13px]">
                          {row.result.multitaskingScore ? `${row.result.multitaskingScore}%` : '—'}
                        </td>
                        <td>
                          <PerformanceBadge level={row.result.performanceLevel} />
                        </td>
                        <td>
                          <RiskBadge risk={row.result.risk} />
                        </td>
                        <td>
                          <StatusBadge status={row.result.status} />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ---- Assignment analysis ---- */}
      {tab === 'assignments' && (
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Cohort average best score per assignment
            </h2>
            <AssignmentScoreChart
              data={assignmentStats.map((s) => ({
                label: `T${s.taskId}A${s.assignmentId}`,
                score: s.avgBest,
                passed: s.avgBest >= settings.passingScore,
              }))}
              passingScore={settings.passingScore}
            />
          </Card>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data-grid min-w-[900px]">
                <thead>
                  <tr>
                    <th>Assignment</th>
                    <th>Difficulty</th>
                    <th className="text-right">Attempted by</th>
                    <th className="text-right">Passed</th>
                    <th className="text-right">Pass rate</th>
                    <th className="text-right">Avg best score</th>
                    <th className="text-right">Avg attempts</th>
                  </tr>
                </thead>
                <tbody>
                  {assignmentStats.map((s) => (
                    <tr key={`${s.taskId}-${s.assignmentId}`}>
                      <td>
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-[11px] font-bold text-brand-700">
                            T{s.taskId}-A{s.assignmentId}
                          </span>
                          <span className="text-[13px] font-medium text-navy-800">{s.title}</span>
                        </span>
                      </td>
                      <td>
                        <Badge variant="outline">{s.difficulty}</Badge>
                      </td>
                      <td className="text-right tabular font-mono text-[13px]">{s.attempted}</td>
                      <td className="text-right tabular font-mono text-[13px]">{s.passed}</td>
                      <td className="text-right">
                        <span
                          className={cn(
                            'metric-value text-[13px]',
                            s.passRate >= 70
                              ? 'text-emerald-700'
                              : s.passRate >= 40
                                ? 'text-amber-700'
                                : 'text-red-700',
                          )}
                        >
                          {s.attempted ? `${s.passRate}%` : '—'}
                        </span>
                      </td>
                      <td className="text-right tabular font-mono text-[13px]">
                        {s.avgBest || '—'}
                      </td>
                      <td className="text-right tabular font-mono text-[13px]">
                        {s.avgAttempts || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ---- Certificates ---- */}
      {tab === 'certificates' && (
        <Card className="overflow-hidden">
          {certified.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <Award className="mx-auto size-8 text-navy-200" />
              <p className="mt-2 text-sm font-semibold text-navy-800">No certificates issued yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                A certificate is issued automatically the moment a candidate satisfies every
                certification gate.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-grid min-w-[900px]">
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Certificate ID</th>
                    <th className="text-right">Final score</th>
                    <th className="text-right">WPM</th>
                    <th className="text-right">Accuracy</th>
                    <th>Classification</th>
                    <th className="text-right">Issued</th>
                  </tr>
                </thead>
                <tbody>
                  {certified.map((row) => {
                    const cert = certifications.find((c) => c.candidateId === row.candidate.id)
                    return (
                      <tr
                        key={row.candidate.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/trainer/candidate/${row.candidate.id}`)}
                      >
                        <td>
                          <div className="flex items-center gap-2.5">
                            <Avatar name={row.candidate.fullName} />
                            <div>
                              <p className="text-[13px] font-semibold text-navy-900">
                                {row.candidate.fullName}
                              </p>
                              <p className="font-mono text-[11px] text-muted-foreground">
                                {row.candidate.candidateId}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="font-mono text-[12px] text-navy-800">
                          {cert?.certificateId ?? 'Pending issue'}
                        </td>
                        <td className="text-right">
                          <span className="metric-value text-[13px] text-emerald-700">
                            {round(row.result.finalScore, 1)}
                          </span>
                        </td>
                        <td className="text-right tabular font-mono text-[13px]">
                          {row.result.avgWpm}
                        </td>
                        <td className="text-right tabular font-mono text-[13px]">
                          {row.result.avgAccuracy}%
                        </td>
                        <td>
                          <PerformanceBadge level={row.result.performanceLevel} />
                        </td>
                        <td className="text-right text-[12px] text-muted-foreground">
                          {cert ? formatDate(cert.issuedAt) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
