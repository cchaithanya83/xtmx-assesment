import * as React from 'react'
import type { CharCell } from '@/engine/typingEngine'
import { chunkComparison } from '@/engine/typingEngine'
import { cn } from '@/lib/utils'

/**
 * Live per-character comparison of the source text.
 *
 * Performance notes — this is rendered on every keystroke over passages that can
 * exceed 1,200 characters:
 *  - the source is split into word-sized chunks and each chunk is memoised, so a
 *    keystroke re-renders one or two chunks rather than the whole passage;
 *  - characters carry no per-node event handlers;
 *  - the cursor is scrolled into view with a ref, not by re-laying-out the text.
 *
 * The candidate's own typed text is never replaced or re-rendered here — their
 * textarea keeps its native value, caret and IME behaviour.
 */

export interface TextComparisonProps {
  cells: CharCell[]
  className?: string
  /** Auto-scroll the current character into view. */
  followCursor?: boolean
}

export function TextComparison({ cells, className, followCursor = true }: TextComparisonProps) {
  const chunks = React.useMemo(() => chunkComparison(cells), [cells])
  const cursorRef = React.useRef<HTMLSpanElement | null>(null)
  const containerRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    if (!followCursor) return
    const el = cursorRef.current
    const container = containerRef.current
    if (!el || !container) return
    const elTop = el.offsetTop
    const elBottom = elTop + el.offsetHeight
    const viewTop = container.scrollTop
    const viewBottom = viewTop + container.clientHeight
    // Keep the caret in the middle band of the viewport while typing.
    if (elBottom > viewBottom - 48 || elTop < viewTop + 24) {
      container.scrollTo({ top: elTop - container.clientHeight / 2, behavior: 'smooth' })
    }
  }, [cells, followCursor])

  return (
    <div
      ref={containerRef}
      className={cn(
        'scroll-thin overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-card p-5',
        'font-mono text-[15px] leading-[1.9] tracking-tight selection:bg-transparent',
        className,
      )}
      aria-label="Source text"
    >
      {chunks.map((chunk) => (
        <Chunk key={chunk.key} cells={chunk.cells} cursorRef={cursorRef} />
      ))}
    </div>
  )
}

interface ChunkProps {
  cells: CharCell[]
  cursorRef: React.MutableRefObject<HTMLSpanElement | null>
}

/**
 * A memoised word. The comparator hashes the chunk's states so React skips
 * re-rendering every word that did not change on this keystroke.
 */
const Chunk = React.memo(
  ({ cells, cursorRef }: ChunkProps) => (
    <>
      {cells.map((cell) => (
        <Char key={cell.index} cell={cell} cursorRef={cursorRef} />
      ))}
    </>
  ),
  (prev, next) => stateKey(prev.cells) === stateKey(next.cells),
)
Chunk.displayName = 'Chunk'

function stateKey(cells: CharCell[]): string {
  let key = ''
  for (const c of cells) key += c.state[0]
  return key
}

function Char({
  cell,
  cursorRef,
}: {
  cell: CharCell
  cursorRef: React.MutableRefObject<HTMLSpanElement | null>
}) {
  const isNewline = cell.char === '\n'
  const isSpace = cell.char === ' '

  const className =
    cell.state === 'current'
      ? 'char-current'
      : cell.state === 'correct'
        ? 'char-correct'
        : cell.state === 'corrected'
          ? 'char-corrected'
          : cell.state === 'incorrect'
            ? isSpace || isNewline
              ? 'char-incorrect-space'
              : 'char-incorrect'
            : 'char-pending'

  if (isNewline) {
    return (
      <span ref={cell.state === 'current' ? cursorRef : undefined} className={className}>
        {'\n'}
      </span>
    )
  }

  return (
    <span ref={cell.state === 'current' ? cursorRef : undefined} className={className}>
      {cell.char}
    </span>
  )
}

/** Legend explaining the character colouring. */
export function ComparisonLegend({ className }: { className?: string }) {
  const items: { label: string; className: string }[] = [
    { label: 'Correct', className: 'char-correct border-navy-200' },
    { label: 'Error', className: 'char-incorrect border-red-200' },
    { label: 'Corrected', className: 'char-corrected border-brand-200' },
    { label: 'Cursor', className: 'char-current border-brand-300' },
    { label: 'Untyped', className: 'char-pending border-navy-100' },
  ]
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5', className)}>
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span
            className={cn(
              'inline-flex size-4 items-center justify-center rounded border font-mono text-[10px]',
              item.className,
            )}
          >
            A
          </span>
          {item.label}
        </span>
      ))}
    </div>
  )
}
