import { LocalStorageAdapter } from './localAdapter'
import { SupabaseAdapter } from './supabaseAdapter'
import type { PersistenceAdapter } from './types'

export * from './types'
export { LocalStorageAdapter } from './localAdapter'
export { SupabaseAdapter } from './supabaseAdapter'

let cached: PersistenceAdapter | null = null

/**
 * Chooses the best available adapter: Supabase when configured, otherwise
 * local browser storage. The app never breaks because a backend is missing.
 */
export function resolveAdapter(): PersistenceAdapter {
  if (cached) return cached
  const supabase = new SupabaseAdapter()
  cached = supabase.isAvailable() ? supabase : new LocalStorageAdapter()
  return cached
}

export function adapterLabel(): string {
  return resolveAdapter().label
}
