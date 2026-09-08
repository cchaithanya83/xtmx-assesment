import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * shadcn/ui-style primitives.
 *
 * Written in-repo rather than pulled from the CLI so the whole design system
 * ships with the app and the enterprise palette is enforced in one place.
 * APIs match the shadcn conventions (`variant`/`size` props, `asChild`-free
 * composition) so components can be swapped for the upstream ones later.
 */

/* -------------------------------------------------------------------------- */
/*  Button                                                                     */
/* -------------------------------------------------------------------------- */

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-navy-900 text-white hover:bg-navy-800 active:bg-navy-950',
        accent: 'bg-brand-700 text-white hover:bg-brand-600 active:bg-brand-800',
        outline:
          'border border-border bg-card text-navy-900 hover:bg-muted hover:text-navy-950',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-navy-100',
        ghost: 'text-navy-700 hover:bg-muted hover:text-navy-900',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-red-700',
        link: 'text-brand-700 underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-[13px]',
        lg: 'h-11 rounded-md px-6 text-[15px]',
        xl: 'h-12 rounded-md px-8 text-base',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
)
Button.displayName = 'Button'

/* -------------------------------------------------------------------------- */
/*  Card                                                                       */
/* -------------------------------------------------------------------------- */

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('rounded-lg border border-border bg-card shadow-card', className)}
      {...props}
    />
  ),
)
Card.displayName = 'Card'

export const CardHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1 p-5', className)} {...props} />
)

export const CardTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h3
    className={cn('text-base font-bold leading-tight tracking-tight text-navy-900', className)}
    {...props}
  />
)

export const CardDescription = ({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={cn('text-sm leading-relaxed text-muted-foreground', className)} {...props} />
)

export const CardContent = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('p-5 pt-0', className)} {...props} />
)

export const CardFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex items-center p-5 pt-0', className)} {...props} />
)

/* -------------------------------------------------------------------------- */
/*  Badge                                                                      */
/* -------------------------------------------------------------------------- */

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide transition-colors',
  {
    variants: {
      variant: {
        default: 'border-navy-200 bg-navy-50 text-navy-700',
        outline: 'border-border bg-transparent text-navy-600',
        accent: 'border-brand-200 bg-brand-50 text-brand-800',
        success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
        warning: 'border-amber-200 bg-amber-50 text-amber-800',
        danger: 'border-red-200 bg-red-50 text-red-800',
        muted: 'border-border bg-muted text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export const Badge = ({ className, variant, ...props }: BadgeProps) => (
  <span className={cn(badgeVariants({ variant }), className)} {...props} />
)

/* -------------------------------------------------------------------------- */
/*  Form controls                                                              */
/* -------------------------------------------------------------------------- */

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm text-navy-900 shadow-sm transition-colors',
        'placeholder:text-navy-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-navy-900 shadow-sm transition-colors',
      'placeholder:text-navy-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      'disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60',
      className,
    )}
    {...props}
  />
))
Textarea.displayName = 'Textarea'

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'flex h-9 w-full appearance-none rounded-md border border-input bg-card bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat px-3 py-1 pr-8 text-sm text-navy-900 shadow-sm transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60',
      className,
    )}
    style={{
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23526e94' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
    }}
    {...props}
  >
    {children}
  </select>
))
Select.displayName = 'Select'

export const Label = ({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <label
    className={cn(
      'text-[11px] font-semibold uppercase tracking-wider text-muted-foreground',
      className,
    )}
    {...props}
  />
)

export interface SwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  id?: string
}

export const Switch = ({ checked, onCheckedChange, disabled, id }: SwitchProps) => (
  <button
    id={id}
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onCheckedChange(!checked)}
    className={cn(
      'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      checked ? 'border-brand-700 bg-brand-700' : 'border-border bg-navy-200',
      disabled && 'cursor-not-allowed opacity-50',
    )}
  >
    <span
      className={cn(
        'pointer-events-none block h-4 w-4 rounded-full bg-white shadow transition-transform',
        checked ? 'translate-x-[18px]' : 'translate-x-[2px]',
      )}
    />
  </button>
)

/* -------------------------------------------------------------------------- */
/*  NumberInput                                                                */
/* -------------------------------------------------------------------------- */

export interface NumberInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min' | 'max'> {
  value: number
  min: number
  max: number
  onValueChange: (value: number) => void
}

/**
 * A numeric field you can actually type in.
 *
 * The naive approach — parse and clamp on every keystroke — is unusable:
 * `Number('')` is `0`, so backspacing to empty snaps the field to its minimum,
 * and typing "30" into a field with a minimum of 20 gets clamped to 20 the
 * moment you type "3", swallowing the second digit.
 *
 * So the raw text is held locally while editing and only committed when it
 * parses to something inside the range. Out-of-range or half-finished input
 * stays as text until blur, which clamps and commits. That means you can clear
 * the field, type a new value, and have it behave.
 */
