import * as React from 'react'
import {
  Ban,
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'
import type { Account, AccountRole } from '@/types'
import { useAppStore } from '@/store/appStore'
import { ROLE_LABEL } from '@/auth/accounts'
import { assessPassword, generateTempPassword, isValidEmail, MIN_PASSWORD_LENGTH } from '@/auth/crypto'
import { Avatar, EmptyState, MetricCard, PageHeader } from '@/components/shared'
import { Badge, Button, Card, Dialog, Input, Label, Select, Tabs } from '@/components/ui'
import { cn, formatDateTime, relativeTime } from '@/lib/utils'

/**
 * Admin-only user management.
 *
 * Trainer and administrator accounts exist only because an admin created them
 * here — there is no self-service route to a staff role. Candidate accounts are
 * self-registered and appear read-only apart from status, password reset and
 * removal.
 */
export default function UserManagement() {
  const account = useAppStore((s) => s.getCurrentAccount())
  const accounts = useAppStore((s) => s.accounts)
  const candidates = useAppStore((s) => s.candidates)
  const addStaffAccount = useAppStore((s) => s.addStaffAccount)
  const updateAccount = useAppStore((s) => s.updateAccount)
  const setAccountPassword = useAppStore((s) => s.setAccountPassword)
  const setAccountStatus = useAppStore((s) => s.setAccountStatus)
  const deleteAccount = useAppStore((s) => s.deleteAccount)

  const [tab, setTab] = React.useState<'staff' | 'candidates'>('staff')
  const [query, setQuery] = React.useState('')
  const [addOpen, setAddOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Account | null>(null)
  const [resetting, setResetting] = React.useState<Account | null>(null)
  const [removing, setRemoving] = React.useState<Account | null>(null)
  const [banner, setBanner] = React.useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const isAdmin = account?.role === 'admin'

  const staff = accounts.filter((a) => a.role !== 'candidate')
  const candidateAccounts = accounts.filter((a) => a.role === 'candidate')

  const visible = (tab === 'staff' ? staff : candidateAccounts).filter((a) => {
    const q = query.trim().toLowerCase()
    return !q || a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q)
  })

  const flash = (tone: 'ok' | 'error', text: string) => {
    setBanner({ tone, text })
    window.setTimeout(() => setBanner(null), 4000)
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="User Management" description="Administrator access is required." />
        <EmptyState
          icon={<ShieldCheck className="size-8" />}
          title="Administrator access required"
          description="Only an administrator can create or manage trainer and candidate accounts. Ask your platform administrator for access."
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        eyebrow="Trainer / Admin portal"
        title="User Management"
        description="Create and manage trainer and administrator logins. Candidate accounts are self-registered."
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <UserPlus className="size-4" />
            Add staff account
          </Button>
        }
      />

      {banner && (
        <p
          className={cn(
            'mb-4 rounded-md border px-3 py-2 text-[13px] font-medium',
            banner.tone === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-800',
          )}
        >
          {banner.text}
        </p>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Total accounts" value={accounts.length} icon={<Users className="size-3.5" />} />
        <MetricCard
          label="Administrators"
          value={staff.filter((a) => a.role === 'admin').length}
          icon={<ShieldCheck className="size-3.5" />}
        />
        <MetricCard label="Trainers" value={staff.filter((a) => a.role === 'trainer').length} />
        <MetricCard label="Candidate logins" value={candidateAccounts.length} />
      </div>

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <Tabs
          value={tab}
          onChange={(v) => setTab(v as typeof tab)}
          items={[
            { value: 'staff', label: 'Trainers & admins', count: staff.length },
            { value: 'candidates', label: 'Candidate accounts', count: candidateAccounts.length },
          ]}
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or email…"
          className="sm:w-64"
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title="No accounts match"
          description={
            tab === 'staff'
              ? 'Create a trainer or administrator account to get started.'
              : 'Candidates appear here once they register from the sign-up page.'
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-grid min-w-[900px]">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  {tab === 'candidates' && <th>Candidate ID</th>}
                  <th>Status</th>
                  <th>Last sign-in</th>
                  <th>Created</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((a) => {
                  const linked = candidates.find((c) => c.id === a.candidateId)
                  const isSelf = a.id === account.id
                  return (
                    <tr key={a.id}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={a.name} />
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 truncate text-[13px] font-semibold text-navy-900">
                              {a.name}
                              {isSelf && <Badge variant="muted">You</Badge>}
                            </p>
                            <p className="truncate text-[11px] text-muted-foreground">{a.email}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Badge variant={a.role === 'admin' ? 'accent' : 'default'}>
                          {ROLE_LABEL[a.role]}
                        </Badge>
                      </td>
                      {tab === 'candidates' && (
                        <td className="font-mono text-[12px] text-navy-700">
                          {linked?.candidateId ?? '—'}
                        </td>
                      )}
                      <td>
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge variant={a.status === 'active' ? 'success' : 'danger'}>
                            {a.status === 'active' ? 'Active' : 'Disabled'}
                          </Badge>
                          {a.mustChangePassword && (
                            <Badge variant="warning">Password reset pending</Badge>
                          )}
                        </div>
                      </td>
                      <td className="text-[12px] text-muted-foreground">
                        {a.lastLoginAt ? relativeTime(a.lastLoginAt) : 'Never'}
                      </td>
                      <td className="text-[12px] text-muted-foreground">
                        {formatDateTime(a.createdAt)}
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          {a.role !== 'candidate' && (
                            <Button variant="ghost" size="sm" onClick={() => setEditing(a)}>
                              <Pencil className="size-3.5" />
                              Edit
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => setResetting(a)}>
                            <KeyRound className="size-3.5" />
                            Reset
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isSelf}
                            onClick={() => {
                              const r = setAccountStatus(
                                a.id,
                                a.status === 'active' ? 'disabled' : 'active',
                              )
                              flash(
                                r.ok ? 'ok' : 'error',
                                r.ok
                                  ? `${a.name} ${a.status === 'active' ? 'disabled' : 're-enabled'}.`
                                  : (r.message ?? 'Action failed.'),
                              )
                            }}
                          >
                            {a.status === 'active' ? (
                              <>
                                <Ban className="size-3.5" />
                                Disable
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="size-3.5" />
                                Enable
                              </>
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isSelf}
                            className="text-red-700 hover:bg-red-50 hover:text-red-800"
                            onClick={() => setRemoving(a)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <p className="mt-4 rounded-md border border-border bg-muted/40 px-4 py-3 text-[13px] leading-relaxed text-navy-700">
        <strong className="font-semibold">Password handling.</strong> Passwords are stored as
        PBKDF2-SHA256 hashes with a per-account salt — never in plaintext, and never recoverable.
        Resetting issues a temporary password that the account holder must replace on their next
        sign-in.
      </p>

      <AddStaffDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreate={async (input) => {
          const r = await addStaffAccount(input)
          if (r.ok) {
            setAddOpen(false)
            flash('ok', `${input.name} can now sign in with the temporary password you set.`)
          }
          return r
        }}
      />

      <EditStaffDialog
        account={editing}
        onClose={() => setEditing(null)}
        onSave={(id, patch) => {
          const r = updateAccount(id, patch)
          if (r.ok) {
            setEditing(null)
            flash('ok', 'Account updated.')
          }
          return r
        }}
      />

      <ResetPasswordDialog
        account={resetting}
        onClose={() => setResetting(null)}
        onReset={async (id, password) => {
          const r = await setAccountPassword(id, password)
          if (r.ok) flash('ok', 'Temporary password set. The user must change it at next sign-in.')
          return r
        }}
      />

      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.name ?? ''}?`}
        description="This permanently deletes the login. Any assessment history stays attached to the candidate record and remains visible to trainers."
        footer={
          <>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!removing) return
                const r = deleteAccount(removing.id)
                flash(r.ok ? 'ok' : 'error', r.ok ? 'Account removed.' : (r.message ?? 'Failed.'))
                setRemoving(null)
              }}
            >
              Remove account
            </Button>
          </>
        }
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Add staff                                                                  */
/* -------------------------------------------------------------------------- */

function AddStaffDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean
  onClose: () => void
  onCreate: (input: {
    name: string
    email: string
    password: string
    role: Exclude<AccountRole, 'candidate'>
  }) => Promise<{ ok: boolean; message?: string }>
}) {
  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [role, setRole] = React.useState<'trainer' | 'admin'>('trainer')
  const [password, setPassword] = React.useState(generateTempPassword)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setName('')
      setEmail('')
      setRole('trainer')
      setPassword(generateTempPassword())
      setError(null)
      setCopied(false)
    }
  }, [open])

  const submit = async () => {
    if (!name.trim()) return setError('Name is required')
    if (!isValidEmail(email)) return setError('Enter a valid email address')
    if (!assessPassword(password).acceptable) {
      return setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters with a letter and a number`)
    }
    setBusy(true)
    const r = await onCreate({ name, email, password, role })
    setBusy(false)
    if (!r.ok) setError(r.message ?? 'Could not create the account.')
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add trainer or administrator"
      description="Staff accounts can only be created here. Share the temporary password securely — the user must change it at first sign-in."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
            Create account
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-medium text-red-800">
            {error}
          </p>
        )}

        <div className="space-y-1.5">
          <Label>Full name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sanjana Iyer" />
        </div>

        <div className="space-y-1.5">
          <Label>Email address</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@xtransmatrix.com"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Role</Label>
          <Select value={role} onChange={(e) => setRole(e.target.value as 'trainer' | 'admin')}>
            <option value="trainer">Trainer — dashboards, candidates, configuration</option>
            <option value="admin">Administrator — everything, plus user management</option>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Temporary password</Label>
          <div className="flex gap-2">
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="font-mono"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              title="Generate a new password"
              onClick={() => {
                setPassword(generateTempPassword())
                setCopied(false)
              }}
            >
              <RefreshCw className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              title="Copy to clipboard"
              onClick={() => {
                void navigator.clipboard?.writeText(password).then(() => setCopied(true))
              }}
            >
              <Copy className="size-4" />
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {copied ? 'Copied to clipboard.' : 'The user will be required to change this at first sign-in.'}
          </p>
        </div>
      </div>
    </Dialog>
  )
}

/* -------------------------------------------------------------------------- */
/*  Edit staff                                                                 */
/* -------------------------------------------------------------------------- */

function EditStaffDialog({
  account,
  onClose,
  onSave,
}: {
  account: Account | null
  onClose: () => void
  onSave: (
    id: string,
    patch: Partial<Pick<Account, 'name' | 'email' | 'role'>>,
  ) => { ok: boolean; message?: string }
}) {
  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [role, setRole] = React.useState<AccountRole>('trainer')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (account) {
      setName(account.name)
      setEmail(account.email)
      setRole(account.role)
      setError(null)
    }
  }, [account])

  if (!account) return null

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Edit ${account.name}`}
      description="Changes take effect immediately. The user keeps their existing password."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (!name.trim()) return setError('Name is required')
              if (!isValidEmail(email)) return setError('Enter a valid email address')
              const r = onSave(account.id, {
                name,
                email,
                role: role as Exclude<AccountRole, 'candidate'>,
              })
              if (!r.ok) setError(r.message ?? 'Could not update the account.')
            }}
          >
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-medium text-red-800">
            {error}
          </p>
        )}
        <div className="space-y-1.5">
          <Label>Full name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Email address</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Role</Label>
          <Select value={role} onChange={(e) => setRole(e.target.value as AccountRole)}>
            <option value="trainer">Trainer</option>
            <option value="admin">Administrator</option>
          </Select>
        </div>
      </div>
    </Dialog>
  )
}

/* -------------------------------------------------------------------------- */
/*  Reset password                                                             */
/* -------------------------------------------------------------------------- */

function ResetPasswordDialog({
  account,
  onClose,
  onReset,
}: {
  account: Account | null
  onClose: () => void
  onReset: (id: string, password: string) => Promise<{ ok: boolean; message?: string }>
}) {
  const [password, setPassword] = React.useState(generateTempPassword)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [issued, setIssued] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (account) {
      setPassword(generateTempPassword())
      setError(null)
      setIssued(null)
    }
  }, [account])

  if (!account) return null

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Reset password for ${account.name}`}
      description="The current password is replaced immediately and cannot be recovered."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {issued ? 'Done' : 'Cancel'}
          </Button>
          {!issued && (
            <Button
              onClick={async () => {
                if (!assessPassword(password).acceptable) {
                  return setError(
                    `Password must be at least ${MIN_PASSWORD_LENGTH} characters with a letter and a number`,
                  )
                }
                setBusy(true)
                const r = await onReset(account.id, password)
                setBusy(false)
                if (r.ok) setIssued(password)
                else setError(r.message ?? 'Could not reset the password.')
              }}
              disabled={busy}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
              Set temporary password
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-medium text-red-800">
            {error}
          </p>
        )}

        {issued ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3">
            <p className="text-[13px] font-semibold text-emerald-900">Temporary password issued</p>
            <p className="mt-2 rounded border border-emerald-200 bg-white px-3 py-2 font-mono text-sm text-navy-900">
              {issued}
            </p>
            <p className="mt-2 text-[11px] text-emerald-800">
              Share this securely with {account.name}. They must change it at their next sign-in.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label>Temporary password</Label>
            <div className="flex gap-2">
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="font-mono"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setPassword(generateTempPassword())}
              >
                <RefreshCw className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}
