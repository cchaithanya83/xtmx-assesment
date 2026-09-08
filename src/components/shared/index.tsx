export { FieldComparison, FieldComparisonSummary, outcomeOf } from './FieldComparison'

import * as React from 'react'
import { AlertTriangle, Check, Minus, ShieldCheck, TrendingDown, TrendingUp, X } from 'lucide-react'
import type {
  AttemptFeedback,
  CandidateStatus,
  Difficulty,
  GateResult,
  PerformanceLevel,
  RiskLevel,
  ScoreBreakdown,
} from '@/types'
import { RISK_LABEL, STATUS_LABEL } from '@/engine/certification'
import { Badge, Card, Progress } from '@/components/ui'
import { cn, initials, round } from '@/lib/utils'

/* -------------------------------------------------------------------------- */
/*  Metric tile                                                                */
/* -------------------------------------------------------------------------- */

export interface MetricProps {
  label: string
  value: React.ReactNode
  unit?: string
  hint?: string
  tone?: 'default' | 'accent' | 'success' | 'warning' | 'danger'
  size?: 'sm' | 'default' | 'lg'
  icon?: React.ReactNode
  trend?: number | null
  className?: string
}

const METRIC_TONE = {
  default: 'text-navy-900',
  accent: 'text-brand-700',
  success: 'text-emerald-700',
  warning: 'text-amber-700',
  danger: 'text-red-700',
} as const

export function Metric({
  label,
  value,
  unit,
  hint,
  tone = 'default',
  size = 'default',
  icon,
  trend,
  className,
}: MetricProps) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-center gap-1.5">
        {icon && <span className="text-navy-400">{icon}</span>}
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1">
        <span
          className={cn(
            'metric-value',
            METRIC_TONE[tone],
            size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-4xl' : 'text-2xl',
          )}
        >
          {value}
        </span>
        {unit && <span className="text-xs font-semibold text-muted-foreground">{unit}</span>}
        {trend !== undefined && trend !== null && trend !== 0 && (
          <span
            className={cn(
              'ml-1 inline-flex items-center gap-0.5 text-[11px] font-semibold tabular',
              trend > 0 ? 'text-emerald-700' : 'text-red-700',
            )}
          >
            {trend > 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
            {trend > 0 ? '+' : ''}
            {round(trend, 1)}%
          </span>
        )}
      </div>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  )
}

export function MetricCard(props: MetricProps) {
  return (
    <Card className="p-4">
      <Metric {...props} />
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/*  Status, risk, difficulty & performance badges                              */
/* -------------------------------------------------------------------------- */

const STATUS_VARIANT: Record<CandidateStatus, React.ComponentProps<typeof Badge>['variant']> = {
  'not-started': 'muted',
  'in-progress': 'default',
  'needs-coaching': 'warning',
  danger: 'danger',
  'not-certified': 'danger',
  certified: 'success',
}

export const StatusBadge = ({ status }: { status: CandidateStatus }) => (
  <Badge variant={STATUS_VARIANT[status]}>
    {status === 'certified' && <ShieldCheck className="size-3" />}
    {STATUS_LABEL[status]}
  </Badge>
)

/** Risk tags: clear but professional — muted fills, never neon. */
const RISK_STYLE: Record<RiskLevel, string> = {
  green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  mid: 'border-brand-200 bg-brand-50 text-brand-800',
  low: 'border-amber-200 bg-amber-50 text-amber-800',
  danger: 'border-orange-200 bg-orange-50 text-orange-800',
  'below-standard': 'border-red-200 bg-red-50 text-red-800',
}

const RISK_DOT: Record<RiskLevel, string> = {
  green: 'bg-emerald-600',
  mid: 'bg-brand-600',
  low: 'bg-amber-500',
  danger: 'bg-orange-500',
  'below-standard': 'bg-red-600',
}

export const RiskBadge = ({ risk }: { risk: RiskLevel }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
      RISK_STYLE[risk],
    )}
  >
    <span className={cn('size-1.5 rounded-full', RISK_DOT[risk])} />
    {RISK_LABEL[risk]}
  </span>
)

const DIFFICULTY_VARIANT: Record<Difficulty, React.ComponentProps<typeof Badge>['variant']> = {
  Easy: 'success',
  'Easy–Medium': 'accent',
  Medium: 'default',
  'Medium–Hard': 'warning',
  Hard: 'danger',
  Advanced: 'danger',
}

export const DifficultyBadge = ({ difficulty }: { difficulty: Difficulty }) => (
  <Badge variant={DIFFICULTY_VARIANT[difficulty]}>{difficulty}</Badge>
)

const PERFORMANCE_STYLE: Record<PerformanceLevel, string> = {
  'High Performance': 'border-emerald-200 bg-emerald-50 text-emerald-800',
  'Mid Performance': 'border-brand-200 bg-brand-50 text-brand-800',
  'Low Performance — Monitor': 'border-amber-200 bg-amber-50 text-amber-800',
  'Danger Candidate': 'border-orange-200 bg-orange-50 text-orange-800',
  'Not Certified': 'border-red-200 bg-red-50 text-red-800',
}

