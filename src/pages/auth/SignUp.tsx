import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2, UserPlus } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { BATCHES, LOCATIONS } from '@/data/pools'
import { auth } from '@/api/client'
import { assessPassword, isValidEmail, MIN_PASSWORD_LENGTH } from '@/lib/roles'
import { Button, Input, Select } from '@/components/ui'
import { AuthLayout, Field, FormError, PasswordInput, PasswordMeter } from './AuthLayout'

/**
 * Candidate self-registration.
 *
 * This is the only self-service sign-up path in the platform — trainer and
 * administrator accounts are created by an administrator from the User
 * Management screen, never here.
 */
export default function SignUp() {
  const navigate = useNavigate()
  const register = useAppStore((s) => s.register)

  const [form, setForm] = React.useState({
    fullName: '',
    candidateId: '',
    email: '',
    password: '',
    confirmPassword: '',
    batch: BATCHES[0],
    location: LOCATIONS[0],
    // Free text shown when location is "Other".
    otherLocation: '',
    trainerName: '',
  })
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [formError, setFormError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  // Trainers come from the server so the list reflects who actually exists,
  // rather than a hardcoded set that drifts as staff join and leave.
  const [trainers, setTrainers] = React.useState<string[]>([])
  const [trainersLoaded, setTrainersLoaded] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    auth
      .trainers()
      .then((res) => {
        if (cancelled) return
        setTrainers(res.trainers)
        // Preselect the only trainer, but never guess when there are several.
        if (res.trainers.length === 1) {
          setForm((f) => ({ ...f, trainerName: res.trainers[0] }))
        }
      })
      .catch(() => {
        // Registration must not depend on this lookup succeeding.
        if (!cancelled) setTrainers([])
      })
      .finally(() => {
        if (!cancelled) setTrainersLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const set = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: '' }))
    setFormError(null)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!form.fullName.trim()) next.fullName = 'Full name is required'
    if (!form.candidateId.trim()) next.candidateId = 'Candidate ID is required'
    if (!isValidEmail(form.email)) next.email = 'Enter a valid email address'

    const strength = assessPassword(form.password)
    if (!strength.acceptable) {
      next.password = strength.problems[0] ?? `Use at least ${MIN_PASSWORD_LENGTH} characters`
    }
    if (form.password !== form.confirmPassword) {
      next.confirmPassword = 'Passwords do not match'
    }

    if (form.location === 'Other' && !form.otherLocation.trim()) {
      next.otherLocation = 'Enter your location'
    }
    // Only enforced when there is actually a list to choose from — a fresh
    // deployment with no staff yet must still accept registrations.
    if (trainers.length > 0 && !form.trainerName.trim()) {
      next.trainerName = 'Select your trainer'
    }

    setErrors(next)
    if (Object.keys(next).length) return

    setBusy(true)
    try {
      await register({
        fullName: form.fullName,
        candidateId: form.candidateId,
        email: form.email,
        password: form.password,
        batch: form.batch,
        location:
          form.location === 'Other' ? form.otherLocation.trim() : form.location,
        trainerName: form.trainerName.trim(),
      })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      // Map the failure back onto the offending field where the server told us.
      const code = (err as { code?: string }).code
      const message = (err as Error).message
      if (code === 'email-taken') setErrors({ email: message })
      else if (code === 'candidate-id-taken') setErrors({ candidateId: message })
      else setFormError(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Create your candidate account"
      subtitle="Register once, then sign in with your email and password for every session."
      footer={
        <p className="text-muted-foreground">
          Already registered?{' '}
          <Link to="/signin" className="font-semibold text-brand-700 hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={formError} />

        <Field label="Candidate full name" error={errors.fullName}>
          <Input
            value={form.fullName}
            autoComplete="name"
            placeholder="e.g. Akhilesh Rao"
            onChange={(e) => set('fullName', e.target.value)}
          />
        </Field>

        <Field label="Employee / Candidate ID" error={errors.candidateId}>
          <Input
            value={form.candidateId}
            placeholder="e.g. XTMX-4182"
            className="font-mono uppercase"
            onChange={(e) => set('candidateId', e.target.value)}
          />
        </Field>

        <Field label="Email address" error={errors.email}>
          <Input
            type="email"
            value={form.email}
            autoComplete="email"
            placeholder="name@xtransmatrix.com"
            onChange={(e) => set('email', e.target.value)}
          />
        </Field>

        <div>
          <Field
            label="Password"
            error={errors.password}
            hint={`At least ${MIN_PASSWORD_LENGTH} characters, including a letter and a number.`}
          >
            <PasswordInput
              value={form.password}
              autoComplete="new-password"
              placeholder="Choose a password"
              onChange={(e) => set('password', e.target.value)}
            />
          </Field>
          <PasswordMeter password={form.password} />
        </div>

        <Field label="Confirm password" error={errors.confirmPassword}>
          <PasswordInput
            value={form.confirmPassword}
            autoComplete="new-password"
            placeholder="Re-enter your password"
            onChange={(e) => set('confirmPassword', e.target.value)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Batch / cohort">
            <Select value={form.batch} onChange={(e) => set('batch', e.target.value)}>
              {BATCHES.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </Select>
          </Field>
          <Field label="Location">
            <Select value={form.location} onChange={(e) => set('location', e.target.value)}>
              {LOCATIONS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </Select>
          </Field>
        </div>

        {form.location === 'Other' && (
          <Field label="Specify your location" error={errors.otherLocation}>
            <Input
              value={form.otherLocation}
              placeholder="e.g. Coimbatore"
              autoFocus
              onChange={(e) => set('otherLocation', e.target.value)}
            />
          </Field>
        )}

        <Field
          label="Trainer"
          error={errors.trainerName}
          hint={
            trainersLoaded && trainers.length === 0
              ? 'No trainers are registered yet — you can type a name or leave this blank.'
              : undefined
          }
        >
          {trainersLoaded && trainers.length === 0 ? (
            // Nothing to choose from on a fresh deployment; accept free text so
            // registration is never blocked by an empty staff list.
            <Input
              value={form.trainerName}
              placeholder="Trainer name (optional)"
              onChange={(e) => set('trainerName', e.target.value)}
            />
          ) : (
            <Select
              value={form.trainerName}
              disabled={!trainersLoaded}
              onChange={(e) => set('trainerName', e.target.value)}
            >
              <option value="">
                {trainersLoaded ? 'Select your trainer…' : 'Loading trainers…'}
              </option>
              {trainers.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
          Create account &amp; start assessment
        </Button>
      </form>
    </AuthLayout>
  )
}
