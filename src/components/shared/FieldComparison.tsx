import * as React from 'react'
import { AlertTriangle, Check, Lock, Minus, X } from 'lucide-react'
import type { FieldResult } from '@/types'
import { Badge } from '@/components/ui'
import { cn } from '@/lib/utils'

/**
 * Field-by-field review of a Task 2 attempt: what was said against what was
 * captured.
 *
 * Shown after submission, to the candidate and the trainer alike. Safe to
 * reveal — the attempt is closed, and a retry generates a fresh scenario with
 * different values, so nothing here is worth memorising.
 *
 * Three outcomes are distinguished on purpose, because they need different
 * coaching:
 *   correct   — nothing to say
 *   near miss — heard it, mistyped it (a transposed digit, a missing hyphen)
 *   missed    — wrong value, or nothing captured at all
 * Lumping the last two together hides whether the problem is listening or
 * typing.
 */

export type FieldOutcome = 'correct' | 'near' | 'wrong' | 'blank'

export function outcomeOf(field: FieldResult): FieldOutcome {
  if (field.correct) return 'correct'
  if (field.skipped) return 'blank'

  // Judged on edit distance rather than a similarity ratio. A ratio misreads
  // short values: one transposition in a 7-character ID scores 0.71, which
  // would look like a wild guess, while the identical slip in a long provider
  // name scores 0.92. Distance says "two characters out" either way.
  //
  // The tolerance grows with length so a long name is allowed proportionally
  // more slack, with a floor of 2 — enough for a single transposition, which
  // costs two edits.
  const length = Math.max(field.expected.length, field.actual.length, 1)
  const tolerance = Math.max(2, Math.ceil(length * 0.15))
  const distance = field.editDistance ?? Math.round((1 - field.similarity) * length)
  return distance <= tolerance ? 'near' : 'wrong'
}

const OUTCOME: Record<
  FieldOutcome,
  { label: string; row: string; chip: string; icon: React.ReactNode }
> = {
  correct: {
    label: 'Correct',
    row: '',
    chip: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    icon: <Check className="size-3" />,
  },
  near: {
    label: 'Near miss',
    row: 'bg-amber-50/40',
    chip: 'border-amber-200 bg-amber-50 text-amber-800',
    icon: <AlertTriangle className="size-3" />,
  },
  wrong: {
    label: 'Incorrect',
    row: 'bg-red-50/40',
    chip: 'border-red-200 bg-red-50 text-red-800',
    icon: <X className="size-3" />,
  },
  blank: {
    label: 'Not captured',
    row: 'bg-red-50/30',
    chip: 'border-navy-200 bg-navy-50 text-navy-600',
    icon: <Minus className="size-3" />,
  },
}

/**
 * Highlights the characters that differ, so a one-digit slip is visible at a
 * glance rather than requiring the reader to compare two strings by eye.
 * Deliberately a simple position-wise comparison: these are short values, and
 * a real diff would mark an insertion as a whole-tail mismatch, which reads
 * worse for exactly the transposition cases this is meant to catch.
 */
function DiffText({ value, against }: { value: string; against: string }) {
  if (!value) return <span className="text-muted-foreground">—</span>
  return (
    <>
      {value.split('').map((ch, i) => {
        const differs = against[i]?.toLowerCase() !== ch.toLowerCase()
        return (
          <span
            key={i}
            className={cn(differs && 'rounded-[2px] bg-red-200/70 text-red-900')}
          >
            {ch}
          </span>
        )
      })}
    </>
  )
}

export function FieldComparison({
  fields,
  className,
  compact,
}: {
  fields: FieldResult[]
  className?: string
  compact?: boolean
}) {
  if (!fields.length) return null

  const wrong = fields.filter((f) => !f.correct)
  const criticalWrong = wrong.filter((f) => f.critical)

  return (
    <div className={className}>
      {!compact && (
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Field review
          </h3>
          <Badge variant={wrong.length === 0 ? 'success' : 'warning'}>
            {fields.length - wrong.length}/{fields.length} correct
          </Badge>
          {criticalWrong.length > 0 && (
            <Badge variant="danger">
              <Lock className="size-3" />
              {criticalWrong.length} critical missed
            </Badge>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="overflow-x-auto">
          <table className="data-grid min-w-[600px]">
            <thead>
              <tr>
                <th className="w-[26%]">Field</th>
                <th className="w-[30%]">Expected</th>
                <th className="w-[30%]">You entered</th>
                <th className="w-[14%]">Result</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field) => {
                const outcome = outcomeOf(field)
                const style = OUTCOME[outcome]
                return (
                  <tr key={field.key} className={style.row}>
                    <td>
                      <span className="flex items-center gap-1.5">
                        <span className="text-[13px] font-medium text-navy-800">
                          {field.label}
                        </span>
                        {field.critical && (
                          <span
                            title="Critical field — errors carry a heavier penalty"
                            className="rounded bg-brand-50 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-800"
                          >
                            Critical
                          </span>
                        )}
                      </span>
                      {field.appliedSpokenCorrection === false && (
                        <span className="mt-0.5 block text-[10px] font-medium text-amber-700">
                          Spoken correction not applied
                        </span>
                      )}
                    </td>
                    <td className="font-mono text-[12px] text-navy-900">{field.expected}</td>
                    <td className="font-mono text-[12px] text-navy-900">
                      {field.correct ? (
                        field.actual || <span className="text-muted-foreground">—</span>
                      ) : (
                        <DiffText value={field.actual} against={field.expected} />
                      )}
                    </td>
                    <td>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                          style.chip,
                        )}
                      >
                        {style.icon}
                        {style.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {!compact && wrong.length > 0 && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          A <strong className="font-semibold text-amber-700">near miss</strong> means the value was
          heard but mistyped — a transposed digit or a missing separator. An{' '}
          <strong className="font-semibold text-red-700">incorrect</strong> or{' '}
          <strong className="font-semibold">not captured</strong> field usually means it was not
          caught at all. Differing characters are highlighted.
        </p>
      )}
    </div>
  )
}

/** One-line summary for a collapsed row. */
export function FieldComparisonSummary({ fields }: { fields: FieldResult[] }) {
  if (!fields.length) return null
  const wrong = fields.filter((f) => !f.correct)
  if (!wrong.length) {
    return <span className="text-[11px] font-medium text-emerald-700">All fields correct</span>
  }
  const critical = wrong.filter((f) => f.critical).length
  return (
    <span className="text-[11px] font-medium text-amber-700">
      {wrong.length} missed
      {critical > 0 ? ` · ${critical} critical` : ''}: {wrong.slice(0, 3).map((f) => f.label).join(', ')}
      {wrong.length > 3 ? ` +${wrong.length - 3}` : ''}
    </span>
  )
}
