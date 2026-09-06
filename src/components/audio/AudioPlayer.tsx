import * as React from 'react'
import { Headphones, Loader2, Pause, Play, RotateCcw, Volume2 } from 'lucide-react'
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
        <Progress value={progress * 100} tone="brand" size="sm" className="flex-1" />
        <span className="metric-value w-11 shrink-0 text-right text-xs text-muted-foreground">
          {formatDuration(durationSeconds)}
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {!pauseAllowed && <Badge variant="muted">Pause disabled</Badge>}
        {!replayAllowed && <Badge variant="muted">No replay</Badge>}
        <Badge variant="muted">No rewind</Badge>
        <Badge variant="muted">No skip</Badge>
        <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
          <Volume2 className="size-3" />
          Check your headset volume before starting
        </span>
      </div>
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
