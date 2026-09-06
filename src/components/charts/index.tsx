import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Attempt } from '@/types'

/**
 * Analytics charts.
 *
 * Palette is drawn from the enterprise tokens (navy ink, brand blue, muted
 * amber/red for thresholds) so charts read as part of the same system as the
 * rest of the platform. Axes and grids are deliberately low-contrast — the data
 * should be the most salient thing on the canvas.
 */

const INK = '#0f1c33'
const MUTED = '#64748b'
const GRID = '#e2e8f0'
const BRAND = '#0b4899' // XTransMatrix brand blue
const NAVY = '#40567a'
const AMBER = '#d97706'
const RED = '#b91c1c'
const EMERALD = '#047857'

const AXIS = { stroke: GRID, tick: { fill: MUTED, fontSize: 11 }, tickLine: false }

const tooltipStyle = {
  contentStyle: {
    borderRadius: 8,
    border: '1px solid #e2e8f0',
    boxShadow: '0 8px 30px -12px rgb(15 28 51 / 0.18)',
    fontSize: 12,
    padding: '8px 10px',
  },
  labelStyle: { color: INK, fontWeight: 700, marginBottom: 4 },
}

/* -------------------------------------------------------------------------- */
/*  Attempt number vs score                                                    */
/* -------------------------------------------------------------------------- */

export function AttemptTrendChart({
  attempts,
  passingScore,
  height = 240,
}: {
  attempts: Attempt[]
  passingScore: number
  height?: number
}) {
  const data = attempts.map((a, i) => ({
    label: `#${i + 1}`,
    score: a.score,
    task: `T${a.taskId}-A${a.assignmentId}`,
    passed: a.passed,
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" {...AXIS} />
        <YAxis domain={[0, 100]} {...AXIS} />
        <Tooltip
          {...tooltipStyle}
          formatter={(value: number) => [`${value} / 100`, 'Score']}
          labelFormatter={(label, payload) =>
            `Attempt ${label} · ${payload?.[0]?.payload?.task ?? ''}`
          }
        />
        <ReferenceLine
          y={passingScore}
          stroke={AMBER}
          strokeDasharray="4 4"
          label={{ value: `Pass ${passingScore}`, position: 'right', fill: AMBER, fontSize: 10 }}
        />
        <Line
          type="monotone"
          dataKey="score"
          stroke={BRAND}
          strokeWidth={2}
          dot={{ r: 3, fill: BRAND, strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

/* -------------------------------------------------------------------------- */
/*  WPM vs accuracy                                                            */
/* -------------------------------------------------------------------------- */

export function SpeedAccuracyChart({
  attempts,
  minWpm,
  minAccuracy,
  height = 240,
}: {
  attempts: Attempt[]
  minWpm: number
  minAccuracy: number
  height?: number
}) {
  const data = attempts
    .filter((a) => a.taskId === 1)
    .map((a, i) => ({
      label: `#${i + 1}`,
      wpm: a.wpm ?? 0,
      accuracy: a.accuracy ?? 0,
    }))

  if (!data.length) {
    return <EmptyChart height={height} message="No typing attempts recorded yet" />
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" {...AXIS} />
        <YAxis yAxisId="left" domain={[0, 'dataMax + 10']} {...AXIS} />
        <YAxis yAxisId="right" orientation="right" domain={[50, 100]} {...AXIS} />
        <Tooltip {...tooltipStyle} />
        <Legend
          wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
          iconType="plainline"
          iconSize={14}
        />
        <ReferenceLine yAxisId="left" y={minWpm} stroke={NAVY} strokeDasharray="4 4" />
        <ReferenceLine yAxisId="right" y={minAccuracy} stroke={AMBER} strokeDasharray="4 4" />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="wpm"
          name="WPM"
          stroke={NAVY}
          strokeWidth={2}
          dot={{ r: 3, fill: NAVY, strokeWidth: 0 }}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="accuracy"
          name="Accuracy %"
          stroke={BRAND}
          strokeWidth={2}
          dot={{ r: 3, fill: BRAND, strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

/* -------------------------------------------------------------------------- */
/*  Per-assignment best score                                                  */
/* -------------------------------------------------------------------------- */

export function AssignmentScoreChart({
  data,
  passingScore,
  height = 240,
}: {
  data: { label: string; score: number; passed: boolean }[]
  passingScore: number
  height?: number
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" {...AXIS} interval={0} />
        <YAxis domain={[0, 100]} {...AXIS} />
        <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v} / 100`, 'Best score']} />
        <ReferenceLine y={passingScore} stroke={AMBER} strokeDasharray="4 4" />
        <Bar dataKey="score" radius={[4, 4, 0, 0]} maxBarSize={44}>
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.passed ? EMERALD : entry.score >= passingScore ? BRAND : RED}
              fillOpacity={entry.score === 0 ? 0.15 : 0.85}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/* -------------------------------------------------------------------------- */
/*  Competency radar                                                           */
/* -------------------------------------------------------------------------- */

export function CompetencyRadar({
  data,
  height = 260,
}: {
  data: { competency: string; value: number }[]
  height?: number
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke={GRID} />
        <PolarAngleAxis dataKey="competency" tick={{ fill: MUTED, fontSize: 10 }} />
        <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v}%`, 'Score']} />
        <Radar dataKey="value" stroke={BRAND} fill={BRAND} fillOpacity={0.22} strokeWidth={2} />
      </RadarChart>
    </ResponsiveContainer>
  )
}

/* -------------------------------------------------------------------------- */
/*  Cohort score distribution (trainer)                                        */
/* -------------------------------------------------------------------------- */

export function ScoreDistributionChart({
  data,
  height = 220,
}: {
  data: { band: string; count: number; tone: 'emerald' | 'brand' | 'amber' | 'orange' | 'red' }[]
  height?: number
}) {
  const TONE: Record<string, string> = {
    emerald: EMERALD,
    brand: BRAND,
    amber: AMBER,
    orange: '#ea580c',
    red: RED,
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="band" {...AXIS} interval={0} />
        <YAxis allowDecimals={false} {...AXIS} />
        <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v} candidate(s)`, '']} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={54}>
          {data.map((entry, i) => (
            <Cell key={i} fill={TONE[entry.tone]} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function EmptyChart({ height, message }: { height: number; message: string }) {
  return (
    <div
      className="flex items-center justify-center rounded-md border border-dashed border-border bg-muted/30 text-xs text-muted-foreground"
      style={{ height }}
    >
      {message}
    </div>
  )
}
