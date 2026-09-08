import type { AudioFieldKey, SpellingMode } from './types.ts'
import {
  BATCHES,
  COINSURANCE_VALUES,
  COPAY_VALUES,
  DEDUCTIBLE_VALUES,
  FILLER_LINES,
  FIRST_NAMES,
  ID_PREFIXES,
  INTRO_LINES,
  LAST_NAMES,
  LOCATIONS,
  NETWORK_STATUSES,
  OOP_MAX_VALUES,
  OUTRO_LINES,
  PLAN_NAMES,
  PROVIDERS,
  SPECIALIST_COPAY_VALUES,
  STATE_CODES,
} from './pools.ts'

/**
 * Factory defaults for the editable content.
 *
 * These are the values a fresh deployment starts with, and what the admin
 * Content screen resets to. Once seeded, the database is authoritative — but
 * keeping the defaults here means the starting content is version-controlled,
 * reviewable and type-checked, rather than duplicated into a SQL file.
 */

export interface PoolDefinition {
  label: string
  kind: 'text' | 'number'
  /** Shown in the admin UI to explain what the pool affects. */
  hint: string
  items: string[]
}

const asText = (items: readonly string[]) => [...items]
const asNumbers = (items: readonly number[]) => items.map(String)

export const POOL_DEFAULTS = {
  FIRST_NAMES: {
    label: 'First names',
    kind: 'text',
    hint: 'Member first names spoken in Task 2 audio.',
    items: asText(FIRST_NAMES),
  },
  LAST_NAMES: {
    label: 'Last names',
    kind: 'text',
    hint: 'Member surnames. Apostrophes and hyphens are useful — they are where transcription errors happen.',
    items: asText(LAST_NAMES),
  },
  PROVIDERS: {
    label: 'Providers',
    kind: 'text',
    hint: 'Facility names for the provider and servicing-provider fields.',
    items: asText(PROVIDERS),
  },
  PLAN_NAMES: {
    label: 'Plan names',
    kind: 'text',
    hint: 'Insurance plan names used at level 5.',
    items: asText(PLAN_NAMES),
  },
  ID_PREFIXES: {
    label: 'Member ID prefixes',
    kind: 'text',
    hint: 'Leading letters for generated member IDs, e.g. UHC7845AX92.',
    items: asText(ID_PREFIXES),
  },
  STATE_CODES: {
    label: 'State codes',
    kind: 'text',
    hint: 'Used in policy and authorization numbers, e.g. POL-2291845-TX.',
    items: asText(STATE_CODES),
  },
  COPAY_VALUES: {
    label: 'Copay amounts',
    kind: 'number',
    hint: 'Dollar amounts, spoken as words. No currency symbol.',
    items: asNumbers(COPAY_VALUES),
  },
  SPECIALIST_COPAY_VALUES: {
    label: 'Specialist copay amounts',
    kind: 'number',
    hint: 'Dollar amounts for the specialist copay field.',
    items: asNumbers(SPECIALIST_COPAY_VALUES),
  },
  DEDUCTIBLE_VALUES: {
    label: 'Deductible amounts',
    kind: 'number',
    hint: 'Dollar amounts. Also the pool a spoken correction picks its replacement from.',
    items: asNumbers(DEDUCTIBLE_VALUES),
  },
  OOP_MAX_VALUES: {
    label: 'Out-of-pocket maximums',
    kind: 'number',
    hint: 'Dollar amounts for the out-of-pocket maximum field.',
    items: asNumbers(OOP_MAX_VALUES),
  },
  COINSURANCE_VALUES: {
    label: 'Coinsurance percentages',
    kind: 'text',
    hint: 'Include the percent sign, e.g. 20%.',
    items: asText(COINSURANCE_VALUES),
  },
  NETWORK_STATUSES: {
    label: 'Network statuses',
    kind: 'text',
    hint: 'Spoken as "the provider is <value> for this plan".',
    items: asText(NETWORK_STATUSES),
  },
  INTRO_LINES: {
    label: 'Call opening lines',
    kind: 'text',
    hint: 'Carries no data — sets the scene so the audio sounds like a call.',
    items: asText(INTRO_LINES),
  },
  FILLER_LINES: {
    label: 'Filler lines',
    kind: 'text',
    hint: 'Conversational padding between data points. Carries no data.',
    items: asText(FILLER_LINES),
  },
  OUTRO_LINES: {
    label: 'Call closing lines',
    kind: 'text',
    hint: 'Spoken last. Carries no data.',
    items: asText(OUTRO_LINES),
  },
  BATCHES: {
    label: 'Batches / cohorts',
    kind: 'text',
    hint: 'Options in the candidate sign-up form and the trainer batch filter.',
    items: asText(BATCHES),
  },
  LOCATIONS: {
    label: 'Locations',
    kind: 'text',
    hint: 'Options in the candidate sign-up form. Keep "Other" to allow free text.',
    items: asText(LOCATIONS),
  },
} satisfies Record<string, PoolDefinition>

