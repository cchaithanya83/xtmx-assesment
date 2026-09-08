import type {
  AudioField,
  AudioFieldKey,
  AudioLevelConfig,
  AudioScenario,
  ScenarioCorrection,
  ScriptSegment,
  VerificationPrompt,
} from './types.ts'
import { NETWORK_STATUSES } from './pools.ts'
import {
  DEFAULT_LEVEL_FIELDS,
  numberPoolOf,
  poolOf,
  type ScenarioContent,
} from './content.ts'
import { createRng, pick, randInt, shuffle, uid, type Rng } from './core.ts'
import {
  currencyToWords,
  dateToWords,
  estimateSpeechSeconds,
  idToWords,
  percentToWords,
  phoneToWords,
} from './speech.ts'

/* -------------------------------------------------------------------------- */
/*  Critical data fields — heavier scoring penalty when wrong                   */
/* -------------------------------------------------------------------------- */

export const CRITICAL_FIELDS: AudioFieldKey[] = [
  'memberId',
  'policyNumber',
  'authorizationNumber',
  'referenceNumber',
  'dob',
  'phone',
  'effectiveDate',
  'terminationDate',
  'copay',
  'specialistCopay',
  'deductible',
  'coinsurance',
]

export function isCriticalField(key: AudioFieldKey): boolean {
  return CRITICAL_FIELDS.includes(key)
}

/* -------------------------------------------------------------------------- */
/*  Random value generators                                                    */
/* -------------------------------------------------------------------------- */

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // I/O omitted — ambiguous when spoken
const DIGITS = '0123456789'

function randChars(source: string, count: number, rng: Rng): string {
  let out = ''
  for (let i = 0; i < count; i++) out += source[Math.floor(rng() * source.length)]
  return out
}

export function generateName(rng: Rng, content?: ScenarioContent): string {
  return `${pick(poolOf(content, 'FIRST_NAMES'), rng)} ${pick(poolOf(content, 'LAST_NAMES'), rng)}`
}

/** Valid adult DOB: between 22 and 68 years old. */
export function generateDob(rng: Rng): string {
  const now = new Date()
  const age = randInt(22, 68, rng)
  const year = now.getFullYear() - age
  const month = randInt(1, 12, rng)
  const day = randInt(1, 28, rng)
  return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`
}

export function generatePhone(rng: Rng): string {
  const areas = ['214', '469', '817', '512', '972', '682', '737', '903']
  // 555-01xx is the reserved fictional-number range.
  return `${pick(areas, rng)}555${String(randInt(100, 199, rng))}`
}

/** Patterns: ABC123456 · UHC7845AX92 · BC784592 */
export function generateMemberId(rng: Rng, content?: ScenarioContent): string {
  const shape = randInt(1, 3, rng)
  if (shape === 1) return `${randChars(LETTERS, 3, rng)}${randChars(DIGITS, 6, rng)}`
  if (shape === 2)
    return `${pick(poolOf(content, 'ID_PREFIXES'), rng)}${randChars(DIGITS, 4, rng)}${randChars(LETTERS, 2, rng)}${randChars(DIGITS, 2, rng)}`
  return `${randChars(LETTERS, 2, rng)}${randChars(DIGITS, 6, rng)}`
}

/** Patterns: POL-2291845-TX */
export function generatePolicyNumber(rng: Rng, content?: ScenarioContent): string {
  return `POL-${randChars(DIGITS, 7, rng)}-${pick(poolOf(content, 'STATE_CODES'), rng)}`
}

/** Patterns: PA784521 · AUTH-89372 · TX-PA-87291 */
export function generateAuthNumber(rng: Rng, content?: ScenarioContent): string {
  const shape = randInt(1, 3, rng)
  if (shape === 1) return `PA${randChars(DIGITS, 6, rng)}`
  if (shape === 2) return `AUTH-${randChars(DIGITS, 5, rng)}`
  return `${pick(poolOf(content, 'STATE_CODES'), rng)}-PA-${randChars(DIGITS, 5, rng)}`
}

/** Patterns: REF872391 · CALL-728391 · RQ-89231 */
export function generateReferenceNumber(rng: Rng): string {
  const shape = randInt(1, 3, rng)
  if (shape === 1) return `REF${randChars(DIGITS, 6, rng)}`
  if (shape === 2) return `CALL-${randChars(DIGITS, 6, rng)}`
  return `RQ-${randChars(DIGITS, 5, rng)}`
}

/** Phonetic-friendly ID for level 4/5: TX7942B */
export function generatePhoneticId(rng: Rng): string {
  return `${randChars(LETTERS, 2, rng)}${randChars(DIGITS, 4, rng)}${randChars(LETTERS, 1, rng)}`
}

function generateFutureDate(rng: Rng, baseYear = new Date().getFullYear()): string {
  const month = randInt(1, 12, rng)
  const day = pick([1, 15], rng)
  return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${baseYear}`
}