export const PerformanceBadge = ({
  level,
  className,
}: {
  level: PerformanceLevel
  className?: string
}) => (
  <span
    className={cn(
      'inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-bold uppercase tracking-wider',
      PERFORMANCE_STYLE[level],
      className,
    )}
  >
    {level}
  </span>
)

/* -------------------------------------------------------------------------- */
/*  Gates — why a candidate passed or failed (product rule #7)                 */
/* -------------------------------------------------------------------------- */

export function GateList({ gates, className }: { gates: GateResult[]; className?: string }) {
  return (
    <ul className={cn('space-y-1.5', className)}>
      {gates.map((gate) => (
        <li
          key={gate.label}
          className={cn(
            'flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm',
            gate.passed
              ? 'border-emerald-100 bg-emerald-50/60'
              : 'border-red-100 bg-red-50/60',
          )}
        >
          <span className="flex items-center gap-2 font-medium text-navy-800">
            {gate.passed ? (
              <Check className="size-4 text-emerald-600" />
            ) : (
              <X className="size-4 text-red-600" />
            )}
            {gate.label}
          </span>
          <span
            className={cn(
              'metric-value text-sm',
              gate.passed ? 'text-emerald-800' : 'text-red-800',
            )}
          >
            {formatGateValue(gate.actual, gate.unit)}
            <span className="ml-1 font-sans text-xs font-medium text-muted-foreground">
              / {formatGateValue(gate.required, gate.unit)} required
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}

function formatGateValue(value: number, unit: GateResult['unit']): string {
  if (unit === '%') return `${round(value, 1)}%`
  if (unit === 'wpm') return `${round(value)} WPM`
  return String(round(value, 1))
}

/* -------------------------------------------------------------------------- */
/*  Score breakdown                                                            */
/* -------------------------------------------------------------------------- */

export function ScoreBreakdownList({ breakdown }: { breakdown: ScoreBreakdown[] }) {
  if (!breakdown.length) return null
  return (
    <div className="space-y-3">
      {breakdown.map((row) => {
        const ratio = row.max === 0 ? 0 : (row.earned / row.max) * 100
        return (
          <div key={row.label}>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="font-medium text-navy-800">{row.label}</span>
              <span className="metric-value text-sm text-navy-900">
                {row.earned}
                <span className="text-muted-foreground">/{row.max}</span>
              </span>
            </div>
            <Progress
              value={ratio}
              size="sm"
              tone={ratio >= 85 ? 'emerald' : ratio >= 65 ? 'brand' : ratio >= 45 ? 'amber' : 'red'}
            />
          </div>
        )
      })}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Feedback panel                                                             */
/* -------------------------------------------------------------------------- */

export function FeedbackPanel({
  feedback,
  className,
}: {
  feedback: AttemptFeedback
  className?: string
}) {
  const sections: {
    title: string
    items: string[]
    tone: string
    icon: React.ReactNode
  }[] = [
    {
      title: 'Strengths',
      items: feedback.strengths,
      tone: 'border-emerald-100 bg-emerald-50/50',
      icon: <Check className="size-3.5 text-emerald-600" />,
    },
    {
      title: 'Improvement Areas',
      items: feedback.improvements,
      tone: 'border-amber-100 bg-amber-50/50',
      icon: <AlertTriangle className="size-3.5 text-amber-600" />,
    },
    {
      title: 'Recommended Practice',
      items: feedback.recommendation,
      tone: 'border-brand-100 bg-brand-50/50',
      icon: <Minus className="size-3.5 text-brand-600" />,
    },
  ]

  return (
    <div className={cn('grid gap-3 md:grid-cols-3', className)}>
      {sections.map((section) => (
        <div key={section.title} className={cn('rounded-lg border p-4', section.tone)}>
          <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-navy-700">
            {section.title}
          </h4>
          <ul className="space-y-1.5">
            {section.items.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm leading-snug text-navy-800">
                <span className="mt-1 shrink-0">{section.icon}</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Misc                                                                       */
/* -------------------------------------------------------------------------- */

export const Avatar = ({ name, className }: { name: string; className?: string }) => (
  <span
    className={cn(
      'inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-navy-100 text-[11px] font-bold text-navy-700',
      className,
    )}
  >
    {initials(name)}
  </span>
)

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-12 text-center">
      {icon && <div className="text-navy-300">{icon}</div>}
      <div>
        <p className="text-sm font-semibold text-navy-800">{title}</p>
        {description && (
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  )
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
  eyebrow?: string
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && (
          <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-brand-700">
            {eyebrow}
          </p>
        )}
        <h1 className="text-xl font-extrabold tracking-tight text-navy-900 sm:text-2xl">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Small labelled key/value row used across detail panels. */
export const DetailRow = ({
  label,
  value,
  mono,
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
}) => (
  <div className="flex items-baseline justify-between gap-4 py-1.5">
    <span className="text-xs font-medium text-muted-foreground">{label}</span>
    <span className={cn('text-sm font-semibold text-navy-900', mono && 'font-mono tabular')}>
      {value}
    </span>
  </div>
)
