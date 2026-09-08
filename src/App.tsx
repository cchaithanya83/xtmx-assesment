import * as React from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import logoUrl from '@/assests/image.png'
import { useAppStore } from '@/store/appStore'
import { AppShell } from '@/components/layout/AppShell'

/* Eager: the candidate's critical path — auth, dashboard and the two
   assessment runners must never wait on a chunk fetch mid-session. */
import SignIn from '@/pages/auth/SignIn'
import SignUp from '@/pages/auth/SignUp'
import ChangePassword from '@/pages/auth/ChangePassword'
import CandidateDashboard from '@/pages/CandidateDashboard'
import TaskOverview from '@/pages/TaskOverview'
import Task1Runner from '@/pages/Task1Runner'
import Task2Runner from '@/pages/Task2Runner'
import ResultScreen from '@/pages/ResultScreen'

/* Lazy: analytics, certificate and the whole trainer/admin portal. These pull
   in Recharts and (for the certificate) jsPDF, which no candidate needs loaded
   before they finish an assignment. */
const AttemptHistory = React.lazy(() => import('@/pages/AttemptHistory'))
const FinalResults = React.lazy(() => import('@/pages/FinalResults'))
const CertificatePage = React.lazy(() => import('@/pages/CertificatePage'))
const TrainerDashboard = React.lazy(() => import('@/pages/trainer/TrainerDashboard'))
const TrainerLive = React.lazy(() => import('@/pages/trainer/TrainerLive'))
const TrainerResults = React.lazy(() => import('@/pages/trainer/TrainerResults'))
const TrainerCandidateDetail = React.lazy(
  () => import('@/pages/trainer/TrainerCandidateDetail'),
)
const TrainerSettingsPage = React.lazy(() => import('@/pages/trainer/TrainerSettings'))
const UserManagement = React.lazy(() => import('@/pages/trainer/UserManagement'))
const ContentManager = React.lazy(() => import('@/pages/trainer/ContentManager'))

/**
 * Route map.
 *
 * Every route except sign-in and sign-up requires an authenticated account, and
 * the trainer portal additionally requires a staff role — both enforced here
 * rather than only in the UI, so a hand-typed URL cannot cross a role boundary.
 *
 * Assessment runners deliberately live *outside* `AppShell`: during an attempt
 * the navigation chrome is removed to minimise distraction and to make leaving
 * the screen a deliberate act (which is also logged for integrity review).
 */
export default function App() {
  const bootstrap = useAppStore((s) => s.bootstrap)
  const booting = useAppStore((s) => s.booting)

  React.useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  if (booting) return <BootScreen />

  return (
    <React.Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* ---- Public ---- */}
        <Route
          path="/signin"
          element={
            <RedirectIfSignedIn>
              <SignIn />
            </RedirectIfSignedIn>
          }
        />
        <Route
          path="/signup"
          element={
            <RedirectIfSignedIn>
              <SignUp />
            </RedirectIfSignedIn>
          }
        />
        <Route path="/change-password" element={<ChangePassword />} />

        {/* ---- Assessment runners (chrome-free) ---- */}
        <Route
          path="/assessment/1/:assignmentId"
          element={
            <RequireCandidate>
              <Task1Runner />
            </RequireCandidate>
          }
        />
        <Route
          path="/assessment/2/:assignmentId"
          element={
            <RequireCandidate>
              <Task2Runner />
            </RequireCandidate>
          }
        />

        {/* ---- Candidate portal ---- */}
        <Route
          path="/dashboard"
          element={
            <RequireCandidate>
              <AppShell>
                <CandidateDashboard />
              </AppShell>
            </RequireCandidate>
          }
        />
        <Route
          path="/task/:taskId"
          element={
            <RequireCandidate>
              <AppShell>
                <TaskOverview />
              </AppShell>
            </RequireCandidate>
          }
        />
        <Route
          path="/result"
          element={
            <RequireCandidate>
              <AppShell>
                <ResultScreen />
              </AppShell>
            </RequireCandidate>
          }
        />
        <Route
          path="/history"
          element={
            <RequireCandidate>
              <AppShell>
                <AttemptHistory />
              </AppShell>
            </RequireCandidate>
          }
        />
        <Route
          path="/results"
          element={
            <RequireCandidate>
              <AppShell>
                <FinalResults />
              </AppShell>
            </RequireCandidate>
          }
        />
        <Route
          path="/certificate"
          element={
            <RequireCandidate>
              <AppShell>
                <CertificatePage />
              </AppShell>
            </RequireCandidate>
          }
        />

        {/* ---- Trainer / Admin portal ---- */}
        <Route
          path="/trainer"
          element={
            <RequireStaff>
              <AppShell>
                <TrainerDashboard />
              </AppShell>
            </RequireStaff>
          }
        />
        <Route
          path="/trainer/live"
          element={
            <RequireStaff>
              <AppShell>
                <TrainerLive />
              </AppShell>
            </RequireStaff>
          }
        />
        <Route
          path="/trainer/results"
          element={
            <RequireStaff>
              <AppShell>
                <TrainerResults />
              </AppShell>
            </RequireStaff>
          }
        />
        <Route
          path="/trainer/candidate/:candidateId"
          element={
            <RequireStaff>
              <AppShell>
                <TrainerCandidateDetail />
              </AppShell>
            </RequireStaff>
          }
        />
        <Route
          path="/trainer/settings"
          element={
            <RequireStaff>
              <AppShell>
                <TrainerSettingsPage />
              </AppShell>
            </RequireStaff>
          }
        />
        <Route
          path="/trainer/users"
          element={
            <RequireStaff adminOnly>
              <AppShell>
                <UserManagement />
              </AppShell>
            </RequireStaff>
          }
        />
        <Route
          path="/trainer/content"
          element={
            <RequireStaff adminOnly>
              <AppShell>
                <ContentManager />
              </AppShell>
            </RequireStaff>
          }
        />

        <Route path="/" element={<LandingRedirect />} />
        <Route path="*" element={<LandingRedirect />} />
      </Routes>
    </React.Suspense>
  )
}

