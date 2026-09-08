import {
  authenticate,
  adminClient,
  requireAdmin,
  requireStaff,
  resolveCandidateId,
  rowToProfile,
  type Caller,
} from '../_server/auth.ts'
import {
  ApiError,
  badRequest,
  conflict,
  forbidden,
  json,
  notFound,
  preflight,
  readJson,
  Router,
  unauthorized,
} from '../_server/http.ts'
import {
  attemptToRow,
  candidateToRow,
  getCandidate,
  getCertification,
  getSettings,
  listAttempts,
  listBatches,
  queryRoster,
  saveSettings,
  touchCandidate,
} from '../_server/repo.ts'
import { abandonAssessment, startAssessment, submitAssessment } from './assessments.ts'
import {
  listAllPassages,
  listPools,
  resolveLevelFields,
  validateLevelFields,
  validatePassage,
  validatePool,
} from '../_server/content.ts'
import { DEFAULT_LEVEL_FIELDS, POOL_DEFAULTS, SELECTABLE_FIELDS } from '../_shared/content.ts'
import { PASSAGE_POOLS } from '../_shared/passages.ts'
import { computeAssessmentResult, deriveProgress } from '../_shared/certification.ts'
import { getAssignment } from '../_shared/tasks.ts'
import { buildSeedWorkspace } from '../_shared/seed.ts'
import { uid } from '../_shared/core.ts'
import type { AccountRole, TrainerSettings } from '../_shared/types.ts'

/**
 * XTransMatrix API.
 *
 * The single entry point between the browser and the database. The browser has
 * no direct database access at all (RLS denies `anon` and `authenticated`
 * outright), so every rule below is the real rule, not a suggestion the client
 * could route around.
 *
 * Route naming: everything under /me is implicitly scoped to the caller and
 * ignores any candidate id in the request. Everything under /trainer requires a
 * staff role; everything under /admin requires an administrator.
 */

const BASE = '/api'

/* -------------------------------------------------------------------------- */
/*  Router                                                                     */
/* -------------------------------------------------------------------------- */

const router = new Router<Caller>()

/* ---- Identity ---------------------------------------------------------- */

/**
 * Everything the app needs on boot, for the signed-in user only:
 * their profile, their candidate record (if any), and the active thresholds.
 */
router.get('/me', async ({ ctx }) => {
  const { db, profile } = ctx
  const settings = await getSettings(db)
  const candidate = profile.candidateId
    ? await getCandidate(db, profile.candidateId).catch(() => null)
    : null

  await db
    .from('profiles')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', profile.id)

  return json({ profile, candidate, settings })
})

/**
 * The candidate's own assessment state: progress per assignment, aggregate
 * result and certificate. Derived on the server from that candidate's rows.
 */
router.get('/me/progress', async ({ ctx }) => {
  const candidateId = resolveCandidateId(ctx)
  const settings = await getSettings(ctx.db)
  const attempts = await listAttempts(ctx.db, candidateId)

  return json({
    progress: deriveProgress(attempts, {
      requireSequentialUnlock: settings.requireSequentialUnlock,
      requireTask1BeforeTask2: settings.requireTask1BeforeTask2,
      minAverageWpm: settings.minAverageWpm,
    }),
    result: computeAssessmentResult(candidateId, attempts, settings),
    certification: await getCertification(ctx.db, candidateId),
  })
})

/** The caller's own attempt history. A candidate cannot widen this. */
router.get('/me/attempts', async ({ ctx }) => {
  const candidateId = resolveCandidateId(ctx)
  return json({ attempts: await listAttempts(ctx.db, candidateId) })
})

