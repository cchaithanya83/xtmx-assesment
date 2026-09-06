import * as React from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Loader2, LogIn } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { isValidEmail } from '@/auth/crypto'
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

  const from = (location.state as { from?: string } | null)?.from

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const next: typeof errors = {}
    if (!isValidEmail(email)) next.email = 'Enter a valid email address'
    if (!password) next.password = 'Enter your password'
    setErrors(next)
    setFormError(null)
    if (Object.keys(next).length) return

    setBusy(true)
    const result = await signIn(email, password)
    setBusy(false)

    if (!result.ok || !result.account) {
      setFormError(result.message ?? 'Sign in failed.')
      return
    }

    // A temporary password issued by an admin must be replaced before the
    // account can be used for anything else.
    if (result.account.mustChangePassword) {
      navigate('/change-password', { replace: true, state: { forced: true } })
      return
    }

    if (result.account.role === 'candidate') {
      navigate(from && from.startsWith('/') && !from.startsWith('/trainer') ? from : '/dashboard', {
        replace: true,
      })
    } else {
      navigate('/trainer', { replace: true })
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