/* -------------------------------------------------------------------------- */
/*  Field catalogue                                                            */
/* -------------------------------------------------------------------------- */

interface FieldSpec {
  key: AudioFieldKey
  label: string
  type: AudioField['type']
  placeholder?: string
  options?: string[]
  hint?: string
}

const FIELD_SPECS: Record<AudioFieldKey, FieldSpec> = {
  memberName: { key: 'memberName', label: 'Member Name', type: 'text', placeholder: 'First Last' },
  dob: { key: 'dob', label: 'Date of Birth', type: 'date', placeholder: 'MM/DD/YYYY' },
  memberId: { key: 'memberId', label: 'Member ID', type: 'id', placeholder: 'e.g. BC784592' },
  phone: { key: 'phone', label: 'Phone', type: 'phone', placeholder: '10 digits' },
  provider: { key: 'provider', label: 'Provider', type: 'text', placeholder: 'Facility name' },
  servicingProvider: {
    key: 'servicingProvider',
    label: 'Servicing Provider',
    type: 'text',
    placeholder: 'Facility name',
  },
  copay: { key: 'copay', label: 'Copay', type: 'currency', placeholder: '0' },
  specialistCopay: {
    key: 'specialistCopay',
    label: 'Specialist Copay',
    type: 'currency',
    placeholder: '0',
  },
  deductible: { key: 'deductible', label: 'Deductible', type: 'currency', placeholder: '0' },
  outOfPocketMax: {
    key: 'outOfPocketMax',
    label: 'Out-of-Pocket Maximum',
    type: 'currency',
    placeholder: '0',
  },
  coinsurance: { key: 'coinsurance', label: 'Coinsurance', type: 'percent', placeholder: '0%' },
  networkStatus: {
    key: 'networkStatus',
    label: 'Network Status',
    type: 'select',
    options: [...NETWORK_STATUSES, 'Not Provided'],
  },
  authorizationNumber: {
    key: 'authorizationNumber',
    label: 'Authorization Number',
    type: 'id',
    placeholder: 'e.g. PA87452',
  },
  referenceNumber: {
    key: 'referenceNumber',
    label: 'Reference Number',
    type: 'id',
    placeholder: 'e.g. REF78219',
  },
  policyNumber: {
    key: 'policyNumber',
    label: 'Policy Number',
    type: 'id',
    placeholder: 'e.g. POL-1234567-TX',
  },
  effectiveDate: {
    key: 'effectiveDate',
    label: 'Effective Date',
    type: 'date',
    placeholder: 'MM/DD/YYYY',
  },
  terminationDate: {
    key: 'terminationDate',
    label: 'Termination Date',
    type: 'date',
    placeholder: 'MM/DD/YYYY or blank',
    hint: 'Leave blank if none was stated',
  },
  planName: { key: 'planName', label: 'Plan Name', type: 'text', placeholder: 'Plan' },
}


/* -------------------------------------------------------------------------- */
/*  Scenario generation                                                        */
/* -------------------------------------------------------------------------- */

/** Every value the generator can produce, keyed by field. */
function generateValues(
  rng: Rng,
  phonetic: boolean,
  content?: ScenarioContent,
): Record<AudioFieldKey, string> {
  const year = new Date().getFullYear()
  return {
    memberName: generateName(rng, content),
    dob: generateDob(rng),
    memberId: phonetic ? generatePhoneticId(rng) : generateMemberId(rng, content),
    phone: generatePhone(rng),
    provider: pick(poolOf(content, 'PROVIDERS'), rng),
    servicingProvider: pick(poolOf(content, 'PROVIDERS'), rng),
    copay: String(pick(numberPoolOf(content, 'COPAY_VALUES'), rng)),
    specialistCopay: String(pick(numberPoolOf(content, 'SPECIALIST_COPAY_VALUES'), rng)),
    deductible: String(pick(numberPoolOf(content, 'DEDUCTIBLE_VALUES'), rng)),
    outOfPocketMax: String(pick(numberPoolOf(content, 'OOP_MAX_VALUES'), rng)),
    coinsurance: pick(poolOf(content, 'COINSURANCE_VALUES'), rng),
    networkStatus: pick(poolOf(content, 'NETWORK_STATUSES'), rng),
    authorizationNumber: generateAuthNumber(rng, content),
    referenceNumber: generateReferenceNumber(rng),
    policyNumber: generatePolicyNumber(rng, content),
    effectiveDate: `01/01/${year}`,
    terminationDate: generateFutureDate(rng, year + 1),
    planName: pick(poolOf(content, 'PLAN_NAMES'), rng),
  }
}

