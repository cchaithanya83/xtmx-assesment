import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Activity,
  ArrowRight,
  Award,
  BarChart3,
  Brain,
  CheckCircle2,
  Gauge,
  Headphones,
  Keyboard,
  Repeat,
  ShieldCheck,
  Target,
} from 'lucide-react'
import type { AssessmentResult, AssignmentProgress, GateResult } from '@/types'
import { TASKS, TOTAL_ASSIGNMENTS } from '@/data/tasks'
import { useAppStore, useCurrentCandidate } from '@/store/appStore'
import { findProgress, nextAssignment } from '@/engine/certification'
import {
  GateList,
  Metric,
  MetricCard,
  PageHeader,
  PerformanceBadge,
} from '@/components/shared'
import { Badge, Button, Card, Progress } from '@/components/ui'
import { cn, round } from '@/lib/utils'

/**
 * Candidate dashboard.
 *
 * Transforms into a certification summary once all 10 assignments are passed
 * (see `CertificationSummary`), which is the candidate-facing signal that the
 * assessment is complete.
 */
export default function CandidateDashboard() {
  const navigate = useNavigate()
  const candidate = useCurrentCandidate()
  const progress = useAppStore((s) => s.progress)
  const result = useAppStore((s) => s.result)
  const refreshProgress = useAppStore((s) => s.refreshProgress)

  // The dashboard is the landing screen after every assessment, so refetch on
  // mount rather than trusting whatever the store happened to be holding.
  React.useEffect(() => {
    void refreshProgress()
  }, [refreshProgress])

  if (!candidate || !result) return null
  const next = nextAssignment(progress)
  const completed = result.assignmentsPassed
  const allDone = completed === TOTAL_ASSIGNMENTS
  const firstName = candidate.fullName.split(' ')[0]

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow={`${candidate.batch} · ${candidate.location}`}
        title={`Welcome, ${firstName}`}
        description={
          allDone
            ? 'All assignments are complete. Your certification summary is below.'
            : 'Complete every assignment in sequence to become a certified AI Operator.'
        }
        actions={
          next ? (
            <Button
              size="lg"
              onClick={() => navigate(`/task/${next.taskId}`)}
            >
              Continue Task {next.taskId} · Assignment {next.assignmentId}
              <ArrowRight className="size-4" />
            </Button>
          ) : allDone ? (
            <Button size="lg" onClick={() => navigate('/certificate')}>
              <Award className="size-4" />
              View certificate
            </Button>
          ) : null
        }
      />

      {allDone && <CertificationSummary result={result} candidateName={candidate.fullName} />}

      {/* ---- Certification progress ---- */}
      <Card className="mb-5 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Certification progress
            </h2>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="metric-value text-3xl text-navy-900">
                {completed} / {TOTAL_ASSIGNMENTS}
              </span>
              <span className="text-sm font-medium text-muted-foreground">
                assignments completed
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {result.certified ? (
              <Badge variant="success">
                <ShieldCheck className="size-3" />
                Certified
              </Badge>
            ) : (
              <PerformanceBadge level={result.performanceLevel} />
            )}
          </div>
        </div>
        <Progress
          value={(completed / TOTAL_ASSIGNMENTS) * 100}
          tone={allDone ? 'emerald' : 'brand'}
          size="lg"
          className="mt-3"
        />
        <div className="mt-2 flex flex-wrap gap-1">
          {progress.map((p: AssignmentProgress) => (
            <span
              key={`${p.taskId}-${p.assignmentId}`}
              title={`Task ${p.taskId} · Assignment ${p.assignmentId} — ${p.status}`}
              className={cn(
                'h-1.5 flex-1 rounded-full',
                p.status === 'passed'
                  ? 'bg-emerald-500'
                  : p.status === 'in-progress'
                    ? 'bg-amber-400'
                    : p.status === 'unlocked'
                      ? 'bg-brand-300'
                      : 'bg-navy-100',
              )}
            />
          ))}
        </div>
      </Card>

      {/* ---- Overall performance ---- */}
      <h2 className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        Overall performance
      </h2>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <MetricCard
          label="Overall score"
          value={round(result.finalScore, 1)}
          unit="/100"
          icon={<Target className="size-3.5" />}
          tone={result.finalScore >= 75 ? 'accent' : 'warning'}
        />
        <MetricCard
          label="Average WPM"
          value={result.avgWpm}
          icon={<Gauge className="size-3.5" />}
        />
        <MetricCard
          label="Avg accuracy"
          value={`${result.avgAccuracy}%`}
          icon={<CheckCircle2 className="size-3.5" />}
        />
        <MetricCard
          label="Listening"
          value={`${result.listeningAccuracy}%`}
          icon={<Headphones className="size-3.5" />}
        />
        <MetricCard
          label="Critical data"
          value={`${result.criticalDataAccuracy}%`}
          icon={<ShieldCheck className="size-3.5" />}
        />
        <MetricCard
          label="Multitasking"
          value={`${result.multitaskingScore}%`}
          icon={<Brain className="size-3.5" />}
        />
        <MetricCard
          label="Total attempts"
          value={result.totalAttempts}
          icon={<Repeat className="size-3.5" />}
        />
      </div>

      {/* ---- Task cards ---- */}
      <div className="grid gap-4 xl:grid-cols-2">
        {TASKS.map((task) => {
          const taskProgress = progress.filter((p: AssignmentProgress) => p.taskId === task.id)
          const passed = taskProgress.filter((p: AssignmentProgress) => p.status === 'passed').length
          const average = task.id === 1 ? result.task1Average : result.task2Average
          return (
            <Card key={task.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-brand-700">
                    {task.id === 1 ? (
                      <Keyboard className="size-4" />
                    ) : (
                      <Headphones className="size-4" />
                    )}
                    <span className="text-[10px] font-bold uppercase tracking-widest">
                      Task {task.id} · {Math.round(task.weight * 100)}% of certification
                    </span>
                  </div>
                  <h3 className="mt-1 text-base font-bold text-navy-900">{task.title}</h3>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">{task.subtitle}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="metric-value text-2xl text-navy-900">{round(average, 1)}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Task average
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <Progress
                  value={(passed / task.assignments.length) * 100}
                  tone={passed === task.assignments.length ? 'emerald' : 'brand'}
                  className="flex-1"
                />
                <span className="metric-value shrink-0 text-xs text-navy-800">
                  {passed}/{task.assignments.length}
                </span>
              </div>

              <ul className="mt-4 space-y-1.5">
                {task.assignments.map((assignment) => {
                  const p = findProgress(progress, task.id, assignment.id)
                  return (
                    <li
                      key={assignment.id}
                      className="flex items-center gap-2.5 rounded-md border border-border px-2.5 py-2"
                    >
                      <span
                        className={cn(
                          'flex size-6 shrink-0 items-center justify-center rounded font-mono text-[11px] font-bold',
                          p?.status === 'passed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : p?.status === 'locked'
                              ? 'bg-navy-50 text-navy-300'
                              : 'bg-brand-100 text-brand-800',
                        )}
                      >
                        {assignment.id}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-navy-800">
                        {assignment.title}
                      </span>
                      {p?.status === 'passed' ? (
                        <span className="metric-value shrink-0 text-xs text-emerald-700">
                          {p.bestScore}
                        </span>
                      ) : p?.status === 'locked' ? (
                        <span className="shrink-0 text-[11px] text-navy-300">Locked</span>
                      ) : (
                        <span className="shrink-0 text-[11px] font-semibold text-brand-700">
                          {p?.attempts ? `${p.attempts} attempt${p.attempts > 1 ? 's' : ''}` : 'Ready'}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>

              <Button className="mt-4 w-full" variant="outline" onClick={() => navigate(`/task/${task.id}`)}>
                Open Task {task.id}
                <ArrowRight className="size-4" />
              </Button>
            </Card>
          )
        })}
      </div>

      {/* ---- Quick links ---- */}
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <QuickLink
          to="/history"
          icon={<Activity className="size-4" />}
          title="Attempt history"
          description="Every attempt, score and improvement trend"
        />
        <QuickLink
          to="/results"
          icon={<BarChart3 className="size-4" />}
          title="Final results"
          description="Per-assignment breakdown and analytics"
        />
        <QuickLink
          to="/certificate"
          icon={<Award className="size-4" />}
          title="Certificate"
          description={result.certified ? 'Ready to download' : 'Unlocks on certification'}
        />
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function CertificationSummary({
  result,
  candidateName,
}: {
  result: AssessmentResult
  candidateName: string
}) {
  return (
    <Card
      className={cn(
        'mb-5 overflow-hidden border-2',
        result.certified ? 'border-emerald-300' : 'border-amber-300',
      )}
    >
      <div
        className={cn(
          'px-5 py-4',
          result.certified ? 'bg-emerald-50' : 'bg-amber-50',
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-navy-600">
              {result.certified ? 'Certification complete' : 'Assessment complete'}
            </p>
            <h2 className="mt-0.5 text-xl font-extrabold tracking-tight text-navy-900">
              {candidateName}
            </h2>
          </div>
          <PerformanceBadge level={result.performanceLevel} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 p-5 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="Final score" value={round(result.finalScore, 1)} unit="/100" size="lg" tone="accent" />
        <Metric label="Typing speed" value={result.avgWpm} unit="WPM" size="lg" />
        <Metric label="Accuracy" value={`${result.avgAccuracy}%`} size="lg" />
        <Metric label="Listening" value={`${result.listeningAccuracy}%`} size="lg" />
        <Metric label="Critical data" value={`${result.criticalDataAccuracy}%`} size="lg" />
        <Metric label="Multitasking" value={`${result.multitaskingScore}%`} size="lg" />
      </div>

      {!result.certified && (
        <div className="border-t border-border p-5">
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Outstanding certification requirements
          </h3>
          <GateList gates={result.gates.filter((g: GateResult) => !g.passed)} />
        </div>
      )}
    </Card>
  )
}

function QuickLink({
  to,
  icon,
  title,
  description,
}: {
  to: string
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <Link
      to={to}
      className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-brand-300 hover:bg-brand-50/30"
    >
      <span className="mt-0.5 text-brand-700">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-navy-900">{title}</span>
        <span className="block text-[13px] text-muted-foreground">{description}</span>
      </span>
      <ArrowRight className="ml-auto size-4 shrink-0 text-navy-300" />
    </Link>
  )
}
