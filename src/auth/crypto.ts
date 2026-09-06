/**
 * Password hashing.
 *
 * Uses PBKDF2-SHA256 via the Web Crypto API with a per-account random salt.
 * Passwords are never stored, logged or transmitted in plaintext — only the
 * derived hash and its salt are persisted.
 *
 * ---------------------------------------------------------------------------
 * PRODUCTION NOTE
 * ---------------------------------------------------------------------------
 * Client-side hashing is the correct choice for this build because the platform
 * runs standalone in a training room with no server. When you enable the
 * Supabase adapter, move authentication to **Supabase Auth** instead: it holds
 * the password verifier server-side (bcrypt/scrypt), issues JWTs, and enforces
 * Row Level Security so a candidate cannot read another candidate's attempts.
 * `supabase/schema.sql` ships the matching RLS policies, and
 * `docs/AUTH.md` documents the migration path. The `AuthService` interface
 * below is what you re-implement against `supabase.auth`.
 */

const ITERATIONS = 150_000
const KEY_LENGTH = 32 // bytes
const SALT_LENGTH = 16

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

async function derive(password: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' },
    key,
    KEY_LENGTH * 8,
  )
  return toBase64(new Uint8Array(bits))
}

export interface PasswordRecord {
  hash: string
  salt: string
}

export async function hashPassword(password: string): Promise<PasswordRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  return { hash: await derive(password, salt), salt: toBase64(salt) }
}

/**
 * Verifies a password against a stored record.
 * Comparison is constant-time to avoid leaking information through timing.
 */
export async function verifyPassword(
  password: string,
  record: PasswordRecord,
): Promise<boolean> {
  try {
    const computed = await derive(password, fromBase64(record.salt))
    return timingSafeEqual(computed, record.hash)
  } catch {
    return false
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/* -------------------------------------------------------------------------- */
/*  Password policy                                                            */
/* -------------------------------------------------------------------------- */

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4
  label: 'Too short' | 'Weak' | 'Fair' | 'Good' | 'Strong'
  problems: string[]
  acceptable: boolean
}

export const MIN_PASSWORD_LENGTH = 8

/**
 * Minimum policy: 8+ characters with at least one letter and one number.
 * Everything beyond that raises the strength meter but is not mandatory —
 * a policy people can actually follow beats one they work around.
 */
export function assessPassword(password: string): PasswordStrength {
  const problems: string[] = []
  if (password.length < MIN_PASSWORD_LENGTH) {
    problems.push(`Use at least ${MIN_PASSWORD_LENGTH} characters`)
  }
  if (!/[a-zA-Z]/.test(password)) problems.push('Include at least one letter')
  if (!/\d/.test(password)) problems.push('Include at least one number')

  let score = 0
  if (password.length >= MIN_PASSWORD_LENGTH) score++
  if (password.length >= 12) score++
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++
  if (/\d/.test(password) && /[^a-zA-Z0-9]/.test(password)) score++

  const labels: PasswordStrength['label'][] = ['Too short', 'Weak', 'Fair', 'Good', 'Strong']
  return {
    score: Math.min(4, score) as PasswordStrength['score'],
    label: labels[Math.min(4, score)],
    problems,
    acceptable: problems.length === 0,
  }
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())
}

/** Generates a readable temporary password for admin-created staff accounts. */
export function generateTempPassword(): string {
  const words = ['Harbor', 'Summit', 'Cedar', 'Vector', 'Anchor', 'Lantern', 'Meridian', 'Quartz']
  const word = words[Math.floor(Math.random() * words.length)]
  const digits = String(Math.floor(1000 + Math.random() * 9000))
  const symbol = '!@#$%'[Math.floor(Math.random() * 5)]
  return `${word}${digits}${symbol}`
}
