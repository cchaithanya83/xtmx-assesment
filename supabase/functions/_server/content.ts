import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import type { AudioFieldKey, TypingPassage } from '../_shared/types.ts'
import { PASSAGE_POOLS } from '../_shared/passages.ts'
import { DEFAULT_LEVEL_FIELDS, POOL_DEFAULTS, type PoolKey } from '../_shared/content.ts'
import { badRequest } from './http.ts'

/**
 * Editable assessment content.
 *
 * Passages, data pools and the per-level field roster live in the database so a
 * typo does not require a function redeploy. The TypeScript constants remain
 * the *factory defaults*: these loaders seed the tables from them on first read
 * and fall back to them if a read fails, so there is one source of truth for
 * the starting content and the assessment never breaks because a table is
 * empty.
 */

/* -------------------------------------------------------------------------- */
/*  Passages                                                                   */
/* -------------------------------------------------------------------------- */

interface PassageRow {
  id: string
  assignment_id: number
  label: string
  kind: string
  body: string
  active: boolean
  sort_order: number
}

export interface AdminPassage extends TypingPassage {
  assignmentId: number
  active: boolean
  sortOrder: number
}

function rowToPassage(r: PassageRow): AdminPassage {
  return {
    id: r.id,
    assignmentId: r.assignment_id,
    label: r.label,
    kind: r.kind as TypingPassage['kind'],
    text: r.body,
    active: r.active,
    sortOrder: r.sort_order,
  }
}

/** Flattens the code defaults into insertable rows. */
function defaultPassageRows() {
  const rows: Omit<PassageRow, 'active'>[] = []
  for (const [assignmentId, pool] of Object.entries(PASSAGE_POOLS)) {
    pool.forEach((p, i) => {
      rows.push({
        id: p.id,
        assignment_id: Number(assignmentId),
        label: p.label,
        kind: p.kind,
        body: p.text,
        sort_order: i,
      })
    })
  }
  return rows
}

/**
 * Seeds the passage table from the code defaults when it is empty.
 * Idempotent — `ignoreDuplicates` means a concurrent seed is harmless.
 */
export async function seedPassagesIfEmpty(db: SupabaseClient): Promise<void> {
  const { count, error } = await db
    .from('passages')
    .select('id', { count: 'exact', head: true })
  if (error || (count ?? 0) > 0) return

  await db
    .from('passages')
    .upsert(defaultPassageRows(), { onConflict: 'id', ignoreDuplicates: true })
}

/** All passages, including inactive ones. Admin screen only. */
export async function listAllPassages(db: SupabaseClient): Promise<AdminPassage[]> {
  await seedPassagesIfEmpty(db)
  const { data, error } = await db
    .from('passages')
    .select('*')
    .order('assignment_id', { ascending: true })
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []).map(rowToPassage)
}

/**
 * The pool an assignment can actually issue from.
 * Falls back to the code defaults so a misconfigured table cannot block an
 * assessment.
 */
export async function activePassagePool(
  db: SupabaseClient,
  assignmentId: number,
): Promise<TypingPassage[]> {
  await seedPassagesIfEmpty(db)
  const { data, error } = await db
    .from('passages')
    .select('*')
    .eq('assignment_id', assignmentId)
    .eq('active', true)
    .order('sort_order', { ascending: true })

  if (error || !data?.length) return PASSAGE_POOLS[assignmentId] ?? []
  return data.map(rowToPassage)
}

export function validatePassage(input: {
  label?: string
  kind?: string
  text?: string
  assignmentId?: number
}) {
  if (!input.label?.trim()) throw badRequest('A label is required')
  if (!input.text?.trim()) throw badRequest('Passage text is required')
  // Short passages break the assessment: accuracy is measured over what was
  // typed, and the completion gate expects a body of work.
  if (input.text.trim().length < 120) {
    throw badRequest('Passage text must be at least 120 characters')
  }
  if (input.text.length > 8000) throw badRequest('Passage text must be under 8,000 characters')
  if (input.kind && !['prose', 'structured', 'mixed'].includes(input.kind)) {
    throw badRequest('Kind must be prose, structured or mixed')
  }
  if (
    input.assignmentId !== undefined &&
    (!Number.isInteger(input.assignmentId) || input.assignmentId < 1 || input.assignmentId > 5)
  ) {
    throw badRequest('assignmentId must be between 1 and 5')
  }
}

