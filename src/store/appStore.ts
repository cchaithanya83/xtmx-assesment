import { create } from 'zustand'
import type {
  AssessmentMode,
  AssessmentResult,
  AssignmentProgress,
  Attempt,
  Candidate,
  Certification,
  Profile,
  TaskId,
  TrainerSettings,
} from '@/types'
import { DEFAULT_SETTINGS } from '@/data/settings'
import {
  ApiError,
  assessments,
  auth,
  isConfigured,
  me,
  settingsApi,
  type StartResponse,
} from '@/api/client'

/**
 * Application state.
 *
 * The store holds only what the signed-in user is entitled to see, exactly as
 * the server returned it. There is no local database and no client-side
 * filtering of other people's records — a candidate's browser never receives
 * another candidate's data in the first place.
 *
 * Trainer and admin screens deliberately do NOT cache into this store: they
 * fetch their own scoped, paginated data per view (see `src/api/client.ts`), so
 * a large cohort never has to be materialised in memory.
 */

export type Role = 'candidate' | 'trainer'

export interface RegisterInput {
  fullName: string
  candidateId: string
  email: string
  password: string
  batch: string
  location: string
  trainerName: string
}

export interface SubmitInput {
  sessionId: string
  typedText?: string
  backspaces?: number
  answers?: Record<string, string>
  telemetry?: unknown
  integrity?: unknown
}

interface AppState {
  /* --- identity ---------------------------------------------------------- */
  profile: Profile | null
  candidate: Candidate | null
  settings: TrainerSettings

  /* --- the signed-in candidate's own assessment state -------------------- */
  progress: AssignmentProgress[]
  result: AssessmentResult | null
  certification: Certification | null

  /* --- runtime ----------------------------------------------------------- */
  activeSession: StartResponse | null
  lastAttempt: Attempt | null
  booting: boolean
  loadingProgress: boolean
  error: string | null
  /** Set when the server rejects our token, so the router can bounce to sign-in. */
  sessionExpired: boolean

  /* --- lifecycle --------------------------------------------------------- */
  bootstrap: () => Promise<void>
  refreshMe: () => Promise<void>
  refreshProgress: () => Promise<void>
  clearError: () => void
  expireSession: () => void
  clearSessionExpired: () => void

  /* --- auth -------------------------------------------------------------- */
  signIn: (email: string, password: string) => Promise<Profile>
  signOut: () => Promise<void>
  register: (input: RegisterInput) => Promise<void>

  /* --- assessment -------------------------------------------------------- */
  startAssignment: (
    taskId: TaskId,
    assignmentId: number,
    mode: AssessmentMode,
  ) => Promise<StartResponse>
  abandonSession: () => Promise<void>
  submitAttempt: (input: SubmitInput) => Promise<Attempt>

  /* --- settings ---------------------------------------------------------- */
  updateSettings: (patch: Partial<TrainerSettings>) => Promise<void>

  /* --- derived ----------------------------------------------------------- */
  portal: () => Role
  isStaff: () => boolean
  isAdmin: () => boolean
}

function messageFor(err: unknown): string {
  if (err instanceof ApiError) return err.message
  return (err as Error)?.message ?? 'Something went wrong'
}

