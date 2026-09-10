import * as React from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Loader2, LogIn } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { isValidEmail } from '@/lib/roles'
import { Button, Input } from '@/components/ui'
import { AuthLayout, Field, FormError, PasswordInput } from './AuthLayout'

/**
 * Sign in. The single entry point for every role — candidates, trainers and
 * administrators all authenticate here, and are routed to their portal by the
 * role on their account. There is no password-less path into the platform.
 */
export default function SignIn() {
  const navigate = useNavigate()
  const location = useLocation()
  const signIn = useAppStore((s) => s.signIn)

  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [errors, setErrors] = React.useState<{ email?: string; password?: string }>({})
  const [formError, setFormError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const state = location.state as { from?: string; expired?: boolean } | null
  const from = state?.from
  /** Set when the router bounced us here because the token was rejected. */
  const expired = Boolean(state?.expired)
  const clearSessionExpired = useAppStore((s) => s.clearSessionExpired)

  // Clear the flag once shown, so it does not reappear on a later visit.
  React.useEffect(() => {
    if (expired) clearSessionExpired()
  }, [expired, clearSessionExpired])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const next: typeof errors = {}
    if (!isValidEmail(email)) next.email = 'Enter a valid email address'
    if (!password) next.password = 'Enter your password'
    setErrors(next)
    setFormError(null)
    if (Object.keys(next).length) return

    setBusy(true)
    try {
      const profile = await signIn(email, password)

      // A temporary password issued by an admin must be replaced before the
      // account can be used for anything else.
      if (profile.mustChangePassword) {
        navigate('/change-password', { replace: true, state: { forced: true } })
        return
      }

      if (profile.role === 'candidate') {
        navigate(
          from && from.startsWith('/') && !from.startsWith('/trainer') ? from : '/dashboard',
          { replace: true },
        )
      } else {
        navigate('/trainer', { replace: true })
      }
    } catch (err) {
      setFormError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Use the account issued to you by your trainer, or the one you created at sign-up."
      footer={
        <p className="text-muted-foreground">
          New candidate?{' '}
          <Link to="/signup" className="font-semibold text-brand-700 hover:underline">
            Create your account
          </Link>
        </p>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {expired && !formError && (
          <p
            role="status"
            className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900"
          >
            <strong className="font-semibold">Your session ended.</strong> This happens when a
            session expires, a password is changed, or an administrator disables an account. Sign in
            again to continue.
          </p>
        )}

        <FormError message={formError} />

        <Field label="Email address" error={errors.email}>
          <Input
            type="email"
            value={email}
            autoComplete="username"
            autoFocus
            placeholder="name@xtransmatrix.com"
            onChange={(e) => {
              setEmail(e.target.value)
              setErrors((x) => ({ ...x, email: undefined }))
            }}
          />
        </Field>

        <Field label="Password" error={errors.password}>
          <PasswordInput
            value={password}
            autoComplete="current-password"
            placeholder="Your password"
            onChange={(e) => {
              setPassword(e.target.value)
              setErrors((x) => ({ ...x, password: undefined }))
            }}
          />
        </Field>

        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
          Sign in
        </Button>

        <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
          Trainer and administrator accounts are created by an administrator. If you need access or
          a password reset, contact your training administrator.
        </p>
      </form>
    </AuthLayout>
  )
}
