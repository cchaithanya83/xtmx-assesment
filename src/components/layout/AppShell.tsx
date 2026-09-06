import * as React from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Activity,
  Award,
  BarChart3,
  ChevronDown,
  ChevronLeft,
  Database,
  Gauge,
  Headphones,
  History,
  KeyRound,
  Keyboard,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  UserCog,
  X,
} from 'lucide-react'
import logoUrl from '@/assests/image.png'
import { useAppStore, useCurrentCandidate } from '@/store/appStore'
import { ROLE_LABEL } from '@/lib/roles'
import { ORG_SHORT } from '@/data/settings'
import { Avatar } from '@/components/shared'
import { Badge } from '@/components/ui'
import { cn } from '@/lib/utils'

/* -------------------------------------------------------------------------- */
/*  Brand                                                                      */
/* -------------------------------------------------------------------------- */

export function BrandMark({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <img
        src={logoUrl}
        alt=""
        width={32}
        height={32}
        className="size-8 shrink-0 rounded-md object-contain"
      />
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="text-sm font-extrabold tracking-tight text-navy-900">{ORG_SHORT}</span>
          <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-widest text-brand-700">
            AI Operator Certification
          </span>
        </span>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Navigation model                                                           */
/* -------------------------------------------------------------------------- */

interface NavItem {
  to: string
  label: string
  icon: React.ReactNode
  end?: boolean
}

const CANDIDATE_NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="size-4" />, end: true },
  { to: '/task/1', label: 'Task 1 · Typing', icon: <Keyboard className="size-4" /> },
  { to: '/task/2', label: 'Task 2 · Listening', icon: <Headphones className="size-4" /> },
  { to: '/history', label: 'Attempt History', icon: <History className="size-4" /> },
  { to: '/results', label: 'Final Results', icon: <BarChart3 className="size-4" /> },
  { to: '/certificate', label: 'Certificate', icon: <Award className="size-4" /> },
]

const TRAINER_NAV: NavItem[] = [
  { to: '/trainer', label: 'Overview', icon: <LayoutDashboard className="size-4" />, end: true },
  { to: '/trainer/live', label: 'Live Monitoring', icon: <Activity className="size-4" /> },
  { to: '/trainer/results', label: 'Results & Export', icon: <BarChart3 className="size-4" /> },
  { to: '/trainer/settings', label: 'Configuration', icon: <Settings className="size-4" /> },
]

/** Admin-only nav, appended to TRAINER_NAV when the account is an admin. */
const ADMIN_NAV: NavItem[] = [
  { to: '/trainer/users', label: 'User Management', icon: <UserCog className="size-4" /> },
]

