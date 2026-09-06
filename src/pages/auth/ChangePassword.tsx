import * as React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { KeyRound, Loader2 } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { assessPassword, MIN_PASSWORD_LENGTH } from '@/auth/crypto'
import { Button } from '@/components/ui'
import { AuthLayout, Field, FormError, PasswordInput, PasswordMeter } from './AuthLayout'

/**
 * Password change.
 *
 * Reached voluntarily from the header menu, or forced after signing in with an
 * administrator-issued temporary password (`mustChangePassword`).
 */
export default function ChangePassword() {
  const navigate = useNavigate()
  const location = useLocation()
  const account = useAppStore((s) => s.getCurrentAccount())
  const changeOwnPassword = useAppStore((s) => s.changeOwnPassword)
  const signOut = useAppStore((s) => s.signOut)

  const forced = Boolean((location.state as { forced?: boolean } | null)?.forced)

  const [current, setCurrent] = React.useState('')
  const [next, setNext] = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [formError, setFormError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [done, setDone] = React.useState(false)

  React.useEffect(() => {
    if (!account) navigate('/signin', { replace: true })
  }, [account, navigate])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const problems: Record<string, string> = {}
    if (!current) problems.current = 'Enter your current password'

    const strength = assessPassword(next)
    if (!strength.acceptable) {
      problems.next = strength.problems[0] ?? `Use at least ${MIN_PASSWORD_LENGTH} characters`
    }
    if (next === current && next) problems.next = 'Choose a password you have not used before'
    if (next !== confirm) problems.confirm = 'Passwords do not match'

    setErrors(problems)
    setFormError(null)
    if (Object.keys(problems).length) return

    setBusy(true)
    const result = await changeOwnPassword(current, next)
    setBusy(false)

    if (!result.ok) {
      setFormError(result.message ?? 'Could not change your password.')
      return
    }

    setDone(true)
    window.setTimeout(
      () => navigate(account?.role === 'candidate' ? '/dashboard' : '/trainer', { replace: true }),
      900,
    )
  }

  if (!account) return null

  return (
    <AuthLayout
      title={forced ? 'Set a new password' : 'Change your password'}
      subtitle={
        forced
          ? 'Your account was created with a temporary password. Choose a new one to continue.'
          : `Signed in as ${account.email}.`
      }
      footer={
        forced ? (
          <button
            onClick={() => {
              signOut()
              navigate('/signin', { replace: true })
            }}
            className="text-muted-foreground hover:underline"
          >
            Sign out instead
          </button>
        ) : (
          <button
            onClick={() => navigate(-1)}
            className="text-muted-foreground hover:underline"
          >
            Cancel
          </button>
        )
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={formError} />

        {done && (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] font-medium text-emerald-800">
            Password updated. Redirecting…
          </p>
        )}

        <Field label={forced ? 'Temporary password' : 'Current password'} error={errors.current}>
          <PasswordInput
            value={current}
            autoComplete="current-password"
            autoFocus
            onChange={(e) => {
              setCurrent(e.target.value)
              setErrors((x) => ({ ...x, current: '' }))
            }}
          />
        </Field>

        <div>
          <Field
            label="New password"
            error={errors.next}
            hint={`At least ${MIN_PASSWORD_LENGTH} characters, including a letter and a number.`}
          >
            <PasswordInput
              value={next}
              autoComplete="new-password"
              onChange={(e) => {
                setNext(e.target.value)
                setErrors((x) => ({ ...x, next: '' }))
              }}
            />
          </Field>
          <PasswordMeter password={next} />
        </div>

        <Field label="Confirm new password" error={errors.confirm}>
          <PasswordInput
            value={confirm}
            autoComplete="new-password"
            onChange={(e) => {
              setConfirm(e.target.value)
              setErrors((x) => ({ ...x, confirm: '' }))
            }}
          />
        </Field>

        <Button type="submit" size="lg" className="w-full" disabled={busy || done}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
          Update password
        </Button>
      </form>
    </AuthLayout>
  )
}
