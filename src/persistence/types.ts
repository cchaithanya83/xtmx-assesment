import type { Account, Attempt, Candidate, Certification, TrainerSettings } from '@/types'

/** Everything the platform persists, as one serialisable document. */
export interface WorkspaceSnapshot {
  version: number
  /** Login identities. Only PBKDF2 hashes are stored, never passwords. */
  accounts: Account[]
  candidates: Candidate[]
  attempts: Attempt[]
  certifications: Certification[]
  settings: TrainerSettings
  updatedAt: string
}

/**
 * Storage abstraction.
 *
 * The app is written against this interface only, so swapping LocalStorage for
 * Supabase (or any other backend) is a one-line change in `resolveAdapter()`.
 * Writes are coarse-grained snapshots for the local adapter and fine-grained
 * upserts for Supabase — both satisfy the same contract.
 */
export interface PersistenceAdapter {
  readonly id: string
  readonly label: string
  isAvailable(): boolean
  load(): Promise<WorkspaceSnapshot | null>
  save(snapshot: WorkspaceSnapshot): Promise<void>
  upsertCandidate(candidate: Candidate): Promise<void>
  upsertAccount(account: Account): Promise<void>
  appendAttempt(attempt: Attempt): Promise<void>
  saveSettings(settings: TrainerSettings): Promise<void>
  saveCertification(certification: Certification): Promise<void>
  clear(): Promise<void>
}

export const SNAPSHOT_VERSION = 1
