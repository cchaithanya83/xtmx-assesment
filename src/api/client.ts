import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import type {
  AccountRole,
  AssessmentResult,
  AssignmentProgress,
  Attempt,
  Candidate,
  Certification,
  Profile,
  ScriptSegment,
  TrainerSettings,
} from '@/types'

/**
 * The only way this app reaches its data.
 *
 * Supabase Auth issues the session; every data request goes to the `api` Edge
 * Function carrying that JWT. The browser has no database credentials capable
 * of reading anything — RLS denies `anon` and `authenticated` outright — so the
 * server decides what comes back, per user, on every call.
 */

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? ''

export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

/**
 * Auth client only. It is deliberately never used for `.from(...)` queries —
 * all data access goes through `request()` below.
 */
export const supabase: SupabaseClient | null = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : null

const API_BASE = `${SUPABASE_URL}/functions/v1/api`

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message)
  }
}

/**
 * Called whenever an authenticated request comes back 401.
 *
 * Registered by the router so it can sign out and navigate. Lives here rather
 * than in each caller because an expired session is not a per-screen concern —
 * every screen would otherwise render a raw "your session has expired" error
 * and leave the user stranded on it with no way forward.
 */
let onUnauthorized: (() => void) | null = null

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler
}

async function accessToken(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  /** Routes that run before sign-in (registration, bootstrap). */
  anonymous?: boolean
  signal?: AbortSignal
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!isConfigured) {
    throw new ApiError(
      503,
      'The application is not connected to a backend. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    )
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
  }

  if (!options.anonymous) {
    const token = await accessToken()
    if (!token) {
      onUnauthorized?.()
      throw new ApiError(401, 'Your session has expired. Please sign in again.')
    }
    headers.Authorization = `Bearer ${token}`
  } else {
    // The gateway still requires a key to route the request; it grants nothing.
    headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`
  }

  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new ApiError(0, 'Could not reach the server. Check your connection.')
  }

  if (res.status === 204) return undefined as T

  const text = await res.text()
  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      throw new ApiError(res.status, 'The server returned an unreadable response')
    }
  }

  if (!res.ok) {
    const body = payload as { error?: string; code?: string } | null
    // A rejected token is not something a screen can recover from, so hand it
    // to the app rather than rendering it as that screen's error.
    if (res.status === 401 && !options.anonymous) onUnauthorized?.()
    throw new ApiError(res.status, body?.error ?? `Request failed (${res.status})`, body?.code)
  }

  return payload as T
}

/* -------------------------------------------------------------------------- */
/*  Auth                                                                       */
/* -------------------------------------------------------------------------- */

export interface MeResponse {
  profile: Profile
  candidate: Candidate | null
  settings: TrainerSettings
}

export const auth = {
  async signIn(email: string, password: string): Promise<void> {
    if (!supabase) throw new ApiError(503, 'Backend is not configured')
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })
    if (error) {
      // Supabase distinguishes these; the UI deliberately does not, so an
      // attacker cannot enumerate which emails are registered.
      throw new ApiError(401, 'That email and password combination was not recognised.')
    }
  },

  async signOut(): Promise<void> {
    await supabase?.auth.signOut()
  },

  async getSession(): Promise<Session | null> {
    if (!supabase) return null
    const { data } = await supabase.auth.getSession()
    return data.session
  },

  onChange(handler: (session: Session | null) => void): () => void {
    if (!supabase) return () => {}
    const { data } = supabase.auth.onAuthStateChange((_event, session) => handler(session))
    return () => data.subscription.unsubscribe()
  },

  /** Candidate self-registration. Creates the auth user, candidate and profile. */
  register(input: {
    fullName: string
    candidateId: string
    email: string
    password: string
    batch: string
    location: string
    trainerName: string
  }): Promise<{ ok: true }> {
    return request('/auth/register', { method: 'POST', body: input, anonymous: true })
  },

  /** Whether this deployment still needs its first administrator. */
  /** Trainer names for the sign-up dropdown. Names only, no other detail. */
  trainers(): Promise<{ trainers: string[] }> {
    return request('/auth/trainers', { anonymous: true })
  },

  bootstrapStatus(): Promise<{ needsBootstrap: boolean; schemaReady?: boolean }> {
    return request('/auth/bootstrap', { anonymous: true })
  },

  bootstrapAdmin(input: { name: string; email: string; password: string }): Promise<{ ok: true }> {
    return request('/auth/bootstrap', { method: 'POST', body: input, anonymous: true })
  },

  changePassword(currentPassword: string, newPassword: string): Promise<{ ok: true }> {
    return request('/me/password', {
      method: 'POST',
      body: { currentPassword, newPassword },
    })
  },
}

/* -------------------------------------------------------------------------- */
/*  Candidate — always scoped to the caller by the server                      */
/* -------------------------------------------------------------------------- */

export interface ProgressResponse {
  progress: AssignmentProgress[]
  result: AssessmentResult
  certification: Certification | null
}

export interface PublicScenario {
  id: string
  level: 1 | 2 | 3 | 4 | 5
  fields: {
    key: string
    label: string
    type: string
    critical: boolean
    placeholder?: string
    options?: string[]
    hint?: string
  }[]
  segments: ScriptSegment[]
  verificationPrompts: {
    id: string
    question: string
    options: string[]
    triggerAtProgress: number
  }[]
  wordsPerMinute: number
  estimatedDurationSeconds: number
  hasCorrections: boolean
  outOfOrder: boolean
}

export interface StartResponse {
  sessionId: string
  taskId: 1 | 2
  assignmentId: number
  attemptNumber: number
  mode: 'certification' | 'practice'
  startedAt: string
  timeLimitSeconds: number
  passage?: { id: string; label: string; kind: string; text: string }
  scenario?: PublicScenario
}

export const me = {
  get: (): Promise<MeResponse> => request('/me'),
  progress: (): Promise<ProgressResponse> => request('/me/progress'),
  attempts: (): Promise<{ attempts: Attempt[] }> => request('/me/attempts'),
}

export const assessments = {
  start(taskId: number, assignmentId: number, mode: 'certification' | 'practice') {
    return request<StartResponse>('/assessments/start', {
      method: 'POST',
      body: { taskId, assignmentId, mode },
    })
  },

  /**
   * Releases an unsubmitted session.
   *
   * `keepalive` lets the request survive the page unloading, which is the whole
   * point — the common case is a candidate closing the tab mid-assessment.
   */
  async abandon(sessionId: string, keepalive = false): Promise<void> {
    if (!isConfigured) return
    const token = await accessToken()
    if (!token) return
    try {
      await fetch(`${API_BASE}/assessments/abandon`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sessionId }),
        keepalive,
      })
    } catch {
      // Best effort. The server also expires sessions that run past their time
      // limit, so a missed call self-heals.
    }
  },

  submit(input: {
    sessionId: string
    typedText?: string
    backspaces?: number
    answers?: Record<string, string>
    telemetry?: unknown
    integrity?: unknown
  }) {
    return request<{ attempt: Attempt }>('/assessments/submit', {
      method: 'POST',
      body: input,
    })
  },
}

/* -------------------------------------------------------------------------- */
/*  Settings                                                                   */
/* -------------------------------------------------------------------------- */

export const settingsApi = {
  get: (): Promise<{ settings: TrainerSettings }> => request('/settings'),
  update: (patch: Partial<TrainerSettings>): Promise<{ settings: TrainerSettings }> =>
    request('/settings', { method: 'PATCH', body: patch }),
}

/* -------------------------------------------------------------------------- */
/*  Trainer / admin                                                            */
/* -------------------------------------------------------------------------- */

export interface RosterRow {
  id: string
  candidateId: string
  fullName: string
  email: string
  batch: string
  location: string
  trainerName: string
  isDemo: boolean
  lastActiveAt: string
  task1Average: number
  task2Average: number
  finalScore: number
  avgWpm: number
  avgAccuracy: number
  criticalDataAccuracy: number
  multitaskingScore: number
  assignmentsPassed: number
  totalAttempts: number
  certified: boolean
  certificateId: string | null
}

export interface RosterResponse {
  rows: RosterRow[]
  total: number
  limit: number
  offset: number
  settings: TrainerSettings
}

export interface LiveSessionRow {
  sessionId: string
  candidateId: string
  candidateName: string
  candidateCode: string
  batch: string
  taskId: 1 | 2
  assignmentId: number
  attemptNumber: number
  mode: 'certification' | 'practice'
  startedAt: string
  expiresAt: string
}

export interface CandidateDetailResponse {
  candidate: Candidate
  attempts: Attempt[]
  progress: AssignmentProgress[]
  result: AssessmentResult
  certification: Certification | null
}

export const trainer = {
  roster(params: {
    search?: string
    batch?: string
    sort?: string
    direction?: 'asc' | 'desc'
    limit?: number
    offset?: number
  }): Promise<RosterResponse> {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '' && v !== 'all') q.set(k, String(v))
    }
    return request(`/trainer/roster?${q.toString()}`)
  },

  batches: (): Promise<{ batches: string[] }> => request('/trainer/batches'),

  /** Assessments currently in progress, on any machine. Poll this. */
  live: (): Promise<{ sessions: LiveSessionRow[] }> => request('/trainer/live'),

  candidate: (id: string): Promise<CandidateDetailResponse> =>
    request(`/trainer/candidates/${encodeURIComponent(id)}`),

  reset(id: string, target?: { taskId: number; assignmentId: number }): Promise<{ ok: true }> {
    return request(`/trainer/candidates/${encodeURIComponent(id)}/reset`, {
      method: 'POST',
      body: target ?? {},
    })
  },
}

export const admin = {
  users: (): Promise<{ users: Profile[] }> => request('/admin/users'),

  createUser(input: {
    name: string
    email: string
    password: string
    role: Exclude<AccountRole, 'candidate'>
  }): Promise<{ user: Profile }> {
    return request('/admin/users', { method: 'POST', body: input })
  },

  updateUser(
    id: string,
    patch: { name?: string; email?: string; role?: AccountRole; status?: string },
  ): Promise<{ user: Profile }> {
    return request(`/admin/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch })
  },

  setPassword: (id: string, password: string): Promise<{ ok: true }> =>
    request(`/admin/users/${encodeURIComponent(id)}/password`, {
      method: 'POST',
      body: { password },
    }),

  deleteUser: (id: string): Promise<{ ok: true }> =>
    request(`/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  demoData: (action: 'seed' | 'clear'): Promise<{ ok: true; candidates: number }> =>
    request('/admin/demo-data', { method: 'POST', body: { action } }),
}

/* -------------------------------------------------------------------------- */
/*  Editable assessment content (admin only)                                  */
/* -------------------------------------------------------------------------- */

export interface ContentPassage {
  id: string
  assignmentId: number
  label: string
  kind: 'prose' | 'structured' | 'mixed'
  text: string
  active: boolean
  sortOrder: number
}

export interface ContentPool {
  key: string
  label: string
  kind: 'text' | 'number'
  hint: string
  items: string[]
}

export interface ContentResponse {
  passages: ContentPassage[]
  pools: ContentPool[]
  levelFields: Record<string, string[]>
  selectableFields: { key: string; label: string; critical: boolean }[]
}

export const content = {
  get: (): Promise<ContentResponse> => request('/admin/content'),

  createPassage: (input: {
    assignmentId: number
    label: string
    kind: string
    text: string
  }): Promise<unknown> => request('/admin/content/passages', { method: 'POST', body: input }),

  updatePassage: (
    id: string,
    patch: {
      label?: string
      kind?: string
      text?: string
      active?: boolean
      sortOrder?: number
    },
  ): Promise<unknown> =>
    request(`/admin/content/passages/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch }),

  deletePassage: (id: string): Promise<{ ok: true }> =>
    request(`/admin/content/passages/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  updatePool: (key: string, items: string[]): Promise<{ ok: true }> =>
    request(`/admin/content/pools/${encodeURIComponent(key)}`, {
      method: 'PATCH',
      body: { items },
    }),

  updateLevelFields: (level: number, fieldKeys: string[]): Promise<{ ok: true }> =>
    request(`/admin/content/level-fields/${level}`, { method: 'PATCH', body: { fieldKeys } }),

  reset: (target: 'passages' | 'pools' | 'levelFields'): Promise<{ ok: true; restored: number }> =>
    request('/admin/content/reset', { method: 'POST', body: { target } }),
}
