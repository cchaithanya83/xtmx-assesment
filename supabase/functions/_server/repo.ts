import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import type {
  AssessmentResult,
  Attempt,
  Candidate,
  Certification,
  TrainerSettings,
} from '../_shared/types.ts'
import { buildCertification } from '../_shared/certification.ts'
import { DEFAULT_SETTINGS } from '../_shared/settings.ts'
import { notFound } from './http.ts'
import { rosterStatus } from '../_shared/certification.ts'

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

/**
 * Issues the certificate if every gate is met and none exists yet.
 *
 * Certification used to be evaluated ONLY on submission. That left anyone whose
 * status changed for any other reason stuck showing "locked" indefinitely: a
 * trainer lowering a threshold, an assignment being reset, or — as happened —
 * a scoring fix that raised an average past its gate. The candidate met every
 * requirement and still had no certificate, with no way to trigger one short of
 * sitting another attempt.
 *
 * So it is also checked whenever certification status is read. Idempotent: it
 * returns the stored record untouched once one exists, and issues nothing
 * unless `result.certified`.
 */
export async function ensureCertification(
  db: SupabaseClient,
  candidateId: string,
  result: AssessmentResult,
): Promise<Certification | null> {
  const existing = await getCertification(db, candidateId)
  if (existing) return existing
  if (!result.certified) return null

  const candidate = await getCandidate(db, candidateId).catch(() => null)
  if (!candidate) return null

  const cert = buildCertification(candidateId, candidate.fullName, result)
  if (!cert) return null

  await saveCertification(db, cert)
  return cert
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

export interface RosterSummary {
  total: number
  certified: number
  inProgress: number
  needsCoaching: number
  danger: number
  notCertified: number
  notStarted: number
}

/**
 * Counts every candidate matching the filters, not just the current page.
 *
 * The dashboard used to count over whatever rows the page happened to hold,
 * while sitting next to a cohort-wide "total candidates" card — so the Overview
 * and the Results page disagreed about how many people were certified, and both
 * were arguably right.
 *
 * Only the four aggregate columns the derivation needs are selected, so this
 * stays cheap over a large cohort, and the status itself comes from the same
 * shared function the UI uses.
 */
export async function rosterSummary(
  db: SupabaseClient,
  q: Pick<RosterQuery, 'search' | 'batch'>,
): Promise<RosterSummary> {
  // Rebuilt per page: a PostgREST builder issues its request when awaited, so
  // the same one cannot be reused for the next page. Ordered by id so paging
  // neither repeats nor skips a candidate.
  const page = (from: number, to: number) => {
    let query = db
      .from('candidate_roster')
      .select('certified, assignments_passed, total_attempts, final_score')

    if (q.search) {
      const safe = q.search.replace(/[,()]/g, ' ').trim()
      if (safe) {
        query = query.or(
          `full_name.ilike.%${safe}%,candidate_id.ilike.%${safe}%,email.ilike.%${safe}%`,
        )
      }
    }
    if (q.batch) query = query.eq('batch', q.batch)
    return query.order('id', { ascending: true }).range(from, to)
  }

  const summary: RosterSummary = {
    total: 0, certified: 0, inProgress: 0, needsCoaching: 0,
    danger: 0, notCertified: 0, notStarted: 0,
  }

  // PostgREST caps an unbounded select at 1000 rows, which would quietly
  // undercount a large cohort — the very bug this function exists to fix, just
  // at a higher threshold. Paging keeps the count honest at any size.
  const SIZE = 1000
  for (let offset = 0; ; offset += SIZE) {
    const { data, error } = await page(offset, offset + SIZE - 1)
    if (error) throw error
    const rows = data ?? []

    for (const r of rows) {
      summary.total += 1
      const status = rosterStatus({
        certified: Boolean(r.certified),
        assignmentsPassed: Number(r.assignments_passed ?? 0),
        totalAttempts: Number(r.total_attempts ?? 0),
        finalScore: Number(r.final_score ?? 0),
      })
      if (status === 'certified') summary.certified += 1
      else if (status === 'in-progress') summary.inProgress += 1
      else if (status === 'needs-coaching') summary.needsCoaching += 1
      else if (status === 'danger') summary.danger += 1
      else if (status === 'not-certified') summary.notCertified += 1
      else summary.notStarted += 1
    }

    if (rows.length < SIZE) break
  }
  return summary
}

/** Distinct batches, for the trainer filter dropdown. */
export async function listBatches(db: SupabaseClient): Promise<string[]> {
  const { data, error } = await db.from('candidates').select('batch')
  if (error) throw error
  return [...new Set((data ?? []).map((r) => r.batch as string).filter(Boolean))].sort()
}