/** Clears the forced-password-change flag after the client updated the password. */
router.post('/me/password', async ({ ctx, body }) => {
  const { currentPassword, newPassword } = await body<{
    currentPassword?: string
    newPassword?: string
  }>()

  if (!newPassword || newPassword.length < 8) {
    throw badRequest('New password must be at least 8 characters')
  }
  if (!/[a-zA-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
    throw badRequest('New password must contain a letter and a number')
  }
  if (!currentPassword) throw badRequest('Current password is required')

  // Prove the caller knows the existing password before changing it — a stolen
  // access token alone must not be enough to take over an account.
  const verifier = adminClient()
  const { error: verifyError } = await verifier.auth.signInWithPassword({
    email: ctx.profile.email,
    password: currentPassword,
  })
  if (verifyError) throw badRequest('Your current password is not correct')

  const { error } = await ctx.db.auth.admin.updateUserById(ctx.profile.id, {
    password: newPassword,
  })
  if (error) throw badRequest(error.message)

  await ctx.db
    .from('profiles')
    .update({ must_change_password: false })
    .eq('id', ctx.profile.id)

  return json({ ok: true })
})

/* ---- Assessments ------------------------------------------------------- */

/**
 * Issues a single-use assessment session.
 *
 * The server picks the passage (Task 1) or generates the scenario (Task 2) and
 * stores it, then returns only what the client needs to render and play the
 * assessment. For Task 2 the `expected` answer for each field is stripped from
 * the response — it stays on the server until submission.
 */
router.post('/assessments/start', async ({ ctx, body }) => {
  const input = await body<{ taskId: number; assignmentId: number; mode?: string }>()
  return json(await startAssessment(ctx, input))
})

/**
 * Scores and records an attempt.
 *
 * The score is computed here, from the stored session, using elapsed time the
 * server measured. A client cannot submit a score, and cannot submit twice
 * against the same session.
 */
router.post('/assessments/submit', async ({ ctx, body }) => {
  const input = await body<Record<string, unknown>>()
  return json(await submitAssessment(ctx, input))
})

/**
 * Releases a session the candidate walked away from, so the trainer's live view
 * stops showing them and they are free to restart.
 */
router.post('/assessments/abandon', async ({ ctx, body }) => {
  const input = await body<{ sessionId?: string }>()
  return json(await abandonAssessment(ctx, input))
})

/* ---- Settings ---------------------------------------------------------- */

/** Everyone signed in may read the thresholds; the UI displays them. */
router.get('/settings', async ({ ctx }) => json({ settings: await getSettings(ctx.db) }))

router.patch('/settings', async ({ ctx, body }) => {
  requireStaff(ctx)
  const patch = await body<Partial<TrainerSettings>>()
  const merged = { ...(await getSettings(ctx.db)), ...patch }
  await saveSettings(ctx.db, merged)
  return json({ settings: merged })
})

/* ---- Trainer ----------------------------------------------------------- */

/**
 * Paginated, server-aggregated roster. Replaces the previous approach of
 * shipping every attempt to the browser and reducing it there.
 */
router.get('/trainer/roster', async ({ ctx, url }) => {
  requireStaff(ctx)
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50) || 50, 200)
  const offset = Math.max(Number(url.searchParams.get('offset') ?? 0) || 0, 0)
  const direction = url.searchParams.get('direction') === 'asc' ? 'asc' : 'desc'

  const { rows, total } = await queryRoster(ctx.db, {
    search: url.searchParams.get('search') ?? undefined,
    batch: url.searchParams.get('batch') ?? undefined,
    sort: url.searchParams.get('sort') ?? 'score',
    direction,
    limit,
    offset,
  })

  const settings = await getSettings(ctx.db)
  return json({ rows, total, limit, offset, settings })
})

/**
 * Live monitoring.
 *
 * Genuine server-side state: every assessment session that has been issued and
 * not yet submitted or expired. Unlike the previous in-browser implementation,
 * this shows candidates working on any machine, and the client simply polls it.
 */
