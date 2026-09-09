import * as React from 'react'
import { FileText, Volume2 } from 'lucide-react'
import type { ScriptSegment } from '@/types'
import { cn } from '@/lib/utils'

/**
 * Running transcript of the call.
 *
 * Deliberately shows only what has been spoken. The upcoming lines are the
 * answer key — rendering them would turn a listening assessment into a
 * copy-typing exercise. `spokenCount` comes from the playback engine's
 * segment-start events, so the transcript cannot run ahead of the audio.
 *
 * Filler and intro lines are included even though they carry no data: dropping
 * them would make the transcript read as a list of answers rather than a call,
 * and their presence is part of what the candidate has to filter out.
 */
export function Transcript({
  segments,
  spokenCount,
  className,
}: {
  segments: ScriptSegment[]
  spokenCount: number
  className?: string
}) {
  const scrollRef = React.useRef<HTMLDivElement | null>(null)
  const visible = segments.slice(0, Math.max(0, spokenCount))

  // Follow the latest line, the way a caption track does.
  React.useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [spokenCount])

  return (
    <div className={cn('rounded-lg border border-border bg-card', className)}>
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <FileText className="size-3.5 text-navy-400" />
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Transcript
        </h3>
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">
          {visible.length}/{segments.length} lines
        </span>
      </div>

      <div ref={scrollRef} className="scroll-thin max-h-56 overflow-y-auto p-3">
        {visible.length === 0 ? (
          <p className="py-4 text-center text-[12px] text-muted-foreground">
            Lines appear here as they are spoken.
          </p>
        ) : (
          <ol className="space-y-1.5">
            {visible.map((segment, i) => {
              const isLatest = i === visible.length - 1
              return (
                <li
                  key={segment.id}
                  className={cn(
                    'flex gap-2 rounded px-1.5 py-1 text-[12px] leading-relaxed transition-colors',
                    isLatest ? 'bg-brand-50 text-navy-900' : 'text-navy-700',
                    segment.kind === 'correction' && 'font-medium text-amber-800',
                  )}
                >
                  {isLatest ? (
                    <Volume2 className="mt-0.5 size-3 shrink-0 animate-pulse-soft text-brand-600" />
                  ) : (
                    <span className="mt-0.5 w-3 shrink-0 font-mono text-[10px] text-navy-300">
                      {i + 1}
                    </span>
                  )}
                  <span>{segment.text}</span>
                </li>
              )
            })}
          </ol>
        )}
      </div>

      <p className="border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
        Only lines already spoken are shown.
      </p>
    </div>
  )
}
