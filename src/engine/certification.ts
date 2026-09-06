/**
 * Re-export of the shared implementation.
 *
 * The real code lives in `supabase/functions/_shared/`, so the browser and the
 * Edge Functions run byte-identical scoring logic. Import from here in client
 * code; the alias is configured in vite.config.ts.
 */
export * from '@shared/certification.ts'
