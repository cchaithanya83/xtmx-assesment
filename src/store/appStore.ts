import { create } from 'zustand'
import type {
  Account,
  AccountRole,
  AssessmentMode,
  AssessmentResult,
  AssignmentProgress,
  Attempt,
  AudioScenario,
  Candidate,
  Certification,
  LiveSession,
  TaskId,
  TrainerSettings,
  TypingPassage,
} from '@/types'
import {
  authenticate,
  buildBootstrapAccounts,
  canDisableOrDelete,
  createStaffAccount,
  fail,
  registerCandidateAccount,
  withNewPassword,
  type AuthResult,
  type CandidateSignUpInput,
  type CandidateSignUpResult,
} from '@/auth/accounts'
import { assessPassword, normaliseEmail } from '@/auth/crypto'
import { DEFAULT_SETTINGS } from '@/data/settings'
import { buildSeedWorkspace } from '@/data/seed'
import { pickPassage } from '@/data/passages'
import { getAssignment, TASKS } from '@/data/tasks'
import { generateScenario } from '@/engine/scenarioGenerator'
import {
  buildCertification,
  classifyRisk,
  computeAssessmentResult,
  deriveProgress,
  isAssignmentPlayable,
} from '@/engine/certification'
import { resolveAdapter, SNAPSHOT_VERSION, type WorkspaceSnapshot } from '@/persistence'
import { uid } from '@/lib/utils'

/** Which portal the UI is showing. Derived from the signed-in account's role. */
export type Role = 'candidate' | 'trainer'

/** An assessment that has been started but not yet submitted. */
export interface ActiveSession {
  id: string
  candidateId: string
  taskId: TaskId
  assignmentId: number
  attemptNumber: number
  mode: AssessmentMode
  startedAt: string
  passage?: TypingPassage
  scenario?: AudioScenario
}

interface AppState {
  /* --- identity ---------------------------------------------------------- */
  role: Role
  currentAccountId: string | null
  currentCandidateId: string | null
  trainerName: string

  /* --- data -------------------------------------------------------------- */
  accounts: Account[]
  candidates: Candidate[]
  attempts: Attempt[]
  certifications: Certification[]
  settings: TrainerSettings

  /* --- runtime ----------------------------------------------------------- */
  activeSession: ActiveSession | null
  /** Last submitted attempt id — the result screen reads this. */
  lastAttemptId: string | null
  liveSessions: LiveSession[]
  hydrated: boolean
  storageError: string | null

  /* --- actions ----------------------------------------------------------- */
  hydrate: () => Promise<void>
  setRole: (role: Role) => void

  /* --- authentication ---------------------------------------------------- */
  signIn: (email: string, password: string) => Promise<AuthResult>
  signUpCandidate: (input: CandidateSignUpInput) => Promise<CandidateSignUpResult>
  signOut: () => void
  changeOwnPassword: (currentPassword: string, newPassword: string) => Promise<AuthResult>

  /* --- account administration (admin only) ------------------------------- */
  addStaffAccount: (input: {
    name: string
    email: string
    password: string
    role: Exclude<AccountRole, 'candidate'>
  }) => Promise<AuthResult>
  updateAccount: (accountId: string, patch: Partial<Pick<Account, 'name' | 'email' | 'role'>>) => AuthResult
  setAccountPassword: (accountId: string, password: string) => Promise<AuthResult>
  setAccountStatus: (accountId: string, status: Account['status']) => AuthResult
  deleteAccount: (accountId: string) => AuthResult

  startAssignment: (taskId: TaskId, assignmentId: number, mode: AssessmentMode) => ActiveSession | null
  abandonSession: () => void
  submitAttempt: (attempt: Omit<Attempt, 'id'>) => Attempt

  updateSettings: (patch: Partial<TrainerSettings>) => void
  resetSettings: () => void
  resetAssignment: (candidateId: string, taskId: TaskId, assignmentId: number) => void
  resetCandidate: (candidateId: string) => void
  deleteDemoData: () => void
  reseedDemoData: () => void

  publishLive: (session: LiveSession) => void
  clearLive: (candidateId: string) => void

