import * as React from 'react'
import { Gauge, Headphones, Loader2, Pause, Play, RotateCcw, Volume2 } from 'lucide-react'
import { Badge, Button, Progress } from '@/components/ui'
import { cn, formatDuration } from '@/lib/utils'

/**
 * Assessment audio player.
 *
 * Deliberately restricted in certification mode:
 *  - no rewind, no skip forward, no scrubbing
 *  - no playback-speed control (the trainer sets it globally)
 *  - pause only when the trainer allows it
 *  - replay only in practice mode, or when the trainer enables it
 *
 * A live waveform is rendered from a deterministic pseudo-waveform rather than
 * real analyser data, because the Web Speech API does not expose an audio graph.
 * It communicates "audio is playing and here is where you are", which is its
 * whole job.
 */

/** Rates the candidate can pick from, when speed control is allowed. */
export const PLAYBACK_SPEEDS = [0.75, 0.9, 1, 1.15, 1.3] as const

export interface AudioPlayerProps {
  progress: number
  elapsedSeconds: number
  durationSeconds: number
  isPlaying: boolean
  hasStarted: boolean
  ended: boolean
  loading?: boolean
  pauseAllowed: boolean
  replayAllowed: boolean
  replaysUsed: number
  speakerLabel?: string
  wordsPerMinute?: number
  onPlay: () => void
  onPause: () => void
  onReplay: () => void
  /** Scrubbing. Omitted when the candidate is not allowed to seek. */
  seekAllowed?: boolean
  onSeek?: (progress: number) => void
  /** Segment boundaries (0–1) — seeking snaps to these. */
  segmentMarkers?: number[]
  /** Speed control. Omitted when the candidate is not allowed to change it. */
  speedControlAllowed?: boolean
  speed?: number
  onSpeedChange?: (speed: number) => void
  className?: string
}