/* -------------------------------------------------------------------------- */
/*  Shell                                                                      */
/* -------------------------------------------------------------------------- */

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const [menuOpen, setMenuOpen] = React.useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const account = useAppStore((s) => s.profile)
  const signOut = useAppStore((s) => s.signOut)
  const candidate = useCurrentCandidate()
  const storeError = useAppStore((s) => s.error)

  const isStaff = account?.role === 'trainer' || account?.role === 'admin'
  const nav = isStaff
    ? account?.role === 'admin'
      ? [...TRAINER_NAV, ...ADMIN_NAV]
      : TRAINER_NAV
    : CANDIDATE_NAV

  React.useEffect(() => {
    setMobileOpen(false)
    setMenuOpen(false)
  }, [location.pathname])

  const handleSignOut = async () => {
    await signOut()
    navigate('/signin', { replace: true })
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* ---- Sidebar ---- */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-border bg-card transition-transform lg:static lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <Link to={isStaff ? '/trainer' : '/dashboard'}>
            <BrandMark />
          </Link>
          <button
            className="lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto scroll-thin p-3">
          <p className="px-2 pb-1.5 pt-2 text-[10px] font-bold uppercase tracking-widest text-navy-300">
            {isStaff ? 'Trainer / Admin Portal' : 'Assessment'}
          </p>
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-navy-900 text-white'
                    : 'text-navy-700 hover:bg-muted hover:text-navy-900',
                )
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-border p-3">
          <div className="flex items-center gap-1.5 px-1 text-[10px] text-muted-foreground">
            <Database className="size-3" />
            <span className="truncate">Secure API · Supabase</span>
          </div>
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-navy-950/30 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      {/* ---- Main ---- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-border bg-card/90 px-4 backdrop-blur-sm sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="size-5 text-navy-700" />
            </button>
            {isStaff ? (
              <Badge variant="accent">
                <ShieldCheck className="size-3" />
                {account ? ROLE_LABEL[account.role] : 'Trainer'}
              </Badge>
            ) : (
              candidate && (
                <div className="hidden min-w-0 items-center gap-2 sm:flex">
                  <Gauge className="size-4 text-brand-700" />
                  <p className="truncate font-mono text-[11px] text-muted-foreground">
                    {candidate.candidateId} · {candidate.batch}
                  </p>
                </div>
              )
            )}
          </div>

          <div className="flex items-center gap-2">
            {storeError && (
              <Badge variant="warning" title={storeError}>
                Connection issue
              </Badge>
            )}

            {/* ---- Account menu ---- */}
            {account && (
              <div className="relative">
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  className="flex items-center gap-2 rounded-md py-1 pl-1 pr-2 transition-colors hover:bg-muted"
                >
                  <Avatar name={account.name} className="size-7" />
                  <span className="hidden min-w-0 text-left leading-tight sm:block">
                    <span className="block truncate text-[13px] font-semibold text-navy-900">
                      {account.name}
                    </span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {account.email}
                    </span>
                  </span>
                  <ChevronDown className="size-3.5 shrink-0 text-navy-400" />
                </button>

                {menuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setMenuOpen(false)}
                      aria-hidden
                    />
                    <div
                      role="menu"
                      className="absolute right-0 z-20 mt-1.5 w-60 animate-in-up overflow-hidden rounded-lg border border-border bg-card shadow-panel"
                    >
                      <div className="border-b border-border px-3 py-2.5">
                        <p className="truncate text-[13px] font-semibold text-navy-900">
                          {account.name}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {account.email}
                        </p>
                        <Badge variant="muted" className="mt-1.5">
                          {ROLE_LABEL[account.role]}
                        </Badge>
                      </div>
                      <button
                        role="menuitem"
                        onClick={() => navigate('/change-password')}
                        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-medium text-navy-800 transition-colors hover:bg-muted"
                      >
                        <KeyRound className="size-4 text-navy-400" />
                        Change password
                      </button>
                      <button
                        role="menuitem"
                        onClick={() => void handleSignOut()}
                        className="flex w-full items-center gap-2.5 border-t border-border px-3 py-2.5 text-left text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
                      >
                        <LogOut className="size-4" />
                        Sign out
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Focused assessment layout — chrome removed to minimise distraction         */
/* -------------------------------------------------------------------------- */

export function AssessmentShell({
  children,
  onExit,
  header,
}: {
  children: React.ReactNode
  onExit: () => void
  header: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-4 py-2.5 sm:px-6">
          <button
            onClick={onExit}
            className="flex shrink-0 items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-navy-900"
          >
            <ChevronLeft className="size-4" />
            <span className="hidden sm:inline">Exit</span>
          </button>
          <div className="h-6 w-px shrink-0 bg-border" />
          {header}
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-5 sm:px-6">{children}</main>
    </div>
  )
}

/**
 * Desktop-first notice. The assessment itself needs a physical keyboard, so we
 * warn rather than block — a trainer may still want to demo on a tablet.
 */
export function DesktopRecommendedNotice() {
  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 xl:hidden">
      <Keyboard className="mt-0.5 size-4 shrink-0" />
      <p>
        <strong className="font-semibold">Desktop recommended.</strong> This assessment measures
        typing speed on a physical keyboard. Scores recorded on a touch keyboard are not
        representative and may not meet certification standards.
      </p>
    </div>
  )
}