router.get('/trainer/live', async ({ ctx }) => {
  requireStaff(ctx)
  const { data, error } = await ctx.db
    .from('assessment_sessions')
    .select('id, candidate_id, task_id, assignment_id, attempt_number, mode, started_at, expires_at')
    .is('consumed_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('started_at', { ascending: false })
    .limit(100)
  if (error) throw error

  // `expires_at` carries a generous submit grace, so it is far too loose for a
  // live view — a closed tab would linger for another quarter of an hour. A
  // session is only "live" while it is still inside its own assignment time
  // limit, plus a minute of slack for a slow submit.
  const now = Date.now()
  const LIVE_SLACK_MS = 60_000
  const fresh = (data ?? []).filter((r) => {
    const limit = getAssignment(r.task_id as number, r.assignment_id as number).timeLimitSeconds
    return now - new Date(r.started_at as string).getTime() < limit * 1000 + LIVE_SLACK_MS
  })

  // Opportunistic housekeeping: clear the ones that timed out unsubmitted so
  // the table does not fill with ghosts.
  const stale = (data ?? []).filter((r) => !fresh.includes(r)).map((r) => r.id as string)
  if (stale.length) {
    ctx.db.from('assessment_sessions').delete().in('id', stale).is('consumed_at', null)
      .then(() => {})
      .catch(() => {})
  }

  const rows = fresh
  const ids = [...new Set(rows.map((r) => r.candidate_id as string))]
  const names = new Map<string, { fullName: string; candidateId: string; batch: string }>()

  if (ids.length) {
    const { data: cands } = await ctx.db
      .from('candidates')
      .select('id, full_name, candidate_id, batch')
      .in('id', ids)
    for (const c of cands ?? []) {
      names.set(c.id as string, {
        fullName: c.full_name as string,
        candidateId: c.candidate_id as string,
        batch: c.batch as string,
      })
    }
  }

  return json({
    sessions: rows.map((r) => ({
      sessionId: r.id,
      candidateId: r.candidate_id,
      candidateName: names.get(r.candidate_id as string)?.fullName ?? 'Candidate',
      candidateCode: names.get(r.candidate_id as string)?.candidateId ?? '',
      batch: names.get(r.candidate_id as string)?.batch ?? '',
      taskId: r.task_id,
      assignmentId: r.assignment_id,
      attemptNumber: r.attempt_number,
      mode: r.mode,
      startedAt: r.started_at,
      expiresAt: r.expires_at,
    })),
  })
})

router.get('/trainer/batches', async ({ ctx }) => {
  requireStaff(ctx)
  return json({ batches: await listBatches(ctx.db) })
})

/** Full drill-down for one candidate. Staff only. */
router.get('/trainer/candidates/:candidateId', async ({ ctx, params }) => {
  requireStaff(ctx)
  const candidate = await getCandidate(ctx.db, params.candidateId)
  const settings = await getSettings(ctx.db)
  const attempts = await listAttempts(ctx.db, candidate.id)

  return json({
    candidate,
    attempts,
    progress: deriveProgress(attempts, {
      requireSequentialUnlock: settings.requireSequentialUnlock,
      requireTask1BeforeTask2: settings.requireTask1BeforeTask2,
      minAverageWpm: settings.minAverageWpm,
    }),
    result: computeAssessmentResult(candidate.id, attempts, settings),
    certification: await getCertification(ctx.db, candidate.id),
  })
})

/** Deletes one assignment's attempts, or all of them, for a candidate. */
router.post('/trainer/candidates/:candidateId/reset', async ({ ctx, params, body }) => {
  requireStaff(ctx)
  const { taskId, assignmentId } = await body<{ taskId?: number; assignmentId?: number }>()
  const candidateId = params.candidateId

  let query = ctx.db.from('attempts').delete().eq('candidate_id', candidateId)
  if (taskId && assignmentId) {
    query = query.eq('task_id', taskId).eq('assignment_id', assignmentId)
  }
  const { error } = await query
  if (error) throw error

  // Any certificate was issued against attempts that no longer exist.
  await ctx.db.from('certifications').delete().eq('candidate_id', candidateId)
  return json({ ok: true })
})

/* ---- Admin: user management -------------------------------------------- */

router.get('/admin/users', async ({ ctx }) => {
  requireAdmin(ctx)
  const { data, error } = await ctx.db
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw error
  return json({ users: (data ?? []).map(rowToProfile) })
})

/**
 * Creates a trainer or administrator.
 *
 * This is the only path to a staff role — there is no self-service route, and
 * the call needs the service role key, which exists only here on the server.
 */
router.post('/admin/users', async ({ ctx, body }) => {
  requireAdmin(ctx)
  const { name, email, password, role } = await body<{
    name?: string
    email?: string
    password?: string
    role?: AccountRole
  }>()

  if (!name?.trim()) throw badRequest('Name is required')
  if (!email || !isEmail(email)) throw badRequest('A valid email address is required')
  if (!password || password.length < 8) throw badRequest('Password must be at least 8 characters')
  if (role !== 'trainer' && role !== 'admin') throw badRequest('Role must be trainer or admin')

  const created = await createUser(ctx, {
    email,
    password,
    name: name.trim(),
    role,
    mustChangePassword: true,
    createdBy: ctx.profile.id,
  })
  return json({ user: created }, 201)
})

router.patch('/admin/users/:id', async ({ ctx, params, body }) => {
  requireAdmin(ctx)
  const patch = await body<{ name?: string; email?: string; role?: AccountRole; status?: string }>()

  const target = await getProfile(ctx, params.id)

  // Never let the last active administrator be demoted or disabled — that would
  // lock the platform out of its own user management.
  const losingAdmin =
    target.role === 'admin' &&
    ((patch.role && patch.role !== 'admin') || patch.status === 'disabled')
  if (losingAdmin && (await countActiveAdmins(ctx)) <= 1) {
    throw conflict('You cannot demote or disable the only remaining administrator')
  }

  const update: Record<string, unknown> = {}
  if (patch.name !== undefined) update.name = patch.name.trim()
  if (patch.role !== undefined) update.role = patch.role
  if (patch.status !== undefined) update.status = patch.status
  if (patch.email !== undefined) {
    if (!isEmail(patch.email)) throw badRequest('A valid email address is required')
    update.email = patch.email.toLowerCase().trim()
    const { error } = await ctx.db.auth.admin.updateUserById(params.id, {
      email: update.email as string,
    })
    if (error) throw badRequest(error.message)
  }

  const { data, error } = await ctx.db
    .from('profiles')
    .update(update)
    .eq('id', params.id)
    .select('*')
    .maybeSingle()
  if (error) throw error
  if (!data) throw notFound('User not found')

  return json({ user: rowToProfile(data) })
})

/** Issues a temporary password the holder must replace at next sign-in. */
router.post('/admin/users/:id/password', async ({ ctx, params, body }) => {
  requireAdmin(ctx)
  const { password } = await body<{ password?: string }>()
  if (!password || password.length < 8) throw badRequest('Password must be at least 8 characters')

  await getProfile(ctx, params.id)

  const { error } = await ctx.db.auth.admin.updateUserById(params.id, { password })
  if (error) throw badRequest(error.message)

  await ctx.db
    .from('profiles')
    .update({ must_change_password: params.id !== ctx.profile.id })
    .eq('id', params.id)

  return json({ ok: true })
})

router.delete('/admin/users/:id', async ({ ctx, params }) => {
  requireAdmin(ctx)
  if (params.id === ctx.profile.id) throw conflict('You cannot remove your own account')

  const target = await getProfile(ctx, params.id)
  if (target.role === 'admin' && (await countActiveAdmins(ctx)) <= 1) {
    throw conflict('You cannot remove the only remaining administrator')
  }

  // Deleting the auth user cascades to `profiles`. Candidate records and their
  // attempt history are deliberately retained for the trainer's audit trail.
  const { error } = await ctx.db.auth.admin.deleteUser(params.id)
  if (error) throw badRequest(error.message)
  return json({ ok: true })
})

/** Regenerates or clears the demo cohort. Admin only. */
router.post('/admin/demo-data', async ({ ctx, body }) => {
  requireAdmin(ctx)
  const { action } = await body<{ action?: 'seed' | 'clear' }>()

  const { data: demos } = await ctx.db.from('candidates').select('id').eq('is_demo', true)
  const demoIds = (demos ?? []).map((d) => d.id as string)
  if (demoIds.length) {
    await ctx.db.from('attempts').delete().in('candidate_id', demoIds)
    await ctx.db.from('certifications').delete().in('candidate_id', demoIds)
    await ctx.db.from('candidates').delete().in('id', demoIds)
  }

  if (action === 'clear') return json({ ok: true, candidates: 0 })

  const settings = await getSettings(ctx.db)
  const seeded = buildSeedWorkspace(settings)

  const { error: cErr } = await ctx.db
    .from('candidates')
    .insert(seeded.candidates.map(candidateToRow))
  if (cErr) throw cErr

  // Chunked so a large seed cannot exceed the statement size limit.
  for (let i = 0; i < seeded.attempts.length; i += 200) {
    const chunk = seeded.attempts.slice(i, i + 200).map((a) => attemptToRow(a, null))
    const { error } = await ctx.db.from('attempts').insert(chunk)
    if (error) throw error
  }

  return json({ ok: true, candidates: seeded.candidates.length, attempts: seeded.attempts.length })
})

/* ---- Admin: assessment content ----------------------------------------- */

/**
 * Everything the Content screen needs, in one call: passages, data pools, the
 * per-level field roster, and the catalogue of selectable fields.
 *
 * Admin-only. Content changes alter what certification means, so they sit with
 * the same role that manages accounts — trainers keep threshold configuration.
 */
router.get('/admin/content', async ({ ctx }) => {
  requireAdmin(ctx)
  const [passages, pools, levelFields] = await Promise.all([
    listAllPassages(ctx.db),
    listPools(ctx.db),
    resolveLevelFields(ctx.db),
  ])
  return json({
    passages,
    pools: pools.map((p) => ({
      ...p,
      hint: POOL_DEFAULTS[p.key as keyof typeof POOL_DEFAULTS]?.hint ?? '',
    })),
    levelFields,
    selectableFields: SELECTABLE_FIELDS,
  })
})

router.post('/admin/content/passages', async ({ ctx, body }) => {
  requireAdmin(ctx)
  const input = await body<{
    assignmentId?: number
    label?: string
    kind?: string
    text?: string
  }>()
  validatePassage(input)

  const { data, error } = await ctx.db
    .from('passages')
    .insert({
      id: `p_${uid()}`,
      assignment_id: input.assignmentId,
      label: input.label!.trim(),
      kind: input.kind ?? 'prose',
      body: input.text!,
      active: true,
      sort_order: 999,
      updated_by: ctx.profile.id,
    })
    .select('*')
    .maybeSingle()
  if (error) throw error
  return json({ passage: data }, 201)
})

router.patch('/admin/content/passages/:id', async ({ ctx, params, body }) => {
  requireAdmin(ctx)
  const input = await body<{
    label?: string
    kind?: string
    text?: string
    active?: boolean
    sortOrder?: number
  }>()

  // Only validate the text when it is actually being changed.
  if (input.text !== undefined || input.label !== undefined) {
    const { data: current } = await ctx.db
      .from('passages')
      .select('label, body')
      .eq('id', params.id)
      .maybeSingle()
    validatePassage({
      label: input.label ?? (current?.label as string),
      text: input.text ?? (current?.body as string),
      kind: input.kind,
    })
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: ctx.profile.id }
  if (input.label !== undefined) patch.label = input.label.trim()
  if (input.kind !== undefined) patch.kind = input.kind
  if (input.text !== undefined) patch.body = input.text
  if (input.active !== undefined) patch.active = input.active
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder

  const { data, error } = await ctx.db
    .from('passages')
    .update(patch)
    .eq('id', params.id)
    .select('*')
    .maybeSingle()
  if (error) throw error
  if (!data) throw notFound('Passage not found')
  return json({ passage: data })
})

/**
 * Removes a passage.
 *
 * Refuses if it would leave an assignment with fewer than two active passages —
 * a single-passage pool means every retry serves the same text, which defeats
 * the point of rotation.
 */
router.delete('/admin/content/passages/:id', async ({ ctx, params }) => {
  requireAdmin(ctx)

  const { data: target } = await ctx.db
    .from('passages')
    .select('assignment_id, active')
    .eq('id', params.id)
    .maybeSingle()
  if (!target) throw notFound('Passage not found')

  if (target.active) {
    const { count } = await ctx.db
      .from('passages')
      .select('id', { count: 'exact', head: true })
      .eq('assignment_id', target.assignment_id)
      .eq('active', true)
    if ((count ?? 0) <= 2) {
      throw conflict(
        'Keep at least two active passages per assignment, so retries do not repeat the same text.',
      )
    }
  }

  const { error } = await ctx.db.from('passages').delete().eq('id', params.id)
  if (error) throw error
  return json({ ok: true })
})

router.patch('/admin/content/pools/:key', async ({ ctx, params, body }) => {
  requireAdmin(ctx)
  const { items } = await body<{ items?: unknown }>()
  validatePool(params.key, items)

  const def = POOL_DEFAULTS[params.key as keyof typeof POOL_DEFAULTS]
  const { error } = await ctx.db.from('content_pools').upsert({
    key: params.key,
    label: def.label,
    kind: def.kind,
    items: (items as string[]).map((v) => v.trim()),
    updated_at: new Date().toISOString(),
    updated_by: ctx.profile.id,
  })
  if (error) throw error
  return json({ ok: true })
})

router.patch('/admin/content/level-fields/:level', async ({ ctx, params, body }) => {
  requireAdmin(ctx)
  const { fieldKeys } = await body<{ fieldKeys?: unknown }>()
  validateLevelFields(params.level, fieldKeys)

  const { error } = await ctx.db.from('level_fields').upsert({
    level: Number(params.level),
    field_keys: fieldKeys,
    updated_at: new Date().toISOString(),
    updated_by: ctx.profile.id,
  })
  if (error) throw error
  return json({ ok: true })
})

/** Restores one content area to the values shipped with the release. */
router.post('/admin/content/reset', async ({ ctx, body }) => {
  requireAdmin(ctx)
  const { target } = await body<{ target?: 'passages' | 'pools' | 'levelFields' }>()

  if (target === 'passages') {
    await ctx.db.from('passages').delete().neq('id', '')
    const rows: Record<string, unknown>[] = []
    for (const [assignmentId, pool] of Object.entries(PASSAGE_POOLS)) {
      pool.forEach((p, i) => {
        rows.push({
          id: p.id,
          assignment_id: Number(assignmentId),
          label: p.label,
          kind: p.kind,
          body: p.text,
          active: true,
          sort_order: i,
          updated_by: ctx.profile.id,
        })
      })
    }
    const { error } = await ctx.db.from('passages').insert(rows)
    if (error) throw error
    return json({ ok: true, restored: rows.length })
  }

  if (target === 'pools') {
    const { error } = await ctx.db.from('content_pools').upsert(
      Object.entries(POOL_DEFAULTS).map(([key, def]) => ({
        key,
        label: def.label,
        kind: def.kind,
        items: def.items,
        updated_at: new Date().toISOString(),
        updated_by: ctx.profile.id,
      })),
    )
    if (error) throw error
    return json({ ok: true, restored: Object.keys(POOL_DEFAULTS).length })
  }

  if (target === 'levelFields') {
    const { error } = await ctx.db.from('level_fields').upsert(
      Object.entries(DEFAULT_LEVEL_FIELDS).map(([level, keys]) => ({
        level: Number(level),
        field_keys: keys,
        updated_at: new Date().toISOString(),
        updated_by: ctx.profile.id,
      })),
    )
    if (error) throw error
    return json({ ok: true, restored: 5 })
  }

  throw badRequest('target must be passages, pools or levelFields')
})

/* ---- Bootstrap --------------------------------------------------------- */

/**
 * Creates the very first administrator.
 *
 * Unauthenticated by necessity, but self-closing: once any admin profile
 * exists this route refuses forever. It is how a fresh deployment gets its
 * first login without shipping a default password in the source.
 */
async function handleBootstrap(req: Request): Promise<Response> {
  const db = adminClient()
  const { count, error: countError } = await db
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')

  // A failed count must not read as "no administrators exist" — that would let
  // bootstrap proceed against a schema that has not been applied.
  if (countError) {
    throw new ApiError(
      503,
      'The database schema is not initialised. Run supabase/schema.sql first.',
      'schema-missing',
    )
  }
  if ((count ?? 0) > 0) {
    throw conflict('An administrator already exists. Ask them to create your account.')
  }

  const { name, email, password } = await readJson<{
    name?: string
    email?: string
    password?: string
  }>(req)

  if (!name?.trim()) throw badRequest('Name is required')
  if (!email || !isEmail(email)) throw badRequest('A valid email address is required')
  if (!password || password.length < 8) throw badRequest('Password must be at least 8 characters')

  const { data, error } = await db.auth.admin.createUser({
    email: email.toLowerCase().trim(),
    password,
    email_confirm: true,
  })
  if (error || !data.user) throw badRequest(error?.message ?? 'Could not create the administrator')

  const profile = {
    id: data.user.id,
    email: email.toLowerCase().trim(),
    name: name.trim(),
    role: 'admin' as const,
    status: 'active' as const,
    must_change_password: false,
  }
  const { error: pErr } = await db.from('profiles').insert(profile)
  if (pErr) {
    await db.auth.admin.deleteUser(data.user.id)
    throw pErr
  }

  return json({ ok: true }, 201)
}

/** Reports whether the deployment still needs its first administrator. */
async function handleBootstrapStatus(): Promise<Response> {
  const db = adminClient()
  const { count, error } = await db
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')

  // Distinguish "no admin yet" from "no schema yet"; they need different fixes.
  if (error) {
    return json(
      { needsBootstrap: false, schemaReady: false, error: 'Database schema is not initialised' },
      503,
    )
  }
  return json({ needsBootstrap: (count ?? 0) === 0, schemaReady: true })
}

/**
 * Trainer names, for the sign-up form's trainer dropdown.
 *
 * Unauthenticated by necessity — a candidate has to pick a trainer before they
 * have an account. Deliberately minimal: **names only**. No ids, no emails, no
 * roles, and disabled staff are excluded. That is the smallest disclosure that
 * makes the form work, and a name is already on the training-room whiteboard.
 */
async function handleTrainerNames(): Promise<Response> {
  const db = adminClient()
  const { data, error } = await db
    .from('profiles')
    .select('name')
    .in('role', ['trainer', 'admin'])
    .eq('status', 'active')
    .order('name', { ascending: true })

  // A missing schema or a fresh install must not block registration — the form
  // falls back to free text when this comes back empty.
  if (error) return json({ trainers: [] })

  const names = [...new Set((data ?? []).map((r) => (r.name as string)?.trim()).filter(Boolean))]
  return json({ trainers: names })
}

/* ---- Candidate self-registration --------------------------------------- */

/**
 * Public sign-up, candidates only.
 *
 * Creates the auth user, the candidate record and the linking profile as one
 * unit, rolling back the auth user if either insert fails so a half-registered
 * account cannot block the email address.
 */
async function handleRegister(req: Request): Promise<Response> {
  const input = await readJson<{
    fullName?: string
    candidateId?: string
    email?: string
    password?: string
    batch?: string
    location?: string
    trainerName?: string
  }>(req)

  if (!input.fullName?.trim()) throw badRequest('Full name is required')
  if (!input.candidateId?.trim()) throw badRequest('Candidate ID is required')
  if (!input.email || !isEmail(input.email)) throw badRequest('A valid email address is required')
  if (!input.password || input.password.length < 8) {
    throw badRequest('Password must be at least 8 characters')
  }
  if (!/[a-zA-Z]/.test(input.password) || !/\d/.test(input.password)) {
    throw badRequest('Password must contain a letter and a number')
  }

  const db = adminClient()
  const email = input.email.toLowerCase().trim()
  const candidateIdUpper = input.candidateId.trim().toUpperCase()

  const { data: clash } = await db
    .from('candidates')
    .select('id')
    .ilike('candidate_id', candidateIdUpper)
    .maybeSingle()
  if (clash) throw conflict('That Candidate ID is already registered', 'candidate-id-taken')

  const { data: auth, error: authError } = await db.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
  })
  if (authError || !auth.user) {
    const taken = (authError?.message ?? '').toLowerCase().includes('already')
    throw taken
      ? conflict('An account with that email already exists', 'email-taken')
      : badRequest(authError?.message ?? 'Could not create the account')
  }

  const now = new Date().toISOString()
  const candidate = {
    id: uid('cnd'),
    full_name: input.fullName.trim(),
    candidate_id: candidateIdUpper,
    email,
    batch: input.batch ?? '',
    location: input.location ?? '',
    trainer_name: input.trainerName ?? '',
    created_at: now,
    last_active_at: now,
    is_demo: false,
  }

  const { error: cErr } = await db.from('candidates').insert(candidate)
  if (cErr) {
    await db.auth.admin.deleteUser(auth.user.id)
    throw cErr
  }

  const { error: pErr } = await db.from('profiles').insert({
    id: auth.user.id,
    email,
    name: candidate.full_name,
    role: 'candidate',
    status: 'active',
    candidate_id: candidate.id,
    created_at: now,
    must_change_password: false,
  })
  if (pErr) {
    await db.from('candidates').delete().eq('id', candidate.id)
    await db.auth.admin.deleteUser(auth.user.id)
    throw pErr
  }

  return json({ ok: true }, 201)
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())
}