  /* --- selectors (derived, memo-free — cheap over this data volume) ------- */
  getCurrentAccount: () => Account | null
  getCandidate: (id: string) => Candidate | undefined
  getAttempts: (candidateId: string) => Attempt[]
  getProgress: (candidateId: string) => AssignmentProgress[]
  getResult: (candidateId: string) => AssessmentResult
  getCertification: (candidateId: string) => Certification | null
  getAttemptNumber: (candidateId: string, taskId: TaskId, assignmentId: number, mode: AssessmentMode) => number
}

const adapter = resolveAdapter()

/**
 * Session pointer (who is signed in, and which portal they are viewing).
 *
 * Kept separate from the workspace snapshot: the workspace is shared data, the
 * session is per-browser. Persisting it means a page refresh mid-assessment
 * returns the candidate to their dashboard instead of the login screen.
 */
const SESSION_KEY = 'xtmx.session.v1'

interface SessionPointer {
  accountId: string | null
  candidateId: string | null
  role: Role
}

const EMPTY_SESSION: SessionPointer = { accountId: null, candidateId: null, role: 'candidate' }

function readSession(): SessionPointer {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY)
    if (!raw) return EMPTY_SESSION
    const parsed = JSON.parse(raw) as SessionPointer
    return {
      accountId: parsed.accountId ?? null,
      candidateId: parsed.candidateId ?? null,
      role: parsed.role === 'trainer' ? 'trainer' : 'candidate',
    }
  } catch {
    return EMPTY_SESSION
  }
}

function writeSession(session: SessionPointer) {
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // Session persistence is a convenience; never block the assessment on it.
  }
}

/**
 * Snapshot writer.
 *
 * Assessments fire many state updates per second, so routine writes are
 * debounced. Anything a candidate would be upset to lose — a submitted attempt,
 * a new registration, a trainer reset — is written through immediately, and a
 * `pagehide` listener flushes whatever is still pending.
 */
let saveTimer: number | null = null
let pendingFlush: (() => void) | null = null

function buildSnapshot(s: AppState): WorkspaceSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    accounts: s.accounts,
    candidates: s.candidates,
    attempts: s.attempts,
    certifications: s.certifications,
    settings: s.settings,
    updatedAt: new Date().toISOString(),
  }
}

function scheduleSave(
  get: () => AppState,
  set: (patch: Partial<AppState>) => void,
  immediate = false,
) {
  const write = () => {
    saveTimer = null
    pendingFlush = null
    adapter
      .save(buildSnapshot(get()))
      .then(() => set({ storageError: null }))
      .catch((err: Error) => set({ storageError: err.message }))
  }

  if (saveTimer !== null) window.clearTimeout(saveTimer)
  if (immediate) {
    write()
    return
  }
  pendingFlush = write
  saveTimer = window.setTimeout(write, 400)
}

// Never lose a pending write to a tab close, refresh or navigation.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => pendingFlush?.())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') pendingFlush?.()
  })
}

/** Which portal a role lands in. Admins share the trainer portal. */
function portalFor(role: AccountRole): Role {
  return role === 'candidate' ? 'candidate' : 'trainer'
}

