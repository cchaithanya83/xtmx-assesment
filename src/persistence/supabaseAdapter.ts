import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Account, Attempt, Candidate, Certification, TrainerSettings } from '@/types'
import { DEFAULT_SETTINGS } from '@/data/settings'
import { SNAPSHOT_VERSION, type PersistenceAdapter, type WorkspaceSnapshot } from './types'

/**
 * Production persistence adapter.
 *
 * Activates automatically when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
 * are present. The schema (and the Row Level Security policies that make the
 * public anon key safe) live in `supabase/schema.sql`.
 *
 * Table layout — see schema.sql:
 *   accounts        (id, email, name, role, status, password_hash, ...)
 *   candidates      (id, full_name, candidate_id, email, batch, location, ...)
 *   attempts        (id, candidate_id, task_id, assignment_id, payload jsonb)
 *   certifications  (certificate_id, candidate_id, payload jsonb)
 *   trainer_settings(id='global', payload jsonb)
 *
 * Attempts store their metric payload as `jsonb` deliberately: the scoring
 * engine evolves faster than a relational schema should, and every query the
 * trainer dashboard needs is served by the promoted top-level columns.
 */
export class SupabaseAdapter implements PersistenceAdapter {
  readonly id = 'supabase'
  readonly label = 'Supabase'
  private client: SupabaseClient | null = null

  constructor(url?: string, anonKey?: string) {
    const u = url ?? (import.meta.env.VITE_SUPABASE_URL as string | undefined)
    const k = anonKey ?? (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)
    if (u && k) this.client = createClient(u, k, { auth: { persistSession: true } })
  }

  isAvailable(): boolean {
    return this.client !== null
  }

  private get db(): SupabaseClient {
    if (!this.client) throw new Error('Supabase is not configured')
    return this.client
  }

  async load(): Promise<WorkspaceSnapshot | null> {
    const [accounts, candidates, attempts, certifications, settings] = await Promise.all([
      this.db.from('accounts').select('*').order('created_at', { ascending: true }),
      this.db.from('candidates').select('*').order('created_at', { ascending: true }),
      this.db.from('attempts').select('*').order('completed_at', { ascending: true }),
      this.db.from('certifications').select('*'),
      this.db.from('trainer_settings').select('*').eq('id', 'global').maybeSingle(),
    ])

    if (candidates.error) throw candidates.error
    if (attempts.error) throw attempts.error

    return {
      version: SNAPSHOT_VERSION,
      accounts: (accounts.data ?? []).map(rowToAccount),
      candidates: (candidates.data ?? []).map(rowToCandidate),
      attempts: (attempts.data ?? []).map((r) => r.payload as Attempt),
      certifications: (certifications.data ?? []).map((r) => r.payload as Certification),
      settings: (settings.data?.payload as TrainerSettings | undefined) ?? DEFAULT_SETTINGS,
      updatedAt: new Date().toISOString(),
    }
  }

  /** Bulk sync — used on first migration from local storage. */
  async save(snapshot: WorkspaceSnapshot): Promise<void> {
    await Promise.all([
      this.db.from('accounts').upsert(snapshot.accounts.map(accountToRow)),
      this.db.from('candidates').upsert(snapshot.candidates.map(candidateToRow)),
      this.db.from('attempts').upsert(snapshot.attempts.map(attemptToRow)),
      this.db
        .from('certifications')
        .upsert(snapshot.certifications.map((c) => ({
          certificate_id: c.certificateId,
          candidate_id: c.candidateId,
          issued_at: c.issuedAt,
          payload: c,
        }))),
      this.saveSettings(snapshot.settings),
    ])
  }

  async upsertCandidate(candidate: Candidate): Promise<void> {
    const { error } = await this.db.from('candidates').upsert(candidateToRow(candidate))
    if (error) throw error
  }

  async upsertAccount(account: Account): Promise<void> {
    const { error } = await this.db.from('accounts').upsert(accountToRow(account))
    if (error) throw error
  }

  async appendAttempt(attempt: Attempt): Promise<void> {
    const { error } = await this.db.from('attempts').insert(attemptToRow(attempt))
    if (error) throw error
  }

  async saveSettings(settings: TrainerSettings): Promise<void> {
    const { error } = await this.db
      .from('trainer_settings')
      .upsert({ id: 'global', payload: settings, updated_at: new Date().toISOString() })
    if (error) throw error
  }

  async saveCertification(certification: Certification): Promise<void> {
    const { error } = await this.db.from('certifications').upsert({
      certificate_id: certification.certificateId,
      candidate_id: certification.candidateId,
      issued_at: certification.issuedAt,
      payload: certification,
    })
    if (error) throw error
  }

  async clear(): Promise<void> {
    // Intentionally not implemented for the hosted backend — destructive bulk
    // deletes belong in an admin migration, not in client code.
    throw new Error('clear() is disabled for the Supabase adapter')
  }
}

/* -------------------------------------------------------------------------- */
/*  Row mapping                                                                */
/* -------------------------------------------------------------------------- */

interface AccountRow {
  id: string
  email: string
  name: string
  role: Account['role']
  status: Account['status']
  password_hash: string
  password_salt: string
  candidate_id: string | null
  created_by: string | null
  created_at: string
  last_login_at: string | null
  must_change_password: boolean
}

function rowToAccount(row: AccountRow): Account {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    candidateId: row.candidate_id ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    mustChangePassword: row.must_change_password,
  }
}

function accountToRow(a: Account) {
  return {
    id: a.id,
    email: a.email,
    name: a.name,
    role: a.role,
    status: a.status,
    password_hash: a.passwordHash,
    password_salt: a.passwordSalt,
    candidate_id: a.candidateId ?? null,
    created_by: a.createdBy ?? null,
    created_at: a.createdAt,
    last_login_at: a.lastLoginAt,
    must_change_password: a.mustChangePassword,
  }
}

interface CandidateRow {
  id: string
  full_name: string
  candidate_id: string
  email: string
  batch: string
  location: string
  trainer_name: string
  created_at: string
  last_active_at: string
  is_demo: boolean | null
}

function rowToCandidate(row: CandidateRow): Candidate {
  return {
    id: row.id,
    fullName: row.full_name,
    candidateId: row.candidate_id,
    email: row.email,
    batch: row.batch,
    location: row.location,
    trainerName: row.trainer_name,
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
    isDemo: row.is_demo ?? false,
  }
}

function candidateToRow(c: Candidate) {
  return {
    id: c.id,
    full_name: c.fullName,
    candidate_id: c.candidateId,
    email: c.email,
    batch: c.batch,
    location: c.location,
    trainer_name: c.trainerName,
    created_at: c.createdAt,
    last_active_at: c.lastActiveAt,
    is_demo: c.isDemo ?? false,
  }
}

/** Promotes the columns the trainer dashboard filters/sorts on. */
function attemptToRow(a: Attempt) {
  return {
    id: a.id,
    candidate_id: a.candidateId,
    task_id: a.taskId,
    assignment_id: a.assignmentId,
    attempt_number: a.attemptNumber,
    mode: a.mode,
    score: a.score,
    passed: a.passed,
    wpm: a.wpm ?? null,
    accuracy: a.accuracy ?? null,
    data_accuracy: a.dataAccuracy ?? null,
    critical_data_accuracy: a.criticalDataAccuracy ?? null,
    multitasking_score: a.multitaskingScore ?? null,
    started_at: a.startedAt,
    completed_at: a.completedAt,
    payload: a,
  }
}
