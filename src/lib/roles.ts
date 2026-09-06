import type { AccountRole } from '@/types'

/** Display names for account roles, used across the shell and admin screens. */
export const ROLE_LABEL: Record<AccountRole, string> = {
  candidate: 'Candidate',
  trainer: 'Trainer',
  admin: 'Administrator',
}

/** Generates a readable temporary password for admin-created staff accounts. */
export function generateTempPassword(): string {
  const words = ['Harbor', 'Summit', 'Cedar', 'Vector', 'Anchor', 'Lantern', 'Meridian', 'Quartz']
  const word = words[Math.floor(Math.random() * words.length)]
  const digits = String(Math.floor(1000 + Math.random() * 9000))
  const symbol = '!@#$%'[Math.floor(Math.random() * 5)]
  return `${word}${digits}${symbol}`
}

export const MIN_PASSWORD_LENGTH = 8

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4
  label: string
  problems: string[]
  acceptable: boolean
}

/**
 * Client-side password guidance. The server enforces the same minimum
 * independently — this exists only so the user sees the problem before
 * submitting, never as the actual gate.
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

  const labels = ['Too short', 'Weak', 'Fair', 'Good', 'Strong']
  return {
    score: Math.min(4, score) as PasswordStrength['score'],
    label: labels[Math.min(4, score)],
    problems,
    acceptable: problems.length === 0,
  }
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())
}