export const useAppStore = create<AppState>((set, get) => ({
  role: 'candidate',
  currentAccountId: null,
  currentCandidateId: null,
  trainerName: 'Akhilesh Rao',

  accounts: [],
  candidates: [],
  attempts: [],
  certifications: [],
  settings: DEFAULT_SETTINGS,

  activeSession: null,
  lastAttemptId: null,
  liveSessions: [],
  hydrated: false,
  storageError: null,

  /* ---------------------------------------------------------------------- */

  async hydrate() {
    if (get().hydrated) return
    const session = readSession()

    let snapshot: WorkspaceSnapshot | null = null
    try {
      snapshot = await adapter.load()
    } catch (err) {
      set({ storageError: (err as Error).message })
    }

    // Two things can be missing independently, and each has its own trigger:
    //
    //  - No accounts  → bootstrap the admin/trainer logins, so the platform can
    //    never be locked out of itself.
    //  - No candidates AND no attempts → a genuinely empty workspace, so seed
    //    the demo cohort and give the trainer portal something to show.
    //
    // They are checked separately because a hosted backend always returns a
    // snapshot object (empty arrays rather than null), unlike local storage
    // which returns null on first run. Treating "empty" and "absent" the same
    // way is what keeps a fresh Supabase project from starting up bare.
    const needsAccounts = !snapshot?.accounts?.length
    const isEmptyWorkspace = !snapshot?.candidates?.length && !snapshot?.attempts?.length

    const accounts = needsAccounts
      ? await buildBootstrapAccounts()
      : (snapshot?.accounts ?? [])

    // Never re-seed a workspace a trainer has deliberately cleared: demo data
    // is only planted when there is no candidate *and* no attempt history.
    const seeded = isEmptyWorkspace ? buildSeedWorkspace(DEFAULT_SETTINGS) : null

    // Restore the session only if that account still exists and is active.
    const account = accounts.find((a) => a.id === session.accountId)
    const usable = account && account.status === 'active'

    set({
      accounts,
      candidates: seeded ? seeded.candidates : (snapshot?.candidates ?? []),
      attempts: seeded ? seeded.attempts : (snapshot?.attempts ?? []),
      certifications: snapshot?.certifications ?? [],
      settings: { ...DEFAULT_SETTINGS, ...(snapshot?.settings ?? {}) },
      currentAccountId: usable ? account.id : null,
      currentCandidateId: usable ? (account.candidateId ?? null) : null,
      role: usable ? portalFor(account.role) : 'candidate',
      hydrated: true,
    })

    // Persist whatever we just invented so the next load finds it waiting.
    if (needsAccounts || seeded) scheduleSave(get, set, true)
  },

  setRole(role) {
    // Candidates can never switch themselves into the trainer portal.
    const account = get().getCurrentAccount()
    if (role === 'trainer' && account?.role === 'candidate') return
    set({ role })
    writeSession({
      accountId: get().currentAccountId,
      candidateId: get().currentCandidateId,
      role,
    })
  },

  /* --- authentication ---------------------------------------------------- */

  async signIn(email, password) {
    const result = await authenticate(get().accounts, email, password)
    if (!result.ok || !result.account) return result

    const account = result.account
    const now = new Date().toISOString()
    const role = portalFor(account.role)

    set((s) => ({
      accounts: s.accounts.map((a) => (a.id === account.id ? { ...a, lastLoginAt: now } : a)),
      currentAccountId: account.id,
      currentCandidateId: account.candidateId ?? null,
      role,
      // A new sign-in must never inherit a previous user's in-flight attempt.
      activeSession: null,
      lastAttemptId: null,
      candidates: account.candidateId
        ? s.candidates.map((c) =>
            c.id === account.candidateId ? { ...c, lastActiveAt: now } : c,
          )
        : s.candidates,
    }))

    writeSession({ accountId: account.id, candidateId: account.candidateId ?? null, role })
    scheduleSave(get, set, true)
    return { ok: true, account: { ...account, lastLoginAt: now } }
  },

  async signUpCandidate(input) {
    if (!assessPassword(input.password).acceptable) {
      return { ...fail('weak-password') }
    }
    const result = await registerCandidateAccount(get().accounts, get().candidates, input)
    if (!result.ok || !result.account || !result.candidate) return result

    const { account, candidate } = result
    set((s) => ({
      accounts: [...s.accounts, account],
      candidates: [...s.candidates, candidate],
      currentAccountId: account.id,
      currentCandidateId: candidate.id,
      role: 'candidate',
      activeSession: null,
      lastAttemptId: null,
    }))
    writeSession({ accountId: account.id, candidateId: candidate.id, role: 'candidate' })
    void adapter.upsertCandidate(candidate).catch(() => {})
    scheduleSave(get, set, true)
    return result
  },

  signOut() {
    set({
      currentAccountId: null,
      currentCandidateId: null,
      activeSession: null,
      lastAttemptId: null,
      role: 'candidate',
    })
    writeSession(EMPTY_SESSION)
  },

  async changeOwnPassword(currentPassword, newPassword) {
    const account = get().getCurrentAccount()
    if (!account) return fail('not-found')
    if (!assessPassword(newPassword).acceptable) return fail('weak-password')

    const check = await authenticate(get().accounts, account.email, currentPassword)
    if (!check.ok) return fail('invalid-credentials')

    const updated = await withNewPassword(account, newPassword, false)
    set((s) => ({ accounts: s.accounts.map((a) => (a.id === account.id ? updated : a)) }))
    scheduleSave(get, set, true)
    return { ok: true, account: updated }
  },

  /* --- account administration -------------------------------------------- */

  async addStaffAccount(input) {
    const actor = get().getCurrentAccount()
    if (actor?.role !== 'admin') return fail('not-found')
    if (!assessPassword(input.password).acceptable) return fail('weak-password')

    const result = await createStaffAccount(get().accounts, input, actor.id)
    if (!result.ok || !result.account) return result

    const account = result.account
    set((s) => ({ accounts: [...s.accounts, account] }))
    scheduleSave(get, set, true)
    return result
  },

  updateAccount(accountId, patch) {
    const actor = get().getCurrentAccount()
    if (actor?.role !== 'admin') return fail('not-found')

    const target = get().accounts.find((a) => a.id === accountId)
    if (!target) return fail('not-found')

    let next = patch
    if (next.email) {
      const email = normaliseEmail(next.email)
      if (get().accounts.some((a) => a.email === email && a.id !== accountId)) {
        return fail('email-taken')
      }
      next = { ...next, email }
    }

    // Demoting the last admin would lock the platform out of its own settings.
    if (next.role && next.role !== 'admin' && target.role === 'admin') {
      if (!canDisableOrDelete(get().accounts, accountId)) return fail('last-admin')
    }

    const updated = { ...target, ...next }
    set((s) => ({ accounts: s.accounts.map((a) => (a.id === accountId ? updated : a)) }))
    scheduleSave(get, set, true)
    return { ok: true, account: updated }
  },

  async setAccountPassword(accountId, password) {
    const actor = get().getCurrentAccount()
    if (actor?.role !== 'admin') return fail('not-found')
    if (!assessPassword(password).acceptable) return fail('weak-password')

    const target = get().accounts.find((a) => a.id === accountId)
    if (!target) return fail('not-found')

    // Admin-issued passwords are temporary — the owner must replace it.
    const updated = await withNewPassword(target, password, target.id !== actor.id)
    set((s) => ({ accounts: s.accounts.map((a) => (a.id === accountId ? updated : a)) }))
    scheduleSave(get, set, true)
    return { ok: true, account: updated }
  },

  setAccountStatus(accountId, status) {
    const actor = get().getCurrentAccount()
    if (actor?.role !== 'admin') return fail('not-found')
    if (status === 'disabled' && !canDisableOrDelete(get().accounts, accountId)) {
      return fail('last-admin')
    }

    const target = get().accounts.find((a) => a.id === accountId)
    if (!target) return fail('not-found')

    const updated = { ...target, status }
    set((s) => ({
      accounts: s.accounts.map((a) => (a.id === accountId ? updated : a)),
      // Disabling the signed-in account signs it out immediately.
      currentAccountId:
        status === 'disabled' && s.currentAccountId === accountId ? null : s.currentAccountId,
    }))
    scheduleSave(get, set, true)
    return { ok: true, account: updated }
  },

  deleteAccount(accountId) {
    const actor = get().getCurrentAccount()
    if (actor?.role !== 'admin') return fail('not-found')
    if (accountId === actor.id) return fail('last-admin')
    if (!canDisableOrDelete(get().accounts, accountId)) return fail('last-admin')

    set((s) => ({ accounts: s.accounts.filter((a) => a.id !== accountId) }))
    scheduleSave(get, set, true)
    return { ok: true }
  },

  /* ---------------------------------------------------------------------- */

  /**
   * Opens an assessment session.
   *
   * Returns `null` when the assignment is locked — product rule #1 is enforced
   * here rather than only in the UI, so a hand-typed route cannot bypass it.
   *
   * Task 1 rotates to a different passage for each attempt; Task 2 generates a
   * brand-new randomised scenario every time (product rule #5).
   */
  startAssignment(taskId, assignmentId, mode) {
    const candidateId = get().currentCandidateId
    if (!candidateId) return null

    const progress = get().getProgress(candidateId)
    if (mode === 'certification' && !isAssignmentPlayable(progress, taskId, assignmentId)) {
      return null
    }

    const attemptNumber = get().getAttemptNumber(candidateId, taskId, assignmentId, mode)
    const assignment = getAssignment(taskId, assignmentId)
    const settings = get().settings

    const session: ActiveSession = {
      id: uid('ses'),
      candidateId,
      taskId,
      assignmentId,
      attemptNumber,
      mode,
      startedAt: new Date().toISOString(),
    }

    if (taskId === 1) {
      session.passage = pickPassage(assignmentId, attemptNumber)
    } else {
      const level = assignment.audioLevel ?? 1
      const config =
        settings.audioLevels.find((l) => l.level === level) ?? settings.audioLevels[0]
      // Assignment 5's prompt count is trainer-configurable independently.
      const effective =
        assignmentId === 5
          ? { ...config, verificationPrompts: settings.verificationPromptFrequency }
          : config
      session.scenario = generateScenario(effective)
    }

    set({ activeSession: session })
    return session
  },

  abandonSession() {
    const s = get()
    if (s.activeSession) s.clearLive(s.activeSession.candidateId)
    set({ activeSession: null })
  },

  submitAttempt(input) {
    const attempt: Attempt = { ...input, id: uid('att') }
    set((s) => ({
      attempts: [...s.attempts, attempt],
      activeSession: null,
      lastAttemptId: attempt.id,
      candidates: s.candidates.map((c) =>
        c.id === attempt.candidateId ? { ...c, lastActiveAt: attempt.completedAt } : c,
      ),
      liveSessions: s.liveSessions.filter((l) => l.candidateId !== attempt.candidateId),
    }))

    void adapter.appendAttempt(attempt).catch(() => {})

    // Issue the certificate the moment every gate is satisfied.
    const state = get()
    const candidate = state.getCandidate(attempt.candidateId)
    if (candidate) {
      const result = computeAssessmentResult(candidate.id, state.getAttempts(candidate.id), state.settings)
      const already = state.certifications.find((c) => c.candidateId === candidate.id)
      if (result.certified && !already) {
        const cert = buildCertification(candidate.id, candidate.fullName, result)
        if (cert) {
          set((s) => ({ certifications: [...s.certifications, cert] }))
          void adapter.saveCertification(cert).catch(() => {})
        }
      }
    }

    scheduleSave(get, set, true)
    return attempt
  },

  /* ---------------------------------------------------------------------- */

  updateSettings(patch) {
    const settings = { ...get().settings, ...patch }
    set({ settings })
    void adapter.saveSettings(settings).catch(() => {})
    scheduleSave(get, set)
  },

  resetSettings() {
    set({ settings: DEFAULT_SETTINGS })
    void adapter.saveSettings(DEFAULT_SETTINGS).catch(() => {})
    scheduleSave(get, set)
  },

  /** Trainer action — clears one assignment's attempts so it can be re-run. */
  resetAssignment(candidateId, taskId, assignmentId) {
    set((s) => ({
      attempts: s.attempts.filter(
        (a) =>
          !(a.candidateId === candidateId && a.taskId === taskId && a.assignmentId === assignmentId),
      ),
      certifications: s.certifications.filter((c) => c.candidateId !== candidateId),
    }))
    scheduleSave(get, set, true)
  },

  resetCandidate(candidateId) {
    set((s) => ({
      attempts: s.attempts.filter((a) => a.candidateId !== candidateId),
      certifications: s.certifications.filter((c) => c.candidateId !== candidateId),
    }))
    scheduleSave(get, set, true)
  },

  deleteDemoData() {
    set((s) => {
      const demoIds = new Set(s.candidates.filter((c) => c.isDemo).map((c) => c.id))
      const signedInWasDemo =
        s.currentCandidateId !== null && demoIds.has(s.currentCandidateId)
      return {
        candidates: s.candidates.filter((c) => !c.isDemo),
        attempts: s.attempts.filter((a) => !demoIds.has(a.candidateId)),
        certifications: s.certifications.filter((c) => !demoIds.has(c.candidateId)),
        currentCandidateId: signedInWasDemo ? null : s.currentCandidateId,
      }
    })
    writeSession({
      accountId: get().currentAccountId,
      candidateId: get().currentCandidateId,
      role: get().role,
    })
    scheduleSave(get, set)
  },

  reseedDemoData() {
    const seeded = buildSeedWorkspace(get().settings)
    set((s) => {
      const demoIds = new Set(s.candidates.filter((c) => c.isDemo).map((c) => c.id))
      return {
        candidates: [...s.candidates.filter((c) => !c.isDemo), ...seeded.candidates],
        attempts: [...s.attempts.filter((a) => !demoIds.has(a.candidateId)), ...seeded.attempts],
      }
    })
    scheduleSave(get, set)
  },

  /* --- live monitoring --------------------------------------------------- */

  publishLive(session) {
    set((s) => {
      const others = s.liveSessions.filter((l) => l.candidateId !== session.candidateId)
      return { liveSessions: [...others, session] }
    })
  },

  clearLive(candidateId) {
    set((s) => ({ liveSessions: s.liveSessions.filter((l) => l.candidateId !== candidateId) }))
  },

  /* --- selectors --------------------------------------------------------- */

  getCurrentAccount() {
    const id = get().currentAccountId
    return id ? (get().accounts.find((a) => a.id === id) ?? null) : null
  },

  getCandidate(id) {
    return get().candidates.find((c) => c.id === id)
  },

  getAttempts(candidateId) {
    return get()
      .attempts.filter((a) => a.candidateId === candidateId)
      .sort((a, b) => a.completedAt.localeCompare(b.completedAt))
  },

  getProgress(candidateId) {
    return deriveProgress(get().getAttempts(candidateId))
  },

  getResult(candidateId) {
    return computeAssessmentResult(candidateId, get().getAttempts(candidateId), get().settings)
  },

  getCertification(candidateId) {
    const stored = get().certifications.find((c) => c.candidateId === candidateId)
    if (stored) return stored
    const candidate = get().getCandidate(candidateId)
    if (!candidate) return null
    const result = get().getResult(candidateId)
    return buildCertification(candidateId, candidate.fullName, result)
  },

  getAttemptNumber(candidateId, taskId, assignmentId, mode) {
    return (
      get().attempts.filter(
        (a) =>
          a.candidateId === candidateId &&
          a.taskId === taskId &&
          a.assignmentId === assignmentId &&
          a.mode === mode,
      ).length + 1
    )
  },
}))