/** Which fields at this level are eligible to carry a spoken correction. */
const CORRECTABLE: AudioFieldKey[] = [
  'deductible',
  'copay',
  'specialistCopay',
  'coinsurance',
  'authorizationNumber',
  'referenceNumber',
  'memberId',
  'effectiveDate',
  'outOfPocketMax',
]

function correctedValue(
  key: AudioFieldKey,
  current: string,
  rng: Rng,
  content?: ScenarioContent,
): string {
  switch (key) {
    case 'deductible':
      return String(
        pick(
          numberPoolOf(content, 'DEDUCTIBLE_VALUES').filter((v) => String(v) !== current),
          rng,
        ),
      )
    case 'copay':
      return String(
        pick(
          numberPoolOf(content, 'COPAY_VALUES').filter((v) => String(v) !== current),
          rng,
        ),
      )
    case 'specialistCopay':
      return String(
        pick(
          numberPoolOf(content, 'SPECIALIST_COPAY_VALUES').filter((v) => String(v) !== current),
          rng,
        ),
      )
    case 'outOfPocketMax':
      return String(
        pick(
          numberPoolOf(content, 'OOP_MAX_VALUES').filter((v) => String(v) !== current),
          rng,
        ),
      )
    case 'coinsurance':
      return pick(
        poolOf(content, 'COINSURANCE_VALUES').filter((v) => v !== current),
        rng,
      )
    case 'authorizationNumber':
      return generateAuthNumber(rng, content)
    case 'referenceNumber':
      return generateReferenceNumber(rng)
    case 'memberId':
      return generatePhoneticId(rng)
    case 'effectiveDate':
      return generateFutureDate(rng)
    default:
      return current
  }
}

/**
 * Builds a complete randomised Task 2 scenario for a difficulty level.
 *
 * A fresh scenario is generated on every attempt (see `startTask2Attempt` in the
 * store), so retries always present different names, IDs, values and correction
 * positions at identical difficulty. That is what prevents memorisation.
 *
 * @param config difficulty configuration — editable by trainers in Settings
 * @param seed   optional seed for reproducible scenarios (used in tests/demos)
 */
export function generateScenario(
  config: AudioLevelConfig,
  seed?: number,
  content?: ScenarioContent,
): AudioScenario {
  const rng = createRng(seed ?? Math.floor(Math.random() * 2 ** 31))
  const phonetic = config.phoneticIds
  const values = generateValues(rng, phonetic, content)

  // ---- Field roster ------------------------------------------------------
  const levelFields = content?.levelFields ?? DEFAULT_LEVEL_FIELDS
  const roster = levelFields[config.level] ?? DEFAULT_LEVEL_FIELDS[1]
  const formFields = roster.slice(0, Math.max(config.fieldCount, 4))

  // ---- Corrections -------------------------------------------------------
  const correctionTargets = shuffle(
    formFields.filter((f) => CORRECTABLE.includes(f)),
    rng,
  ).slice(0, config.corrections)

  const corrections: ScenarioCorrection[] = correctionTargets.map((key) => {
    const from = values[key]
    const to = correctedValue(key, from, rng, content)
    values[key] = to // the corrected value is the expected answer
    return { field: key, from, to, segmentIndex: -1 }
  })

  // ---- Build AudioField[] ------------------------------------------------
  const fields: AudioField[] = formFields.map((key) => {
    const spec = FIELD_SPECS[key]
    const correction = corrections.find((c) => c.field === key)
    return {
      key,
      label: spec.label,
      type: spec.type,
      expected: values[key],
      supersededValue: correction?.from,
      critical: isCriticalField(key),
      placeholder: spec.placeholder,
      options: spec.options,
      hint: spec.hint,
    }
  })

  // ---- Spoken order ------------------------------------------------------
  const spokenOrder = config.outOfOrder ? shuffleKeepingNameLate(formFields, rng) : [...formFields]

  // ---- Segments ----------------------------------------------------------
  const wpm = randInt(config.wpmMin, config.wpmMax, rng)
  const segments = buildSegments({
    spokenOrder,
    values,
    corrections,
    phonetic,
    fillerCount: config.fillerSegments,
    rng,
    content,
  })

  const script = segments.map((s) => s.text).join(' ')
  const estimatedDurationSeconds =
    estimateSpeechSeconds(script, wpm) +
    segments.reduce((sum, s) => sum + s.pauseAfterMs, 0) / 1000

  // ---- Verification prompts ---------------------------------------------
  const verificationPrompts = buildVerificationPrompts(
    config.verificationPrompts,
    formFields,
    values,
    rng,
    content,
  )

  return {
    id: uid('scn'),
    level: config.level,
    data: Object.fromEntries(formFields.map((k) => [k, values[k]])),
    fields,
    segments,
    script,
    spokenOrder,
    corrections,
    verificationPrompts,
    wordsPerMinute: wpm,
    estimatedDurationSeconds: Math.round(estimatedDurationSeconds),
    createdAt: new Date().toISOString(),
  }
}

