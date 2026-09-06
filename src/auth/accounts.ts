import type { Account, AccountRole, Candidate } from '@/types'
import { hashPassword, normaliseEmail, verifyPassword } from './crypto'
import { uid } from '@/lib/utils'

/**
 * Account service.
 *
 * Pure functions over an `Account[]`. The store owns the array; this module
 * owns the rules — which keeps authentication logic testable and makes the
 * later swap to Supabase Auth a matter of re-implementing this surface.
 */

/** Bootstrap admin created on first run so the platform is never locked out. */
export const BOOTSTRAP_ADMIN = {
  email: 'admin@xtransmatrix.com',
  password: 'XtmxAdmin@2026',
  name: 'Platform Administrator',
} as const

/** Sample trainer seeded alongside the admin for immediate demo use. */
export const BOOTSTRAP_TRAINER = {
  email: 'trainer@xtransmatrix.com',
  password: 'XtmxTrainer@2026',
  name: 'Akhilesh Rao',
} as const

export type AuthFailure =
  | 'invalid-credentials'
  | 'account-disabled'
  | 'email-taken'
  | 'candidate-id-taken'
  | 'not-found'
  | 'last-admin'
  | 'weak-password'

export interface AuthResult<T = Account> {
  ok: boolean
  account?: T
  error?: AuthFailure
  message?: string
}

const MESSAGES: Record<AuthFailure, string> = {
  'invalid-credentials': 'That email and password combination was not recognised.',
  'account-disabled': 'This account has been disabled. Contact your trainer or administrator.',
  'email-taken': 'An account with that email address already exists.',
  'candidate-id-taken': 'That Candidate ID is already registered to another account.',
  'not-found': 'Account not found.',
  'last-admin': 'You cannot disable or remove the only remaining administrator.',
  'weak-password': 'That password does not meet the minimum requirements.',
}

export function fail(error: AuthFailure): AuthResult {
  return { ok: false, error, message: MESSAGES[error] }
}

export function findByEmail(accounts: Account[], email: string): Account | undefined {
  const target = normaliseEmail(email)
  return accounts.find((a) => a.email === target)
}

/* -------------------------------------------------------------------------- */
/*  Sign in                                                                    */
/* -------------------------------------------------------------------------- */

export async function authenticate(
  accounts: Account[],
  email: string,
  password: string,
): Promise<AuthResult> {
  const account = findByEmail(accounts, email)

  // Always run a verification even when the account is missing, so a wrong
  // email and a wrong password take the same amount of time to reject.
  if (!account) {
    await verifyPassword(password, {
      hash: 'x'.repeat(44),
      salt: 'AAAAAAAAAAAAAAAAAAAAAA==',
    })
    return fail('invalid-credentials')
  }

  const valid = await verifyPassword(password, {
    hash: account.passwordHash,
    salt: account.passwordSalt,
  })
  if (!valid) return fail('invalid-credentials')
  if (account.status === 'disabled') return fail('account-disabled')

  return { ok: true, account }
}

/* -------------------------------------------------------------------------- */
/*  Registration                                                               */
/* -------------------------------------------------------------------------- */

export interface CandidateSignUpInput {
  fullName: string
  candidateId: string
  email: string
  password: string
  batch: string
  location: string
  trainerName: string
}

export interface CandidateSignUpResult {
  ok: boolean
  error?: AuthFailure
  message?: string
  account?: Account
  candidate?: Candidate
}

/**
 * Candidate self-registration. Creates the login account and the candidate
 * profile together, so a candidate always has exactly one of each.
 */