/* -------------------------------------------------------------------------- */
/*  Convenience hooks                                                          */
/* -------------------------------------------------------------------------- */

export function useCurrentCandidate(): Candidate | null {
  const id = useAppStore((s) => s.currentCandidateId)
  const candidates = useAppStore((s) => s.candidates)
  return id ? (candidates.find((c) => c.id === id) ?? null) : null
}

export function useSettings(): TrainerSettings {
  return useAppStore((s) => s.settings)
}

/** Trainer roster row — one per candidate, with derived results. */
export interface RosterRow {
  candidate: Candidate
  result: AssessmentResult
  currentTaskId: TaskId | null
  currentAssignmentId: number | null
  live: LiveSession | undefined
}

export function useRoster(): RosterRow[] {
  const candidates = useAppStore((s) => s.candidates)
  const attempts = useAppStore((s) => s.attempts)
  const settings = useAppStore((s) => s.settings)
  const liveSessions = useAppStore((s) => s.liveSessions)

  return candidates.map((candidate) => {
    const own = attempts.filter((a) => a.candidateId === candidate.id)
    const result = computeAssessmentResult(candidate.id, own, settings)
    const progress = deriveProgress(own)
    const current = progress.find((p) => p.status !== 'passed' && p.status !== 'locked')
    return {
      candidate,
      result,
      currentTaskId: current?.taskId ?? null,
      currentAssignmentId: current?.assignmentId ?? null,
      live: liveSessions.find((l) => l.candidateId === candidate.id),
    }
  })
}

/** Aggregate KPI counters for the trainer dashboard header. */
export function useRosterKpis(rows: RosterRow[]) {
  const certified = rows.filter((r) => r.result.certified).length
  const inProgress = rows.filter((r) => r.result.status === 'in-progress').length
  const coaching = rows.filter((r) => r.result.status === 'needs-coaching').length
  const danger = rows.filter((r) => r.result.status === 'danger').length
  const notCertified = rows.filter((r) => r.result.status === 'not-certified').length
  return {
    total: rows.length,
    certified,
    inProgress,
    coaching,
    danger,
    notCertified,
  }
}

/** Live-risk helper shared by the assessment runners. */
export function liveRiskFor(score: number, certifiedTarget: number): LiveSession['risk'] {
  return classifyRisk(score, score >= certifiedTarget, 0)
}

export const ALL_TASKS = TASKS
