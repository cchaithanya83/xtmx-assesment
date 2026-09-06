import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import type { AccountRole, Profile } from '../_shared/types.ts'
import { forbidden, unauthorized } from './http.ts'

/**
 * Server-side authentication and authorisation.
 *
 * Every request is resolved from the caller's Supabase Auth JWT to a `profiles`
 * row before any data is touched. Nothing downstream accepts a caller-supplied
 * identity — a client cannot claim to be someone else, because it never gets to
 * state who it is.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

/**
 * Admin client. Bypasses RLS, which is exactly why it must never be constructed
 * anywhere the request's identity has not already been established.
 */
export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export interface Caller {
  userId: string
  profile: Profile
  db: SupabaseClient
}

function rowToProfile(row: Record<string, unknown>): Profile {
  return {
    id: row.id as string,
    email: row.email as string,
    name: (row.name as string) ?? '',
    role: row.role as AccountRole,
    status: row.status as Profile['status'],
    candidateId: (row.candidate_id as string | null) ?? undefined,
    createdBy: (row.created_by as string | null) ?? undefined,
    createdAt: row.created_at as string,
    lastLoginAt: (row.last_login_at as string | null) ?? null,
    mustChangePassword: Boolean(row.must_change_password),
  }
}

export { rowToProfile }

/**
 * Verifies the bearer token and loads the caller's profile.
 *
 * Throws 401 for a missing/invalid token or a profile that no longer exists,
 * and 403 for a disabled account — a disabled user's existing JWT stops working
 * immediately rather than lingering until it expires.
 */
export async function authenticate(req: Request): Promise<Caller> {
  const header = req.headers.get('Authorization') ?? ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  if (!token) throw unauthorized()

  const db = adminClient()

  // Validates the signature and expiry against Supabase Auth.
  const { data, error } = await db.auth.getUser(token)
  if (error || !data.user) throw unauthorized('Your session has expired. Please sign in again.')

  const { data: row, error: profileError } = await db
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .maybeSingle()

  if (profileError) throw unauthorized('Could not resolve your profile')
  if (!row) throw unauthorized('No profile is linked to this login')

  const profile = rowToProfile(row)
  if (profile.status === 'disabled') {
    throw forbidden('This account has been disabled. Contact your trainer or administrator.')
  }

  return { userId: data.user.id, profile, db }
}

/* -------------------------------------------------------------------------- */
/*  Role guards                                                                */
/* -------------------------------------------------------------------------- */

export function requireStaff(caller: Caller): Caller {
  if (caller.profile.role === 'candidate') {
    throw forbidden('This resource is restricted to trainers and administrators')
  }
  return caller
}

export function requireAdmin(caller: Caller): Caller {
  if (caller.profile.role !== 'admin') {
    throw forbidden('This resource is restricted to administrators')
  }
  return caller
}

/**
 * Resolves the candidate a request is allowed to act on.
 *
 * A candidate may only ever address their own record — the requested id is
 * ignored entirely for them, so tampering with it changes nothing. Staff may
 * address any candidate.
 *
 * This single function is what enforces "only my data comes to my machine".
 */
export function resolveCandidateId(caller: Caller, requested?: string): string {
  if (caller.profile.role === 'candidate') {
    if (!caller.profile.candidateId) {
      throw forbidden('This login is not linked to a candidate record')
    }
    return caller.profile.candidateId
  }
  if (!requested) throw forbidden('A candidate must be specified')
  return requested
}