export type PoolKey = keyof typeof POOL_DEFAULTS

/** Which fields each audio level asks for, in form order. */
export const DEFAULT_LEVEL_FIELDS: Record<number, AudioFieldKey[]> = {
  1: ['memberName', 'dob', 'phone', 'memberId'],
  2: ['memberName', 'dob', 'memberId', 'provider', 'copay', 'deductible', 'networkStatus'],
  3: [
    'memberName', 'dob', 'memberId', 'phone', 'provider',
    'authorizationNumber', 'effectiveDate', 'networkStatus',
  ],
  4: [
    'memberName', 'dob', 'memberId', 'policyNumber', 'provider',
    'deductible', 'coinsurance', 'authorizationNumber', 'referenceNumber',
  ],
  5: [
    'memberName', 'dob', 'memberId', 'policyNumber', 'phone',
    'servicingProvider', 'planName', 'deductible', 'specialistCopay',
    'coinsurance', 'networkStatus', 'authorizationNumber', 'referenceNumber',
    'effectiveDate', 'outOfPocketMax',
  ],
}

/** Every field key an admin may choose from, with a human label. */
export const SELECTABLE_FIELDS: { key: AudioFieldKey; label: string; critical: boolean }[] = [
  { key: 'memberName', label: 'Member Name', critical: false },
  { key: 'dob', label: 'Date of Birth', critical: true },
  { key: 'memberId', label: 'Member ID', critical: true },
  { key: 'policyNumber', label: 'Policy Number', critical: true },
  { key: 'phone', label: 'Phone', critical: true },
  { key: 'provider', label: 'Provider', critical: false },
  { key: 'servicingProvider', label: 'Servicing Provider', critical: false },
  { key: 'planName', label: 'Plan Name', critical: false },
  { key: 'copay', label: 'Copay', critical: true },
  { key: 'specialistCopay', label: 'Specialist Copay', critical: true },
  { key: 'deductible', label: 'Deductible', critical: true },
  { key: 'outOfPocketMax', label: 'Out-of-Pocket Maximum', critical: false },
  { key: 'coinsurance', label: 'Coinsurance', critical: true },
  { key: 'networkStatus', label: 'Network Status', critical: false },
  { key: 'authorizationNumber', label: 'Authorization Number', critical: true },
  { key: 'referenceNumber', label: 'Reference Number', critical: true },
  { key: 'effectiveDate', label: 'Effective Date', critical: true },
  { key: 'terminationDate', label: 'Termination Date', critical: true },
]

/**
 * The content bundle the scenario generator consumes.
 * Every field is optional — anything omitted falls back to the defaults above.
 */
export interface ScenarioContent {
  pools?: Partial<Record<PoolKey, string[]>>
  levelFields?: Record<number, AudioFieldKey[]>
  /** Carried here so the generator has one plumbing path for everything. */
  nameSpelling?: SpellingMode
}

/** Resolves a pool, falling back to its factory default. */
export function poolOf(content: ScenarioContent | undefined, key: PoolKey): string[] {
  const supplied = content?.pools?.[key]
  return supplied?.length ? supplied : POOL_DEFAULTS[key].items
}

/** Resolves a pool as numbers, dropping anything unparseable. */
export function numberPoolOf(content: ScenarioContent | undefined, key: PoolKey): number[] {
  const parsed = poolOf(content, key).map(Number).filter(Number.isFinite)
  return parsed.length ? parsed : POOL_DEFAULTS[key].items.map(Number).filter(Number.isFinite)
}