export function AudioPlayer({
  progress,
  elapsedSeconds,
  durationSeconds,
  isPlaying,
  hasStarted,
  ended,
  loading,
  pauseAllowed,
  replayAllowed,
  replaysUsed,
  speakerLabel = 'Benefits Representative',
  wordsPerMinute,
  onPlay,
  onPause,
  onReplay,
  seekAllowed = false,
  onSeek,
  segmentMarkers = [],
  speedControlAllowed = false,
  speed = 1,
  onSpeedChange,
  className,
}: AudioPlayerProps) {
  return (
    <div className={cn('rounded-lg border border-border bg-card p-4 shadow-card', className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-full transition-colors',
              isPlaying ? 'bg-brand-600 text-white' : 'bg-navy-100 text-navy-600',
            )}
          >
            <Headphones className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-navy-900">{speakerLabel}</p>
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {isPlaying ? (
                <>
                  <span className="inline-flex size-1.5 animate-pulse-soft rounded-full bg-brand-600" />
                  Live call in progress
                </>
              ) : ended ? (
                'Call ended'
              ) : hasStarted ? (
                'Paused'
              ) : (
                'Ready to connect'
              )}
              {wordsPerMinute ? ` · ${wordsPerMinute} WPM` : ''}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {!hasStarted ? (
            <Button size="sm" variant="accent" onClick={onPlay} disabled={loading}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              Start audio
            </Button>
          ) : (
            <>
              {pauseAllowed && !ended && (
                <Button size="sm" variant="outline" onClick={isPlaying ? onPause : onPlay}>
                  {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
                  {isPlaying ? 'Pause' : 'Resume'}
                </Button>
              )}
              {replayAllowed && (
                <Button size="sm" variant="outline" onClick={onReplay}>
                  <RotateCcw className="size-4" />
                  Replay{replaysUsed > 0 ? ` (${replaysUsed})` : ''}
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <Waveform active={isPlaying} progress={progress} className="mt-3" />

      <div className="mt-2 flex items-center gap-3">
        <span className="metric-value w-11 shrink-0 text-xs text-navy-800">
          {formatDuration(elapsedSeconds)}
        </span>

        {seekAllowed && onSeek ? (
          <SeekBar
            progress={progress}
            markers={segmentMarkers}
            durationSeconds={durationSeconds}
            disabled={!hasStarted}
            onSeek={onSeek}
          />
        ) : (
          <Progress value={progress * 100} tone="brand" size="sm" className="flex-1" />
        )}

        <span className="metric-value w-11 shrink-0 text-right text-xs text-muted-foreground">
          {formatDuration(durationSeconds)}
        </span>
      </div>

      {speedControlAllowed && onSpeedChange && (
        <div className="mt-2.5 flex items-center gap-2">
          <Gauge className="size-3.5 shrink-0 text-navy-400" />
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Speed
          </span>
          <div className="flex gap-1" role="group" aria-label="Playback speed">
            {PLAYBACK_SPEEDS.map((rate) => (
              <button
                key={rate}
                onClick={() => onSpeedChange(rate)}
                aria-pressed={Math.abs(speed - rate) < 0.01}
                className={cn(
                  'rounded border px-1.5 py-0.5 font-mono text-[11px] tabular transition-colors',
                  Math.abs(speed - rate) < 0.01
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-border bg-card text-navy-700 hover:border-brand-300 hover:bg-brand-50',
                )}
              >
                {rate === 1 ? '1×' : `${rate}×`}
              </button>
            ))}
          </div>
          <span className="ml-auto text-[10px] text-muted-foreground">
            Applies from the next line
          </span>
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {!pauseAllowed && <Badge variant="muted">Pause disabled</Badge>}
        {!replayAllowed && <Badge variant="muted">No replay</Badge>}
        {seekAllowed ? (
          <Badge variant="accent">Seek enabled</Badge>
        ) : (
          <Badge variant="muted">No rewind or skip</Badge>
        )}
        {speedControlAllowed && <Badge variant="accent">Speed adjustable</Badge>}
        <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
          <Volume2 className="size-3" />
          Check your headset volume before starting
        </span>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Seek bar                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Draggable position control.
 *
 * Browser speech synthesis cannot seek mid-utterance, so the engine snaps to the
 * nearest segment boundary — roughly one spoken fact, which is the unit a
 * listener wants to jump to anyway. The ticks show where those boundaries are,
 * so the snapping looks deliberate rather than broken.
 */
function SeekBar({
  progress,
  markers,
  durationSeconds,
  disabled,
  onSeek,
}: {
  progress: number
  markers: number[]
  durationSeconds: number
  disabled: boolean
  onSeek: (progress: number) => void
}) {
  const trackRef = React.useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = React.useState(false)
  const [preview, setPreview] = React.useState(0)

  const positionFrom = (clientX: number) => {
    const el = trackRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  }

  // Snap to the segment the position falls inside, matching the engine.
  const snap = (p: number) => {
    if (!markers.length) return p
    let best = markers[0]
    for (const m of markers) if (m <= p) best = m
    return best
  }

  React.useEffect(() => {
    if (!dragging) return
    const move = (e: PointerEvent) => setPreview(snap(positionFrom(e.clientX)))
    const up = (e: PointerEvent) => {
      setDragging(false)
      onSeek(snap(positionFrom(e.clientX)))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, markers, onSeek])

  const shown = dragging ? preview : progress

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label="Audio position"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(shown * 100)}
      aria-valuetext={formatDuration(shown * durationSeconds)}
      aria-disabled={disabled}
      onPointerDown={(e) => {
        if (disabled) return
        e.preventDefault()
        setPreview(snap(positionFrom(e.clientX)))
        setDragging(true)
      }}
      onKeyDown={(e) => {
        if (disabled) return
        // Arrow keys step segment by segment.
        const i = markers.findIndex((m) => m > progress)
        const currentIndex = (i === -1 ? markers.length : i) - 1
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          onSeek(markers[Math.max(0, currentIndex - 1)] ?? 0)
        } else if (e.key === 'ArrowRight') {
          e.preventDefault()
          onSeek(markers[Math.min(markers.length - 1, currentIndex + 1)] ?? 1)
        }
      }}
      className={cn(
        'group relative flex-1 py-2',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
      )}
    >
      <div className="relative h-1.5 w-full rounded-full bg-navy-100">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-brand-600"
          style={{ width: `${shown * 100}%` }}
        />
        {/* Segment boundaries — where a seek will land. */}
        {markers.slice(1).map((m) => (
          <span
            key={m}
            className="absolute top-1/2 size-[3px] -translate-y-1/2 rounded-full bg-navy-300"
            style={{ left: `${m * 100}%` }}
          />
        ))}
        <span
          className={cn(
            'absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand-700 shadow transition-transform',
            dragging ? 'scale-125' : 'scale-0 group-hover:scale-100 group-focus:scale-100',
          )}
          style={{ left: `${shown * 100}%` }}
        />
      </div>
      {dragging && (
        <span className="absolute -top-5 -translate-x-1/2 rounded bg-navy-900 px-1.5 py-0.5 font-mono text-[10px] text-white"
          style={{ left: `${shown * 100}%` }}
        >
          {formatDuration(shown * durationSeconds)}
        </span>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Waveform                                                                   */
/* -------------------------------------------------------------------------- */

const BAR_COUNT = 72

/** Stable pseudo-random bar heights — regenerating per render would strobe. */
const BAR_HEIGHTS = Array.from({ length: BAR_COUNT }, (_, i) => {
  const a = Math.sin(i * 0.7) * 0.5 + 0.5
  const b = Math.sin(i * 2.3 + 1.1) * 0.5 + 0.5
  const c = Math.sin(i * 0.31 + 2.7) * 0.5 + 0.5
  return 0.22 + (a * 0.45 + b * 0.3 + c * 0.25) * 0.78
})

function Waveform({
  active,
  progress,
  className,
}: {
  active: boolean
  progress: number
  className?: string
}) {
  const [phase, setPhase] = React.useState(0)

  React.useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setPhase((p) => p + 1), 120)
    return () => window.clearInterval(id)
  }, [active])

  const playedTo = Math.floor(progress * BAR_COUNT)

  return (
    <div
      className={cn('flex h-10 items-center gap-[2px] overflow-hidden rounded-md bg-navy-50 px-2', className)}
      aria-hidden
    >
      {BAR_HEIGHTS.map((base, i) => {
        const played = i <= playedTo
        // Only bars near the playhead animate, so the strip reads as "here".
        const near = active && Math.abs(i - playedTo) < 6
        const jitter = near ? 0.65 + 0.35 * Math.abs(Math.sin((i + phase) * 1.3)) : 1
        return (
          <span
            key={i}
            className={cn(
              'w-full rounded-full transition-[height,background-color] duration-150',
              played ? (active ? 'bg-brand-600' : 'bg-brand-700/70') : 'bg-navy-200',
            )}
            style={{ height: `${Math.round(base * jitter * 100)}%` }}
          />
        )
      })}
    </div>
  )
}
