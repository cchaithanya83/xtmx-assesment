import * as React from 'react'
import { AlertCircle, Lock } from 'lucide-react'
import type { AudioField } from '@/types'
import { Input, Label, Select } from '@/components/ui'
import { cn } from '@/lib/utils'

/**
 * Structured capture form for Task 2.
 *
 * The form never reveals expected values, never validates against them during
 * the attempt, and never colours a field as right or wrong — correct answers
 * must not leak before submission. Critical fields are marked only so the
 * candidate knows where precision matters most.
 */

export interface ScenarioFormProps {
  fields: AudioField[]
  values: Record<string, string>
  onChange: (key: string, value: string) => void
  onFocusField: (key: string) => void
  disabled?: boolean
  /** Clipboard guards from `clipboardGuards()`. */
  guards?: Record<string, unknown>
  className?: string
}

export function ScenarioForm({
  fields,
  values,
  onChange,
  onFocusField,
  disabled,
  guards = {},
  className,
}: ScenarioFormProps) {
  return (
    <div className={cn('grid gap-3 sm:grid-cols-2', className)}>
      {fields.map((field) => (
        <FieldRow
          key={field.key}
          field={field}
          value={values[field.key] ?? ''}
          onChange={onChange}
          onFocusField={onFocusField}
          disabled={disabled}
          guards={guards}
        />
      ))}
    </div>
  )
}

const FieldRow = React.memo(function FieldRow({
  field,
  value,
  onChange,
  onFocusField,
  disabled,
  guards,
}: {
  field: AudioField
  value: string
  onChange: (key: string, value: string) => void
  onFocusField: (key: string) => void
  disabled?: boolean
  guards: Record<string, unknown>
}) {
  const id = `field-${field.key}`
  const filled = value.trim().length > 0

  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-3 transition-colors',
        field.critical ? 'border-brand-200' : 'border-border',
        filled && 'bg-muted/30',
      )}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <Label htmlFor={id} className="flex items-center gap-1.5">
          {field.label}
          {field.critical && (
            <span
              title="Critical field — errors carry a heavier scoring penalty"
              className="inline-flex items-center gap-0.5 rounded bg-brand-50 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-800"
            >
              <Lock className="size-2.5" />
              Critical
            </span>
          )}
        </Label>
        {field.type === 'currency' && (
          <span className="text-[10px] font-semibold text-muted-foreground">USD</span>
        )}
      </div>

      {field.type === 'select' ? (
        <Select
          id={id}
          value={value}
          disabled={disabled}
          onFocus={() => onFocusField(field.key)}
          onChange={(e) => onChange(field.key, e.target.value)}
        >
          <option value="">Select…</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      ) : (
        <Input
          id={id}
          value={value}
          disabled={disabled}
          placeholder={field.placeholder}
          inputMode={
            field.type === 'phone' || field.type === 'currency' ? 'numeric' : undefined
          }
          onFocus={() => onFocusField(field.key)}
          onChange={(e) => onChange(field.key, e.target.value)}
          className={cn(
            (field.type === 'id' || field.type === 'phone' || field.type === 'date' ||
              field.type === 'currency' || field.type === 'percent') &&
              'font-mono tabular',
          )}
          {...guards}
        />
      )}

      {field.hint && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
          <AlertCircle className="size-3" />
          {field.hint}
        </p>
      )}
    </div>
  )
})

/* -------------------------------------------------------------------------- */
/*  Capture summary strip                                                      */
/* -------------------------------------------------------------------------- */

export function CaptureSummary({
  fields,
  values,
  className,
}: {
  fields: AudioField[]
  values: Record<string, string>
  className?: string
}) {
  const filled = fields.filter((f) => (values[f.key] ?? '').trim().length > 0).length
  const criticalTotal = fields.filter((f) => f.critical).length
  const criticalFilled = fields.filter(
    (f) => f.critical && (values[f.key] ?? '').trim().length > 0,
  ).length

  return (
    <div className={cn('flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs', className)}>
      <span className="flex items-center gap-1.5 text-muted-foreground">
        Fields captured
        <span className="metric-value text-sm text-navy-900">
          {filled}/{fields.length}
        </span>
      </span>
      <span className="flex items-center gap-1.5 text-muted-foreground">
        Critical fields
        <span
          className={cn(
            'metric-value text-sm',
            criticalFilled === criticalTotal ? 'text-emerald-700' : 'text-amber-700',
          )}
        >
          {criticalFilled}/{criticalTotal}
        </span>
      </span>
    </div>
  )
}
