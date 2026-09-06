import * as React from 'react'
import { Link } from 'react-router-dom'
import { Eye, EyeOff, Headphones, Keyboard, ShieldCheck, Target } from 'lucide-react'
import logoUrl from '@/assests/image.png'
import { ORG_NAME } from '@/data/settings'
import { TOTAL_ASSIGNMENTS } from '@/data/tasks'
import { useSettings } from '@/store/appStore'
import { assessPassword, type PasswordStrength } from '@/lib/roles'
import { Card, Input, Label } from '@/components/ui'
import { cn } from '@/lib/utils'

/**
 * Shared chrome for the sign-in / sign-up screens: brand panel on the left,
 * the form on the right. Keeps both pages visually identical so switching
 * between them feels like one flow.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  const settings = useSettings()

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
      {/* ---- Brand panel ---- */}
      <div className="hidden flex-col justify-between bg-navy-900 p-10 text-white lg:flex">
        <Link to="/signin" className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-lg bg-white">
            <img src={logoUrl} alt="" width={32} height={32} className="size-8 object-contain" />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-[15px] font-extrabold tracking-tight">XTransMatrix</span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-300">
              AI Operator Certification
            </span>
          </span>
        </Link>

        <div className="max-w-lg">
          <h2 className="text-3xl font-extrabold leading-tight tracking-tight">
            AI Operator Readiness &amp; Certification
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-navy-200">
            {ORG_NAME} evaluates every new AI Operator on keyboard speed, transcription accuracy,
            structured data entry, real-time listening, critical data capture, correction handling
            and multitasking before they take live work.
          </p>

          <div className="mt-8 space-y-3">
            <Feature
              icon={<Keyboard className="size-4" />}
              title="Task 1 · Typing Speed & Accuracy"
              body="Five progressive assignments, 40% of the final certification score."
            />
            <Feature
              icon={<Headphones className="size-4" />}
              title="Task 2 · AI Audio Listening & Multitasking"
              body="Five generated call scenarios, 60% of the final certification score."
            />
            <Feature
              icon={<Target className="size-4" />}
              title={`${TOTAL_ASSIGNMENTS} assignments, each individually passed`}
              body={`Minimum ${settings.passingScore}% score · ${settings.minWpm} WPM · ${settings.minAccuracy}% accuracy · ${settings.minCriticalAccuracy}% critical-data accuracy.`}
            />
          </div>
        </div>

        <p className="flex items-center gap-2 text-xs text-navy-300">
          <ShieldCheck className="size-3.5" />
          Assessment sessions are recorded for trainer review.
        </p>
      </div>

      {/* ---- Form panel ---- */}
      <div className="flex min-h-screen flex-col justify-center px-4 py-10 sm:px-8 lg:px-10">
        <div className="mx-auto w-full max-w-[420px]">
          <Link to="/signin" className="mb-6 flex items-center gap-2.5 lg:hidden">
            <img src={logoUrl} alt="" width={32} height={32} className="size-8 object-contain" />
            <span className="text-sm font-extrabold tracking-tight text-navy-900">
              XTransMatrix
            </span>
          </Link>

          <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">{title}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>

          <Card className="mt-6 p-6">{children}</Card>

          {footer && <div className="mt-4 text-center text-sm">{footer}</div>}
        </div>
      </div>
    </div>
  )
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-white/10 text-brand-200">
        {icon}
      </span>
      <span>
        <span className="block text-sm font-bold">{title}</span>
        <span className="block text-[13px] leading-relaxed text-navy-300">{body}</span>
      </span>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Shared form controls                                                       */
/* -------------------------------------------------------------------------- */

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error ? (
        <p className="text-[11px] font-medium text-red-600">{error}</p>
      ) : hint ? (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function PasswordInput({ className, ...props }, ref) {
  const [visible, setVisible] = React.useState(false)
  return (
    <div className="relative">
      <Input
        ref={ref}
        type={visible ? 'text' : 'password'}
        className={cn('pr-9', className)}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={visible ? 'Hide password' : 'Show password'}
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-navy-300 transition-colors hover:text-navy-600"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
})

const STRENGTH_TONE: Record<PasswordStrength['score'], string> = {
  0: 'bg-navy-200',
  1: 'bg-red-500',
  2: 'bg-amber-500',
  3: 'bg-brand-500',
  4: 'bg-emerald-600',
}

export function PasswordMeter({ password }: { password: string }) {
  if (!password) return null
  const strength = assessPassword(password)
  return (
    <div className="mt-2">
      <div className="flex items-center gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors',
              i < strength.score ? STRENGTH_TONE[strength.score] : 'bg-navy-100',
            )}
          />
        ))}
        <span className="w-14 shrink-0 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {strength.label}
        </span>
      </div>
      {strength.problems.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {strength.problems.map((p: string) => (
            <li key={p} className="text-[11px] text-amber-700">
              · {p}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p
      role="alert"
      className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-medium text-red-800"
    >
      {message}
    </p>
  )
}