/* -------------------------------------------------------------------------- */
/*  Guards                                                                     */
/* -------------------------------------------------------------------------- */

/** Sends an authenticated user to their own portal rather than a landing page. */
function LandingRedirect() {
  const account = useAppStore((s) => s.profile)
  if (!account) return <Navigate to="/signin" replace />
  if (account.mustChangePassword) {
    return <Navigate to="/change-password" replace state={{ forced: true }} />
  }
  return <Navigate to={account.role === 'candidate' ? '/dashboard' : '/trainer'} replace />
}

function RedirectIfSignedIn({ children }: { children: React.ReactNode }) {
  const account = useAppStore((s) => s.profile)
  if (account && !account.mustChangePassword) {
    return <Navigate to={account.role === 'candidate' ? '/dashboard' : '/trainer'} replace />
  }
  return <>{children}</>
}

/** Requires an authenticated account whose role is `candidate`. */
function RequireCandidate({ children }: { children: React.ReactNode }) {
  const account = useAppStore((s) => s.profile)
  const location = useLocation()

  if (!account) {
    return <Navigate to="/signin" replace state={{ from: location.pathname }} />
  }
  if (account.mustChangePassword) {
    return <Navigate to="/change-password" replace state={{ forced: true }} />
  }
  // Staff have no candidate assessment of their own to take.
  if (account.role !== 'candidate') return <Navigate to="/trainer" replace />
  return <>{children}</>
}

/** Requires a trainer or administrator; `adminOnly` narrows it further. */
function RequireStaff({
  children,
  adminOnly,
}: {
  children: React.ReactNode
  adminOnly?: boolean
}) {
  const account = useAppStore((s) => s.profile)
  const location = useLocation()

  if (!account) {
    return <Navigate to="/signin" replace state={{ from: location.pathname }} />
  }
  if (account.mustChangePassword) {
    return <Navigate to="/change-password" replace state={{ forced: true }} />
  }
  if (account.role === 'candidate') return <Navigate to="/dashboard" replace />
  if (adminOnly && account.role !== 'admin') return <Navigate to="/trainer" replace />
  return <>{children}</>
}

/* -------------------------------------------------------------------------- */

function RouteFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 className="size-5 animate-spin text-navy-300" />
    </div>
  )
}

function BootScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
      <img
        src={logoUrl}
        alt="XTransMatrix"
        width={44}
        height={44}
        className="size-11 object-contain"
      />
      <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading assessment workspace…
      </p>
    </div>
  )
}