/* -------------------------------------------------------------------------- */
/*  Data pools                                                                 */
/* -------------------------------------------------------------------------- */

export interface AdminPool {
  key: string
  label: string
  kind: 'text' | 'number'
  items: string[]
}

export async function seedPoolsIfEmpty(db: SupabaseClient): Promise<void> {
  const { count, error } = await db
    .from('content_pools')
    .select('key', { count: 'exact', head: true })
  if (error || (count ?? 0) > 0) return

  await db.from('content_pools').upsert(
    Object.entries(POOL_DEFAULTS).map(([key, def]) => ({
      key,
      label: def.label,
      kind: def.kind,
      items: def.items,
    })),
    { onConflict: 'key', ignoreDuplicates: true },
  )
}

export async function listPools(db: SupabaseClient): Promise<AdminPool[]> {
  await seedPoolsIfEmpty(db)
  const { data, error } = await db.from('content_pools').select('*').order('key')
  if (error) throw error

  // Any pool missing from the table falls back to its code default, so adding a
  // new pool in a release does not require a migration.
  const byKey = new Map((data ?? []).map((r) => [r.key as string, r]))
  return Object.entries(POOL_DEFAULTS).map(([key, def]) => {
    const row = byKey.get(key)
    return {
      key,
      label: def.label,
      kind: def.kind,
      items: row ? (row.items as string[]) : def.items,
    }
  })
}

/** The pool map the scenario generator consumes. */
export async function resolvePools(db: SupabaseClient): Promise<Record<PoolKey, string[]>> {
  const pools = await listPools(db).catch(() => [])
  const out = {} as Record<PoolKey, string[]>
  for (const [key, def] of Object.entries(POOL_DEFAULTS)) {
    const found = pools.find((p) => p.key === key)
    out[key as PoolKey] = found?.items?.length ? found.items : def.items
  }
  return out
}

export function validatePool(key: string, items: unknown) {
  if (!(key in POOL_DEFAULTS)) throw badRequest(`Unknown pool "${key}"`)
  if (!Array.isArray(items) || items.length === 0) {
    throw badRequest('A pool must contain at least one value')
  }
  if (items.length > 500) throw badRequest('A pool may hold at most 500 values')
  if (items.some((v) => typeof v !== 'string' || !v.trim())) {
    throw badRequest('Pool values must all be non-empty text')
  }

  const def = POOL_DEFAULTS[key as PoolKey]
  if (def.kind === 'number' && items.some((v) => !Number.isFinite(Number(v)))) {
    throw badRequest(`"${def.label}" only accepts numeric values`)
  }
}

/* -------------------------------------------------------------------------- */
/*  Per-level field roster                                                     */
/* -------------------------------------------------------------------------- */

export async function seedLevelFieldsIfEmpty(db: SupabaseClient): Promise<void> {
  const { count, error } = await db
    .from('level_fields')
    .select('level', { count: 'exact', head: true })
  if (error || (count ?? 0) > 0) return

  await db.from('level_fields').upsert(
    Object.entries(DEFAULT_LEVEL_FIELDS).map(([level, keys]) => ({
      level: Number(level),
      field_keys: keys,
    })),
    { onConflict: 'level', ignoreDuplicates: true },
  )
}

export async function resolveLevelFields(
  db: SupabaseClient,
): Promise<Record<number, AudioFieldKey[]>> {
  await seedLevelFieldsIfEmpty(db)
  const { data, error } = await db.from('level_fields').select('*')

  const out: Record<number, AudioFieldKey[]> = { ...DEFAULT_LEVEL_FIELDS }
  if (error || !data) return out

  for (const row of data) {
    const keys = row.field_keys as AudioFieldKey[]
    if (Array.isArray(keys) && keys.length >= 4) out[row.level as number] = keys
  }
  return out
}

export function validateLevelFields(level: unknown, keys: unknown) {
  const n = Number(level)
  if (!Number.isInteger(n) || n < 1 || n > 5) throw badRequest('Level must be between 1 and 5')
  if (!Array.isArray(keys) || keys.length < 4) {
    throw badRequest('A level must ask for at least 4 fields')
  }
  if (new Set(keys).size !== keys.length) throw badRequest('A field cannot be listed twice')

  const known = new Set(Object.values(DEFAULT_LEVEL_FIELDS).flat())
  const unknown = keys.filter((k) => !known.has(k as AudioFieldKey))
  if (unknown.length) throw badRequest(`Unknown field(s): ${unknown.join(', ')}`)
}