/**
 * Out-of-order delivery. We deliberately push the member name away from
 * position 0 — "authorization number first, then DOB, then provider, then
 * member name" is exactly the pattern Assignment 3 is meant to train.
 */
function shuffleKeepingNameLate(fields: AudioFieldKey[], rng: Rng): AudioFieldKey[] {
  const shuffled = shuffle(fields, rng)
  const nameIdx = shuffled.indexOf('memberName')
  if (nameIdx > -1 && nameIdx < 2 && shuffled.length > 3) {
    const target = randInt(2, shuffled.length - 1, rng)
    shuffled.splice(target, 0, ...shuffled.splice(nameIdx, 1))
  }
  return shuffled
}

/* -------------------------------------------------------------------------- */
/*  Script generation — structured data → natural speech                       */
/* -------------------------------------------------------------------------- */

interface BuildSegmentsArgs {
  spokenOrder: AudioFieldKey[]
  values: Record<AudioFieldKey, string>
  corrections: ScenarioCorrection[]
  phonetic: boolean
  fillerCount: number
  rng: Rng
  content?: ScenarioContent
}

function buildSegments({
  spokenOrder,
  values,
  corrections,
  phonetic,
  fillerCount,
  rng,
  content,
}: BuildSegmentsArgs): ScriptSegment[] {
  const segments: ScriptSegment[] = []

  segments.push({
    id: uid('seg'),
    text: pick(poolOf(content, 'INTRO_LINES'), rng),
    fields: [],
    pauseAfterMs: 700,
    kind: 'intro',
  })

  // Distribute filler lines evenly through the data segments.
  const fillerAt = new Set(
    fillerCount
      ? Array.from({ length: fillerCount }, (_, i) =>
          Math.floor(((i + 1) * spokenOrder.length) / (fillerCount + 1)),
        )
      : [],
  )

  spokenOrder.forEach((key, index) => {
    if (fillerAt.has(index)) {
      segments.push({
        id: uid('seg'),
        text: pick(poolOf(content, 'FILLER_LINES'), rng),
        fields: [],
        pauseAfterMs: 500,
        kind: 'filler',
      })
    }

    const correction = corrections.find((c) => c.field === key)

    if (correction) {
      // Speak the wrong value first, then correct it in a following segment.
      segments.push({
        id: uid('seg'),
        text: speakField(key, correction.from, phonetic, rng),
        fields: [key],
        pauseAfterMs: 400,
        kind: 'data',
      })
      correction.segmentIndex = segments.length
      segments.push({
        id: uid('seg'),
        text: `${pick(
          [
            'Sorry, correction.',
            'Actually, let me correct that.',
            'Apologies — I misread that.',
            'Hold on, that is not right.',
          ],
          rng,
        )} ${speakField(key, correction.to, phonetic, rng)}`,
        fields: [key],
        pauseAfterMs: 800,
        kind: 'correction',
      })
    } else {
      segments.push({
        id: uid('seg'),
        text: speakField(key, values[key], phonetic, rng),
        fields: [key],
        pauseAfterMs: randInt(500, 1100, rng),
        kind: 'data',
      })
    }
  })

  segments.push({
    id: uid('seg'),
    text: pick(poolOf(content, 'OUTRO_LINES'), rng),
    fields: [],
    pauseAfterMs: 0,
    kind: 'outro',
  })

  return segments
}

