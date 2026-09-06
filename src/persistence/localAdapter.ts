import type { Account, Attempt, Candidate, Certification, TrainerSettings } from '@/types'
import { SNAPSHOT_VERSION, type PersistenceAdapter, type WorkspaceSnapshot } from './types'

const KEY = 'xtmx.workspace.v1'

/**
 * Default adapter. Keeps the platform fully functional with zero backend
 * configuration — which is what a training room actually needs on day one.
 */
export class LocalStorageAdapter implements PersistenceAdapter {
  readonly id = 'local'
  readonly label = 'Local Browser Storage'

  isAvailable(): boolean {
    try {
      const probe = '__xtmx_probe__'
      window.localStorage.setItem(probe, '1')
      window.localStorage.removeItem(probe)
      return true
    } catch {
      // Private windows / blocked site data.
      return false
    }
  }

  async load(): Promise<WorkspaceSnapshot | null> {
    try {
      const raw = window.localStorage.getItem(KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw) as WorkspaceSnapshot
      if (parsed.version !== SNAPSHOT_VERSION) return migrate(parsed)
      return parsed
    } catch {
      return null
    }
  }

  async save(snapshot: WorkspaceSnapshot): Promise<void> {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(snapshot))
    } catch {
      // Quota exceeded — surfaced to the user by the store's `storageError`.
      throw new Error('Local storage write failed (quota exceeded or blocked)')
    }
  }

  /* The local adapter persists whole snapshots, so the granular methods simply
     delegate to whatever the store has already committed in memory. */
  async upsertCandidate(_candidate: Candidate): Promise<void> {}
  async upsertAccount(_account: Account): Promise<void> {}
  async appendAttempt(_attempt: Attempt): Promise<void> {}
  async saveSettings(_settings: TrainerSettings): Promise<void> {}
  async saveCertification(_certification: Certification): Promise<void> {}

  async clear(): Promise<void> {
    window.localStorage.removeItem(KEY)
  }
}

/** Forward-migration hook for future snapshot versions. */
function migrate(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  // v1 predates authentication; the store bootstraps accounts when absent.
  return { ...snapshot, accounts: snapshot.accounts ?? [], version: SNAPSHOT_VERSION }
}