async function getProfile(ctx: Caller, id: string) {
  const { data, error } = await ctx.db.from('profiles').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) throw notFound('User not found')
  return rowToProfile(data)
}

async function countActiveAdmins(ctx: Caller): Promise<number> {
  const { count } = await ctx.db
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')
    .eq('status', 'active')
  return count ?? 0
}

async function createUser(
  ctx: Caller,
  input: {
    email: string
    password: string
    name: string
    role: AccountRole
    mustChangePassword: boolean
    createdBy: string
  },
) {
  const email = input.email.toLowerCase().trim()
  const { data, error } = await ctx.db.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
  })
  if (error || !data.user) {
    const taken = (error?.message ?? '').toLowerCase().includes('already')
    throw taken
      ? conflict('An account with that email already exists', 'email-taken')
      : badRequest(error?.message ?? 'Could not create the account')
  }

  const { data: row, error: pErr } = await ctx.db
    .from('profiles')
    .insert({
      id: data.user.id,
      email,
      name: input.name,
      role: input.role,
      status: 'active',
      created_by: input.createdBy,
      must_change_password: input.mustChangePassword,
    })
    .select('*')
    .maybeSingle()

  if (pErr || !row) {
    await ctx.db.auth.admin.deleteUser(data.user.id)
    throw pErr ?? badRequest('Could not create the profile')
  }
  return rowToProfile(row)
}