export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  function NumberInput({ value, min, max, onValueChange, className, ...props }, ref) {
    const [draft, setDraft] = React.useState<string>(String(value))
    const [editing, setEditing] = React.useState(false)

    // Track external changes (a reset, a restore-defaults) but never yank the
    // field out from under someone mid-edit.
    React.useEffect(() => {
      if (!editing) setDraft(String(value))
    }, [value, editing])

    const commit = (raw: string) => {
      const parsed = Number(raw)
      if (raw.trim() === '' || !Number.isFinite(parsed)) {
        // Nothing usable typed — put the last good value back.
        setDraft(String(value))
        return
      }
      const clamped = Math.min(max, Math.max(min, parsed))
      setDraft(String(clamped))
      if (clamped !== value) onValueChange(clamped)
    }

    return (
      <Input
        ref={ref}
        type="text"
        inputMode="decimal"
        value={draft}
        aria-valuemin={min}
        aria-valuemax={max}
        onFocus={(e) => {
          setEditing(true)
          props.onFocus?.(e)
        }}
        onChange={(e) => {
          const raw = e.target.value
          // Digits, one optional decimal point, optional leading minus.
          if (raw !== '' && !/^-?\d*\.?\d*$/.test(raw)) return
          setDraft(raw)

          // Commit live only when the value is already valid, so dependent UI
          // updates as you type without fighting a partial entry.
          const parsed = Number(raw)
          if (raw.trim() !== '' && Number.isFinite(parsed) && parsed >= min && parsed <= max) {
            if (parsed !== value) onValueChange(parsed)
          }
        }}
        onBlur={(e) => {
          setEditing(false)
          commit(e.target.value)
          props.onBlur?.(e)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit((e.target as HTMLInputElement).value)
            ;(e.target as HTMLInputElement).blur()
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            // `type="text"` loses the native stepper, so re-add it.
            e.preventDefault()
            const step = Number(props.step ?? 1) || 1
            const base = Number(draft)
            const next = (Number.isFinite(base) ? base : min) + (e.key === 'ArrowUp' ? step : -step)
            const clamped = Math.min(max, Math.max(min, Number(next.toFixed(4))))
            setDraft(String(clamped))
            if (clamped !== value) onValueChange(clamped)
          }
          props.onKeyDown?.(e)
        }}
        className={cn('font-mono tabular', className)}
        {...props}
      />
    )
  },
)

/* -------------------------------------------------------------------------- */
/*  Progress                                                                   */
/* -------------------------------------------------------------------------- */

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number
  tone?: 'navy' | 'brand' | 'amber' | 'red' | 'emerald'
  size?: 'sm' | 'default' | 'lg'
}

const TONE_BG: Record<NonNullable<ProgressProps['tone']>, string> = {
  navy: 'bg-navy-800',
  brand: 'bg-brand-600',
  amber: 'bg-amber-500',
  red: 'bg-red-600',
  emerald: 'bg-emerald-600',
}

export const Progress = ({
  value,
  tone = 'brand',
  size = 'default',
  className,
  ...props
}: ProgressProps) => (
  <div
    role="progressbar"
    aria-valuenow={Math.round(value)}
    aria-valuemin={0}
    aria-valuemax={100}
    className={cn(
      'w-full overflow-hidden rounded-full bg-navy-100',
      size === 'sm' ? 'h-1.5' : size === 'lg' ? 'h-3' : 'h-2',
      className,
    )}
    {...props}
  >
    <div
      className={cn('h-full rounded-full transition-[width] duration-300 ease-out', TONE_BG[tone])}
      style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
    />
  </div>
)

/* -------------------------------------------------------------------------- */
/*  Separator / Skeleton                                                       */
/* -------------------------------------------------------------------------- */

export const Separator = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('h-px w-full bg-border', className)} {...props} />
)

export const Skeleton = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('animate-pulse-soft rounded-md bg-navy-100', className)} {...props} />
)

/* -------------------------------------------------------------------------- */
/*  Tabs (uncontrolled-friendly, no external dependency)                       */
/* -------------------------------------------------------------------------- */

export interface TabItem {
  value: string
  label: string
  count?: number
}

export const Tabs = ({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem[]
  value: string
  onChange: (value: string) => void
  className?: string
}) => (
  <div className={cn('flex items-center gap-1 border-b border-border', className)} role="tablist">
    {items.map((item) => {
      const active = item.value === value
      return (
        <button
          key={item.value}
          role="tab"
          aria-selected={active}
          onClick={() => onChange(item.value)}
          className={cn(
            'relative -mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold transition-colors',
            active
              ? 'border-brand-600 text-navy-900'
              : 'border-transparent text-muted-foreground hover:border-navy-200 hover:text-navy-700',
          )}
        >
          {item.label}
          {item.count !== undefined && (
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-[11px] tabular',
                active ? 'bg-brand-50 text-brand-800' : 'bg-muted text-muted-foreground',
              )}
            >
              {item.count}
            </span>
          )}
        </button>
      )
    })}
  </div>
)

/* -------------------------------------------------------------------------- */
/*  Dialog                                                                     */
/* -------------------------------------------------------------------------- */

export interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: React.ReactNode
  footer?: React.ReactNode
  size?: 'sm' | 'default' | 'lg'
}

export const Dialog = ({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'default',
}: DialogProps) => {
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-navy-950/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative z-10 w-full animate-in-up rounded-lg border border-border bg-card shadow-panel',
          size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-3xl' : 'max-w-lg',
        )}
      >
        <div className="border-b border-border p-5">
          <h2 className="text-base font-bold text-navy-900">{title}</h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {children && <div className="max-h-[60vh] overflow-y-auto scroll-thin p-5">{children}</div>}
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-border p-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Tooltip-lite                                                               */
/* -------------------------------------------------------------------------- */

export const InfoHint = ({ text, className }: { text: string; className?: string }) => (
  <span
    title={text}
    className={cn(
      'inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-navy-200 text-[10px] font-bold text-navy-400',
      className,
    )}
  >
    ?
  </span>
)
