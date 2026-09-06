import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import type {
  Attempt,
  Candidate,
  Certification,
  TrainerSettings,
} from '../_shared/types.ts'
import { DEFAULT_SETTINGS } from '../_shared/settings.ts'
import { notFound } from './http.ts'

/**
 * Database access.
 *
 * Every read here is scoped by an id the *server* resolved, never one a client
 * supplied. The `select` lists are explicit so a column added later cannot leak
 * into a response by accident.
 */

/* -------------------------------------------------------------------------- */
/*  Candidates                                                                 */
/* -------------------------------------------------------------------------- */

const CANDIDATE_COLUMNS =
  'id, full_name, candidate_id, email, batch, location, trainer_name, created_at, last_active_at, is_demo'

export function rowToCandidate(row: Record<string, unknown>): Candidate {
  return {
    id: row.id as string,
    fullName: row.full_name as string,
    candidateId: row.candidate_id as string,
    email: row.email as string,
    batch: (row.batch as string) ?? '',
    location: (row.location as string) ?? '',
    trainerName: (row.trainer_name as string) ?? '',
    createdAt: row.created_at as string,
    lastActiveAt: row.last_active_at as string,
    isDemo: Boolean(row.is_demo),
  }
}

export function candidateToRow(c: Candidate) {
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

export async function getCandidate(db: SupabaseClient, id: string): Promise<Candidate> {
  const { data, error } = await db
    .from('candidates')
    .select(CANDIDATE_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) throw notFound('Candidate not found')
  return rowToCandidate(data)
}

export async function touchCandidate(db: SupabaseClient, id: string): Promise<void> {
  await db.from('candidates').update({ last_active_at: new Date().toISOString() }).eq('id', id)
}

/* -------------------------------------------------------------------------- */
/*  Attempts                                                                   */
/* -------------------------------------------------------------------------- */

export function attemptToRow(a: Attempt, sessionId: string | null) {
  return {
    id: a.id,
    candidate_id: a.candidateId,
    session_id: sessionId,
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

/** Full attempt history for ONE candidate. Never called without a resolved id. */
export async function listAttempts(
  db: SupabaseClient,
  candidateId: string,
): Promise<Attempt[]> {
  const { data, error } = await db
    .from('attempts')
    .select('payload')
    .eq('candidate_id', candidateId)
    .order('completed_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r) => r.payload as Attempt)
}

/** Attempt count for one assignment — drives the next attempt number. */
export async function countAttempts(
  db: SupabaseClient,
  candidateId: string,
  taskId: number,
  assignmentId: number,
  mode: string,
): Promise<number> {
  const { count, error } = await db
    .from('attempts')
    .select('id', { count: 'exact', head: true })
    .eq('candidate_id', candidateId)
    .eq('task_id', taskId)
    .eq('assignment_id', assignmentId)
    .eq('mode', mode)
  if (error) throw error
  return count ?? 0
}

/* -------------------------------------------------------------------------- */
/*  Settings                                                                   */
/* -------------------------------------------------------------------------- */

export async function getSettings(db: SupabaseClient): Promise<TrainerSettings> {
  const { data, error } = await db
    .from('trainer_settings')
    .select('payload')
    .eq('id', 'global')
    .maybeSingle()
  if (error) throw error
  // Merge over defaults so a setting added in a later release is never missing.
  return { ...DEFAULT_SETTINGS, ...((data?.payload as TrainerSettings) ?? {}) }
}

export async function saveSettings(
  db: SupabaseClient,
  settings: TrainerSettings,
): Promise<void> {
  const { error } = await db
    .from('trainer_settings')
    .upsert({ id: 'global', payload: settings, updated_at: new Date().toISOString() })
  if (error) throw error
}

/* -------------------------------------------------------------------------- */
/*  Certifications                                                             */
/* -------------------------------------------------------------------------- */

export async function getCertification(
  db: SupabaseClient,
  candidateId: string,
): Promise<Certification | null> {
  const { data, error } = await db
    .from('certifications')
    .select('payload')
    .eq('candidate_id', candidateId)
    .maybeSingle()
  if (error) throw error
  return (data?.payload as Certification) ?? null
}

export async function saveCertification(
  db: SupabaseClient,
  cert: Certification,
): Promise<void> {
  const { error } = await db.from('certifications').upsert({
    certificate_id: cert.certificateId,
    candidate_id: cert.candidateId,
    issued_at: cert.issuedAt,
    payload: cert,
  })
  if (error) throw error
}

/* -------------------------------------------------------------------------- */
/*  Roster (staff only) — aggregated in Postgres, not in the browser           */
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

export interface RosterQuery {
  search?: string
  batch?: string
  limit: number
  offset: number
  sort: string
  direction: 'asc' | 'desc'
}

const SORT_COLUMNS: Record<string, string> = {
  name: 'full_name',
  score: 'final_score',
  wpm: 'avg_wpm',
  accuracy: 'avg_accuracy',
  progress: 'assignments_passed',
  attempts: 'total_attempts',
  active: 'last_active_at',
}

export async function queryRoster(
  db: SupabaseClient,
  q: RosterQuery,
): Promise<{ rows: RosterRow[]; total: number }> {
  let query = db.from('candidate_roster').select('*', { count: 'exact' })

  if (q.search) {
    // Escape PostgREST's `or` filter delimiters before interpolating.
    const safe = q.search.replace(/[,()]/g, ' ').trim()
    if (safe) {
      query = query.or(
        `full_name.ilike.%${safe}%,candidate_id.ilike.%${safe}%,email.ilike.%${safe}%`,
      )
    }
  }
  if (q.batch) query = query.eq('batch', q.batch)

  const column = SORT_COLUMNS[q.sort] ?? 'final_score'
  query = query
    .order(column, { ascending: q.direction === 'asc' })
    .range(q.offset, q.offset + q.limit - 1)

  const { data, error, count } = await query
  if (error) throw error

  return {
    total: count ?? 0,
    rows: (data ?? []).map((r) => ({
      id: r.id,
      candidateId: r.candidate_id,
      fullName: r.full_name,
      email: r.email,
      batch: r.batch,
      location: r.location,
      trainerName: r.trainer_name,
      isDemo: Boolean(r.is_demo),
      lastActiveAt: r.last_active_at,
      task1Average: Number(r.task1_avg ?? 0),
      task2Average: Number(r.task2_avg ?? 0),
      finalScore: Number(r.final_score ?? 0),
      avgWpm: Number(r.avg_wpm ?? 0),
      avgAccuracy: Number(r.avg_accuracy ?? 0),
      criticalDataAccuracy: Number(r.critical_accuracy ?? 0),
      multitaskingScore: Number(r.multitasking_score ?? 0),
      assignmentsPassed: Number(r.assignments_passed ?? 0),
      totalAttempts: Number(r.total_attempts ?? 0),
      certified: Boolean(r.certified),
      certificateId: r.certificate_id ?? null,
    })),
  }
}

/** Distinct batches, for the trainer filter dropdown. */
export async function listBatches(db: SupabaseClient): Promise<string[]> {
  const { data, error } = await db.from('candidates').select('batch')
  if (error) throw error
  return [...new Set((data ?? []).map((r) => r.batch as string).filter(Boolean))].sort()
}