export async function registerCandidateAccount(
  accounts: Account[],
  candidates: Candidate[],
  input: CandidateSignUpInput,
): Promise<CandidateSignUpResult> {
  const email = normaliseEmail(input.email)
  if (findByEmail(accounts, email)) return { ...fail('email-taken') }

  const candidateIdUpper = input.candidateId.trim().toUpperCase()
  if (candidates.some((c) => c.candidateId.toUpperCase() === candidateIdUpper)) {
    return { ...fail('candidate-id-taken') }
  }

  const now = new Date().toISOString()
  const candidate: Candidate = {
    id: uid('cnd'),
    fullName: input.fullName.trim(),
    candidateId: candidateIdUpper,
    email,
    batch: input.batch,
    location: input.location,
    trainerName: input.trainerName,
    createdAt: now,
    lastActiveAt: now,
  }

  const { hash, salt } = await hashPassword(input.password)
  const account: Account = {
    id: uid('acc'),
    email,
    name: candidate.fullName,
    role: 'candidate',
    status: 'active',
    passwordHash: hash,
    passwordSalt: salt,
    candidateId: candidate.id,
    createdAt: now,
    lastLoginAt: null,
    mustChangePassword: false,
  }

  return { ok: true, account, candidate }
}

/**
 * Admin-created staff account (trainer or admin).
 * There is no self-service path to a staff role — this is the only way in.
 */
export async function createStaffAccount(
  accounts: Account[],
  input: { name: string; email: string; password: string; role: Exclude<AccountRole, 'candidate'> },
  createdBy: string,
  mustChangePassword = true,
): Promise<AuthResult> {
  const email = normaliseEmail(input.email)
  if (findByEmail(accounts, email)) return fail('email-taken')

  const { hash, salt } = await hashPassword(input.password)
  const account: Account = {
    id: uid('acc'),
    email,
    name: input.name.trim(),
    role: input.role,
    status: 'active',
    passwordHash: hash,
    passwordSalt: salt,
    createdBy,
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
    mustChangePassword,
  }
  return { ok: true, account }
}

/* -------------------------------------------------------------------------- */
/*  Mutations                                                                  */
/* -------------------------------------------------------------------------- */

export async function withNewPassword(
  account: Account,
  password: string,
  mustChangePassword = false,
): Promise<Account> {
  const { hash, salt } = await hashPassword(password)
  return { ...account, passwordHash: hash, passwordSalt: salt, mustChangePassword }
}

/** Guards the "don't lock everyone out" rule. */
export function canDisableOrDelete(accounts: Account[], accountId: string): boolean {
  const target = accounts.find((a) => a.id === accountId)
  if (!target) return false
  if (target.role !== 'admin') return true
  const activeAdmins = accounts.filter((a) => a.role === 'admin' && a.status === 'active')
  return activeAdmins.length > 1 || target.status === 'disabled'
}

/* -------------------------------------------------------------------------- */
/*  Bootstrap                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Creates the first admin and trainer on a fresh workspace.
 *
 * Both are flagged `mustChangePassword` so the documented default credentials
 * cannot survive first use.
 */
export async function buildBootstrapAccounts(): Promise<Account[]> {
  const now = new Date().toISOString()
  const admin = await hashPassword(BOOTSTRAP_ADMIN.password)
  const trainer = await hashPassword(BOOTSTRAP_TRAINER.password)

  const adminAccount: Account = {
    id: 'acc_bootstrap_admin',
    email: BOOTSTRAP_ADMIN.email,
    name: BOOTSTRAP_ADMIN.name,
    role: 'admin',
    status: 'active',
    passwordHash: admin.hash,
    passwordSalt: admin.salt,
    createdAt: now,
    lastLoginAt: null,
    mustChangePassword: true,
  }

  return [
    adminAccount,
    {
      id: 'acc_bootstrap_trainer',
      email: BOOTSTRAP_TRAINER.email,
      name: BOOTSTRAP_TRAINER.name,
      role: 'trainer',
      status: 'active',
      passwordHash: trainer.hash,
      passwordSalt: trainer.salt,
      createdBy: adminAccount.id,
      createdAt: now,
      lastLoginAt: null,
      mustChangePassword: true,
    },
  ]
}

export const ROLE_LABEL: Record<AccountRole, string> = {
  candidate: 'Candidate',
  trainer: 'Trainer',
  admin: 'Administrator',
}