export const useAppStore = create<AppState>((set, get) => ({
  profile: null,
  candidate: null,
  settings: DEFAULT_SETTINGS,

  progress: [],
  result: null,
  certification: null,

  activeSession: null,
  lastAttempt: null,
  booting: true,
  loadingProgress: false,
  error: null,
  sessionExpired: false,

  /* ---------------------------------------------------------------------- */

  /** Restores the session on page load and fetches the caller's own record. */
  async bootstrap() {
    if (!isConfigured) {
      set({ booting: false })
      return
    }
    try {
      const session = await auth.getSession()
      if (!session) {
        set({ profile: null, candidate: null, booting: false })
        return
      }
      await get().refreshMe()
      if (get().profile?.role === 'candidate' && !get().profile?.mustChangePassword) {
        await get().refreshProgress()
      }
    } catch (err) {
      // An expired or revoked token lands here; treat it as signed out rather
      // than stranding the user on a broken screen.
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        await auth.signOut()
        set({ profile: null, candidate: null })
      } else {
        set({ error: messageFor(err) })
      }
    } finally {
      set({ booting: false })
    }
  },

  async refreshMe() {
    const data = await me.get()
    set({
      profile: data.profile,
      candidate: data.candidate,
      // Merged OVER the defaults rather than replacing them.
      //
      // A setting added in a release the server has not been redeployed with
      // would otherwise arrive as `undefined`, and any feature gated on it
      // would silently switch off — a default-on feature vanishing because a
      // key is missing is the worst possible failure mode. The server does the
      // same merge over its own defaults; this makes the client agree.
      settings: { ...DEFAULT_SETTINGS, ...data.settings },
    })
  },

  async refreshProgress() {
    if (get().profile?.role !== 'candidate') return
    set({ loadingProgress: true })
    try {
      const data = await me.progress()
      set({
        progress: data.progress,
        result: data.result,
        certification: data.certification,
      })
    } finally {
      set({ loadingProgress: false })
    }
  },

  clearError: () => set({ error: null }),

  /**
   * Tears down local state after the server rejects our token.
   *
   * Called from the API layer, so it must be safe to invoke repeatedly and from
   * outside React.
   */
  expireSession() {
    if (get().sessionExpired) return
    set({
      sessionExpired: true,
      profile: null,
      candidate: null,
      progress: [],
      result: null,
      certification: null,
      activeSession: null,
      lastAttempt: null,
    })
    void auth.signOut()
  },

  clearSessionExpired: () => set({ sessionExpired: false }),

  /* --- auth -------------------------------------------------------------- */

  async signIn(email, password) {
    await auth.signIn(email, password)
    await get().refreshMe()

    const profile = get().profile
    if (!profile) throw new ApiError(500, 'Signed in, but no profile was returned')

    // A forced password change blocks every other route, so there is nothing
    // useful to prefetch until it is done.
    if (profile.role === 'candidate' && !profile.mustChangePassword) {
      await get().refreshProgress()
    }
    return profile
  },

  async signOut() {
    await auth.signOut()
    set({
      profile: null,
      candidate: null,
      progress: [],
      result: null,
      certification: null,
      activeSession: null,
      lastAttempt: null,
      error: null,
    })
  },

  async register(input) {
    await auth.register(input)
    // Registration does not sign you in; do that explicitly so there is exactly
    // one code path that establishes a session.
    await get().signIn(input.email, input.password)
  },

  /* --- assessment -------------------------------------------------------- */

  /**
   * Asks the server for an assessment ticket.
   *
   * Lock/unlock, retry limits and content selection are all decided server-side;
   * this call simply surfaces the answer. A locked assignment throws 403.
   */
  async startAssignment(taskId, assignmentId, mode) {
    const session = await assessments.start(taskId, assignmentId, mode)
    set({ activeSession: session, lastAttempt: null })
    return session
  },

  /** Tells the server to release the session, then clears it locally. */
  async abandonSession() {
    const session = get().activeSession
    set({ activeSession: null })
    if (session) await assessments.abandon(session.sessionId)
  },

  /**
   * Submits an attempt. The server scores it and returns the graded result —
   * the client never computes or sends a score.
   */
  async submitAttempt(input) {
    const { attempt } = await assessments.submit(input)
    set({ activeSession: null, lastAttempt: attempt })
    // Progress, certification status and aggregate scores all change on submit,
    // so refetch rather than trying to patch them locally.
    await get().refreshProgress()
    return attempt
  },

  /* --- settings ---------------------------------------------------------- */

  async updateSettings(patch) {
    const { settings } = await settingsApi.update(patch)
    // Same merge as refreshMe, for the same reason.
    set({ settings: { ...DEFAULT_SETTINGS, ...settings } })
  },

  /* --- derived ----------------------------------------------------------- */

  portal: () => (get().profile?.role === 'candidate' ? 'candidate' : 'trainer'),
  isStaff: () => {
    const r = get().profile?.role
    return r === 'trainer' || r === 'admin'
  },
  isAdmin: () => get().profile?.role === 'admin',
}))

/* -------------------------------------------------------------------------- */
/*  Convenience hooks                                                          */
/* -------------------------------------------------------------------------- */

export const useProfile = () => useAppStore((s) => s.profile)
export const useCurrentCandidate = () => useAppStore((s) => s.candidate)
export const useSettings = () => useAppStore((s) => s.settings)
export const useProgress = () => useAppStore((s) => s.progress)
export const useResult = () => useAppStore((s) => s.result)