/** Renders one field's value as a natural spoken sentence. */
function speakField(key: AudioFieldKey, value: string, phonetic: boolean, rng: Rng): string {
  switch (key) {
    case 'memberName':
      return pick(
        [
          `The member is ${value}.`,
          `Member name on file is ${value}.`,
          `This is for ${value}.`,
        ],
        rng,
      )
    case 'dob':
      return pick(
        [
          `Date of birth ${dateToWords(value)}.`,
          `The member's date of birth is ${dateToWords(value)}.`,
          `Born ${dateToWords(value)}.`,
        ],
        rng,
      )
    case 'memberId':
      return `The member ID is ${idToWords(value, phonetic)}.`
    case 'policyNumber':
      return `Policy number ${idToWords(value, phonetic)}.`
    case 'phone':
      return pick(
        [
          `The best callback number is ${phoneToWords(value)}.`,
          `Phone on file is ${phoneToWords(value)}.`,
        ],
        rng,
      )
    case 'provider':
      return `The provider is ${value}.`
    case 'servicingProvider':
      return `The servicing provider is ${value}.`
    case 'planName':
      return `The member is enrolled in the ${value} plan.`
    case 'copay':
      return `The copay is ${currencyToWords(Number(value))}.`
    case 'specialistCopay':
      return `The specialist copay is ${currencyToWords(Number(value))}.`
    case 'deductible':
      return `The deductible is ${currencyToWords(Number(value))}.`
    case 'outOfPocketMax':
      return `The out-of-pocket maximum is ${currencyToWords(Number(value))}.`
    case 'coinsurance':
      return `Coinsurance is ${percentToWords(value)} after the deductible.`
    case 'networkStatus':
      return `The provider is ${value.toLowerCase()} for this plan.`
    case 'authorizationNumber':
      return `The authorization number is ${idToWords(value, phonetic)}.`
    case 'referenceNumber':
      return `Your reference number for this call is ${idToWords(value, phonetic)}.`
    case 'effectiveDate':
      return `Coverage is effective ${dateToWords(value)}.`
    case 'terminationDate':
      return `The termination date is ${dateToWords(value)}.`
    default:
      return `${key} is ${value}.`
  }
}

/* -------------------------------------------------------------------------- */
/*  Verification prompts (multitasking)                                        */
/* -------------------------------------------------------------------------- */

function buildVerificationPrompts(
  count: number,
  fields: AudioFieldKey[],
  values: Record<AudioFieldKey, string>,
  rng: Rng,
  content?: ScenarioContent,
): VerificationPrompt[] {
  if (count <= 0) return []

  const candidates: (() => VerificationPrompt | null)[] = [
    () =>
      fields.includes('networkStatus')
        ? {
            id: uid('vp'),
            question: 'What is the provider network status?',
            options: ['In Network', 'Out of Network', 'Not Provided'],
            correctAnswer: values.networkStatus,
            triggerAtProgress: 0,
          }
        : null,
    () =>
      fields.includes('coinsurance')
        ? {
            id: uid('vp'),
            question: 'What coinsurance percentage was stated?',
            options: shuffle(
              [
                values.coinsurance,
                ...poolOf(content, 'COINSURANCE_VALUES')
                  .filter((v) => v !== values.coinsurance)
                  .slice(0, 2),
              ],
              rng,
            ),
            correctAnswer: values.coinsurance,
            triggerAtProgress: 0,
          }
        : null,
    () =>
      fields.includes('deductible')
        ? {
            id: uid('vp'),
            question: 'Confirm the deductible amount currently on the record.',
            options: shuffle(
              [
                `$${Number(values.deductible).toLocaleString()}`,
                ...numberPoolOf(content, 'DEDUCTIBLE_VALUES')
                  .filter((v) => String(v) !== values.deductible)
                  .slice(0, 2)
                  .map((v) => `$${v.toLocaleString()}`),
              ],
              rng,
            ),
            correctAnswer: `$${Number(values.deductible).toLocaleString()}`,
            triggerAtProgress: 0,
          }
        : null,
    () => ({
      id: uid('vp'),
      question: 'Has a termination date been provided on this call?',
      options: ['Yes', 'No', 'Not stated'],
      correctAnswer: fields.includes('terminationDate') ? 'Yes' : 'No',
      triggerAtProgress: 0,
    }),
    () =>
      fields.includes('memberName')
        ? {
            id: uid('vp'),
            question: 'Confirm the member name you have captured.',
            options: shuffle(
              [values.memberName, generateName(rng, content), generateName(rng, content)],
              rng,
            ),
            correctAnswer: values.memberName,
            triggerAtProgress: 0,
          }
        : null,
  ]

  const built = shuffle(candidates, rng)
    .map((fn) => fn())
    .filter((p): p is VerificationPrompt => p !== null)
    .slice(0, count)

  // Spread prompts across the middle 70% of the audio timeline.
  return built.map((p, i) => ({
    ...p,
    triggerAtProgress: 0.25 + (i * 0.55) / Math.max(1, built.length - 1 || 1),
  }))
}