/* -------------------------------------------------------------------------- */
/*  Entry point                                                                */
/* -------------------------------------------------------------------------- */

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight()

  const url = new URL(req.url)
  // Supabase serves this at /functions/v1/api/*; strip both prefixes so routes
  // read the same locally and in production.
  const path = url.pathname.replace(/^\/functions\/v1/, '').replace(new RegExp(`^${BASE}`), '')

  try {
    // Unauthenticated routes. Everything else requires a verified JWT.
    if (req.method === 'POST' && path === '/auth/register') return await handleRegister(req)
    if (req.method === 'POST' && path === '/auth/bootstrap') return await handleBootstrap(req)
    if (req.method === 'GET' && path === '/auth/bootstrap') return await handleBootstrapStatus()
    if (req.method === 'GET' && path === '/auth/trainers') return await handleTrainerNames()

    const match = router.match(req.method, path)
    if (!match) throw notFound(`No route for ${req.method} ${path}`)

    const caller = await authenticate(req)

    // A user carrying a forced password change may only read /me and set it.
    if (
      caller.profile.mustChangePassword &&
      !(path === '/me' || path === '/me/password' || path === '/settings')
    ) {
      throw forbidden('You must set a new password before continuing')
    }

    if (caller.profile.candidateId) {
      // Fire-and-forget: activity tracking must not delay the response.
      touchCandidate(caller.db, caller.profile.candidateId).catch(() => {})
    }

    return await match.handler({
      req,
      url,
      params: match.params,
      ctx: caller,
      body: <T>() => readJson<T>(req),
    })
  } catch (err) {
    if (err instanceof ApiError) {
      return json({ error: err.message, code: err.code }, err.status)
    }
    // Never leak a database error message to a client.
    console.error('Unhandled API error:', err)
    return json({ error: 'An unexpected error occurred' }, 500)
  }
})

export { unauthorized }
