import * as React from 'react'
import {
  AlertCircle,
  CheckCircle2,
  CornerDownLeft,
  Delete,
  Flame,
  Gauge,
  Target,
  Timer,
} from 'lucide-react'
import type { TypingMetrics } from '@/types'
import { cn, formatDuration } from '@/lib/utils'
import { Progress } from '@/components/ui'

/**
 * The always-visible live metric strip shown during a Task 1 assessment.
 * Values update on every keystroke; layout is fixed-width so numbers do not
 * cause reflow as they change.
 */

export interface LiveMetricsProps {
  metrics: TypingMetrics
  remainingSeconds: number
  minWpm: number
  minAccuracy: number
  className?: string
}

export function LiveMetrics({
  metrics,
  remainingSeconds,
  minWpm,
  minAccuracy,
  className,
}: LiveMetricsProps) {
  const lowTime = remainingSeconds <= 30

  return (
    <div className={cn('grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4 xl:grid-cols-8', className)}>
      <Tile
        icon={<Gauge className="size-3.5" />}
        label="Live WPM"
        value={metrics.wpm}
        suffix="WPM"
        tone={metrics.wpm >= minWpm ? 'good' : metrics.totalKeystrokes > 40 ? 'bad' : 'neutral'}
      />
      <Tile
        icon={<Target className="size-3.5" />}
        label="Accuracy"
        value={`${metrics.accuracy}%`}
        tone={
          metrics.accuracy >= minAccuracy ? 'good' : metrics.totalKeystrokes > 40 ? 'bad' : 'neutral'
        }
      />
      <Tile
        icon={<Timer className="size-3.5" />}
        label="Time Left"
        value={formatDuration(remainingSeconds)}
        tone={lowTime ? 'bad' : 'neutral'}
        pulse={lowTime}
      />
      <Tile
        icon={<CheckCircle2 className="size-3.5" />}
        label="Progress"
        value={`${Math.round(metrics.completionPercentage)}%`}
        tone="neutral"
      />
      <Tile
        icon={<AlertCircle className="size-3.5" />}
        label="Errors"
        value={metrics.incorrectKeystrokes}
        tone={metrics.incorrectKeystrokes > 0 ? 'warn' : 'neutral'}
      />
      <Tile
        icon={<CornerDownLeft className="size-3.5" />}
        label="Correct Chars"
        value={metrics.correctCharacters}
        tone="neutral"
      />
      <Tile
        icon={<Delete className="size-3.5" />}
        label="Backspaces"
        value={metrics.backspaces}
        tone="neutral"
      />
      <Tile
        icon={<Flame className="size-3.5" />}
        label="Streak"
        value={metrics.currentStreak}
        suffix="correct"
        tone={metrics.currentStreak >= 40 ? 'good' : 'neutral'}
      />
    </div>
  )
}

const TONE_CLASS = {
  neutral: 'text-navy-900',
  good: 'text-emerald-700',
  warn: 'text-amber-700',
  bad: 'text-red-700',
} as const

function Tile({
  icon,
  label,
  value,
  suffix,
  tone,
  pulse,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  suffix?: string
  tone: keyof typeof TONE_CLASS
  pulse?: boolean
}) {
  return (
    <div className="flex flex-col gap-0.5 bg-card px-3 py-2.5">
      <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="flex items-baseline gap-1">
        <span
          className={cn('metric-value text-xl leading-none', TONE_CLASS[tone], pulse && 'animate-pulse-soft')}
        >
          {value}
        </span>
        {suffix && <span className="text-[10px] font-semibold text-muted-foreground">{suffix}</span>}
      </span>
    </div>
  )
}

/** Slim progress bar shown directly under the metric strip. */
export function AssessmentProgressBar({
  completion,
  timeRatio,
}: {
  completion: number
  timeRatio: number
}) {
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      <div>
        <div className="mb-1 flex items-baseline justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Passage progress</span>
          <span className="tabular text-navy-800">{Math.round(completion)}%</span>
        </div>
        <Progress value={completion} tone="brand" size="sm" />
      </div>
      <div>
        <div className="mb-1 flex items-baseline justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Time elapsed</span>
          <span className="tabular text-navy-800">{Math.round(timeRatio)}%</span>
        </div>
        <Progress
          value={timeRatio}
          tone={timeRatio > 85 ? 'red' : timeRatio > 65 ? 'amber' : 'navy'}
          size="sm"
        />
      </div>
    </div>
  )
}
