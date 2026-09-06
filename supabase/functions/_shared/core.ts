/**
 * Pure helpers shared by the Edge Functions (Deno) and the browser client.
 *
 * Nothing in this file may touch the DOM, `window`, or any browser-only
 * dependency — it has to run unchanged on the server.
 */

/* -------------------------------------------------------------------------- */
/*  IDs                                                                        */
/* -------------------------------------------------------------------------- */

export function uid(prefix = ''): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14)
  return prefix ? `${prefix}_${rand}` : rand
}

/** Deterministic-looking certificate id: XTMX-KB-2026-00841 */
export function makeCertificateId(seed: number, year = new Date().getFullYear()): string {
  const serial = String(Math.abs(seed) % 100000).padStart(5, '0')
  return `XTMX-KB-${year}-${serial}`
}

/** Cheap 32-bit string hash — used for stable certificate serials. */
export function hashString(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/* -------------------------------------------------------------------------- */
/*  Numbers & formatting                                                       */
/* -------------------------------------------------------------------------- */

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function round(value: number, decimals = 0): number {
  const f = 10 ** decimals
  return Math.round(value * f) / f
}

export function pct(value: number, decimals = 0): string {
  return `${round(value, decimals)}%`
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`
}

export function formatDate(iso: string | Date, opts?: Intl.DateTimeFormatOptions): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', opts ?? { year: 'numeric', month: 'short', day: '2-digit' })
}

export function formatDateTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'
  const diff = Date.now() - then
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return formatDate(iso)
}

export function average(values: number[]): number {
  if (!values.length) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

/* -------------------------------------------------------------------------- */
/*  Seeded randomness — keeps demo data stable between reloads                 */
/* -------------------------------------------------------------------------- */

/** Mulberry32 PRNG. Deterministic given a seed; good enough for content gen. */
export function createRng(seed: number) {
  let a = seed >>> 0
  return function rng(): number {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type Rng = () => number

export function pick<T>(items: readonly T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)]
}

export function pickMany<T>(items: readonly T[], count: number, rng: Rng): T[] {
  const pool = [...items]
  const out: T[] = []
  for (let i = 0; i < count && pool.length; i++) {
    out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0])
  }
  return out
}

export function randInt(min: number, max: number, rng: Rng): number {
  return Math.floor(rng() * (max - min + 1)) + min
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/* -------------------------------------------------------------------------- */
/*  Text normalisation for answer comparison                                   */
/* -------------------------------------------------------------------------- */

/**
 * Normalises a candidate's typed value so cosmetic differences don't count as
 * errors: `$1,500` === `1500`, `(214) 555-0187` === `2145550187`,
 * `in network` === `In Network`.
 */
export function normaliseAnswer(value: string, type: string): string {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return ''
  switch (type) {
    case 'currency':
      return trimmed.replace(/[$,\s]/g, '').replace(/\.00$/, '')
    case 'percent':
      return trimmed.replace(/[%\s]/g, '')
    case 'phone':
      return trimmed.replace(/\D/g, '')
    case 'date':
      return normaliseDate(trimmed)
    case 'id':
      return trimmed.replace(/\s/g, '').toUpperCase()
    case 'select':
    case 'text':
    default:
      return trimmed.replace(/\s+/g, ' ').toLowerCase()
  }
}

/** Accepts 04/17/1991, 4-17-1991, 04.17.1991 → 04/17/1991 */
export function normaliseDate(value: string): string {
  const digits = value.match(/\d+/g)
  if (!digits || digits.length < 3) return value.replace(/\s/g, '')
  const [m, d, y] = digits
  const year = y.length === 2 ? (Number(y) > 30 ? `19${y}` : `20${y}`) : y
  return `${m.padStart(2, '0')}/${d.padStart(2, '0')}/${year}`
}

/** Character-level similarity (0–1) via normalised Levenshtein distance. */
export function similarity(a: string, b: string): number {
  if (a === b) return 1
  if (!a.length || !b.length) return 0
  const dist = levenshtein(a, b)
  return Math.max(0, 1 - dist / Math.max(a.length, b.length))
}

export function levenshtein(a: string, b: string): number {
  const prev = new Array(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        last + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
      last = tmp
    }
  }
  return prev[b.length]
}
