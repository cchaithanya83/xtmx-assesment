import { ClipboardPaste, NotebookPen } from 'lucide-react'
import { Label, Textarea } from '@/components/ui'
import { cn } from '@/lib/utils'

const MAX_NOTES = 4000

/**
 * Scratchpad for the listening round.
 *
 * A real call handler writes on a pad and transfers it to the form afterwards.
 * Forcing every value straight into its final field measures typing under
 * pressure rather than listening.
 *
 * Enabling the pad also unblocks paste in the answer fields — a pad you cannot
 * paste out of is useless. Task 1 is unaffected: pasting the source passage
 * there would defeat the typing test.
 *
 * Notes are saved with the attempt and visible to the trainer, which the label
 * says plainly — a scratchpad the candidate believes is private and is not
 * would be a nasty surprise.
 */
export function NotesPad({
  value,
  onChange,
  className,
}: {
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  const remaining = MAX_NOTES - value.length

  return (
    <div className={cn('rounded-lg border border-border bg-card p-3', className)}>
      <div className="mb-1.5 flex items-center gap-2">
        <NotebookPen className="size-3.5 text-navy-400" />
        <Label htmlFor="notes-pad">Scratchpad</Label>
        <span className="ml-auto flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
          <ClipboardPaste className="size-3" />
          Paste enabled
        </span>
      </div>

      <Textarea
        id="notes-pad"
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, MAX_NOTES))}
        placeholder={'Jot values as you hear them, then paste them into the fields.\n\nMember ID: BC784592\nDOB: 04/17/1991'}
        spellCheck={false}
        className="h-32 resize-none font-mono text-[12px] leading-relaxed"
      />

      <p className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span>
          Not scored. Copy from here into the fields. Saved with your attempt and visible to your
          trainer.
        </span>
        {remaining < 500 && (
          <span className={cn('shrink-0 tabular', remaining < 100 && 'text-amber-700')}>
            {remaining} left
          </span>
        )}
      </p>
    </div>
  )
}
