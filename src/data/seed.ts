/**
 * Re-export of the shared implementation.
 *
 * Demo seeding now runs on the server (POST /admin/demo-data); this shim keeps
 * the module importable for local tooling.
 */
export * from '@shared/seed.ts'
