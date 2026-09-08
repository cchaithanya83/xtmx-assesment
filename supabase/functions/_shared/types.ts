/**
 * XTransMatrix AI Operator Certification Platform — domain model.
 *
 * Every persisted entity in the platform is described here. The persistence
 * layer (`src/persistence`) serialises these shapes verbatim, so the Supabase
 * schema in `supabase/schema.sql` maps 1:1 onto these interfaces.
 */

/* -------------------------------------------------------------------------- */
/*  Shared primitives                                                          */
/* -------------------------------------------------------------------------- */

export type TaskId = 1 | 2
export type AssignmentId = 1 | 2 | 3 | 4 | 5
export type Difficulty =
  | 'Easy'
  | 'Easy–Medium'
  | 'Medium'
  | 'Medium–Hard'
  | 'Hard'
  | 'Advanced'
export type AssessmentMode = 'certification' | 'practice'

/**
 * How the audio spells a value out after saying it.
 *   none     — spoken once, at pace
 *   letters  — "J-E-N-N-I-F-E-R"
 *   phonetic — "Juliet, Echo, November…" (NATO alphabet)
 */
export type SpellingMode = 'none' | 'letters' | 'phonetic'

/** Risk bands surfaced to trainers. Deliberately muted, professional colours. */
export type RiskLevel = 'green' | 'mid' | 'low' | 'danger' | 'below-standard'

/** Final performance classification bands (see `classifyPerformance`). */
export type PerformanceLevel =
  | 'High Performance'
  | 'Mid Performance'
  | 'Low Performance — Monitor'
  | 'Danger Candidate'
  | 'Not Certified'

export type AssignmentStatus = 'locked' | 'unlocked' | 'in-progress' | 'passed'

export type CandidateStatus =
  | 'not-started'
  | 'in-progress'
  | 'needs-coaching'
  | 'danger'
  | 'not-certified'
  | 'certified'

/* -------------------------------------------------------------------------- */
/*  People                                                                     */
/* -------------------------------------------------------------------------- */

export interface Candidate {
  id: string
  fullName: string
  candidateId: string
  email: string
  batch: string
  location: string
  trainerName: string
  createdAt: string
  lastActiveAt: string
  /** Populated by the seed generator so the trainer dashboard looks realistic. */
  isDemo?: boolean
}

export interface Trainer {
  id: string
  name: string
  email: string
  role: 'trainer' | 'admin'
}

/* -------------------------------------------------------------------------- */
/*  Authentication                                                             */
/* -------------------------------------------------------------------------- */

export type AccountRole = 'candidate' | 'trainer' | 'admin'
export type AccountStatus = 'active' | 'disabled'

/**
 * A user profile.
 *
 * Credentials are NOT here — Supabase Auth owns them, in `auth.users`, which no
 * client can read. `id` is the `auth.users.id` UUID, which is what every
 * server-side authorisation check keys off.
 *
 * Candidates self-register; trainer and admin profiles are created only by an
 * administrator through the API.
 */
export interface Profile {
  id: string
  email: string
  name: string
  role: AccountRole
  status: AccountStatus
  /** Set for candidate profiles — links to the `Candidate` record. */
  candidateId?: string
  createdBy?: string
  createdAt: string
  lastLoginAt: string | null
  /** Forces a password change on next sign-in (admin-issued temp passwords). */
  mustChangePassword: boolean
}

/* -------------------------------------------------------------------------- */
/*  Task / assignment definitions (static content, not per-candidate state)     */
/* -------------------------------------------------------------------------- */

export interface Task {
  id: TaskId
  title: string
  subtitle: string
  /** Contribution to the final certification score (0–1). */
  weight: number
  assignments: Assignment[]
}

export interface Assignment {
  id: AssignmentId
  taskId: TaskId
  title: string
  difficulty: Difficulty
  description: string
  objectives: string[]
  /** Seconds. Task 1 uses this as a hard stop; Task 2 as a completion budget. */
  timeLimitSeconds: number
  /** Task 1 only — pool of equivalent passages rotated between attempts. */
  passagePool?: TypingPassage[]
  /** Task 2 only — which difficulty level of the audio engine to run. */
  audioLevel?: 1 | 2 | 3 | 4 | 5
}

export interface TypingPassage {
  id: string
  label: string
  /** `prose` renders as a paragraph, `structured` as a labelled data block. */
  kind: 'prose' | 'structured' | 'mixed'
  text: string
}

/* -------------------------------------------------------------------------- */
/*  Task 1 — typing engine                                                     */
/* -------------------------------------------------------------------------- */

export interface TypingMetrics {
  /** Gross WPM: all keystrokes / 5 / minutes. */
  rawWpm: number
  /** Net WPM: correct characters / 5 / minutes. */
  wpm: number
  /** correctKeystrokes / totalKeystrokes as a percentage. */
  accuracy: number
  totalKeystrokes: number
  correctKeystrokes: number
  incorrectKeystrokes: number
  /** Errors the candidate went back and fixed. */
  correctedErrors: number
  /** Errors still present in the submitted text. */
  uncorrectedErrors: number
  backspaces: number
  correctCharacters: number
  elapsedSeconds: number
  completionPercentage: number
  currentStreak: number
  longestStreak: number
  /** Pauses longer than `TrainerSettings.pauseThresholdMs`. */
  longPauses: number
  totalPauseMs: number
  /** Accuracy restricted to digits and ID-shaped tokens — feeds the score. */
  numericAccuracy: number
}

/** Per-character state used by the live text comparison view. */
export type CharState = 'pending' | 'correct' | 'incorrect' | 'current' | 'corrected'

/* -------------------------------------------------------------------------- */
/*  Task 2 — audio scenarios                                                   */
/* -------------------------------------------------------------------------- */

export type AudioFieldKey =
  | 'memberName'
  | 'dob'
  | 'memberId'
  | 'phone'
  | 'provider'
  | 'copay'
  | 'deductible'
  | 'coinsurance'
  | 'networkStatus'
  | 'authorizationNumber'
  | 'referenceNumber'
  | 'effectiveDate'
  | 'terminationDate'
  | 'policyNumber'
  | 'planName'
  | 'outOfPocketMax'
  | 'specialistCopay'
  | 'servicingProvider'

export type AudioFieldType =
  | 'text'
  | 'date'
  | 'phone'
  | 'id'
  | 'currency'
  | 'percent'
  | 'select'

export interface AudioField {
  key: AudioFieldKey
  label: string
  type: AudioFieldType
  /** Correct value after all spoken corrections have been applied. */
  expected: string
  /** Value spoken *before* a correction, when the script contains one. */
  supersededValue?: string
  /** Critical fields carry a heavier scoring penalty (see CRITICAL_FIELDS). */
  critical: boolean
  placeholder?: string
  options?: string[]
  hint?: string
}

export interface VerificationPrompt {
  id: string
  question: string
  options: string[]
  correctAnswer: string
  /** Fraction of audio elapsed (0–1) at which the prompt appears. */
  triggerAtProgress: number
}

export interface AudioScenario {
  id: string
  level: 1 | 2 | 3 | 4 | 5
  /** Raw structured data the script was generated from. */
  data: Record<string, string | number | null>
  fields: AudioField[]
  /** Ordered speech segments — used for pacing, pauses and progress tracking. */
  segments: ScriptSegment[]
  /** Full flattened script (what the TTS provider speaks). */
  script: string
  /** Order in which data is revealed — differs from field order at level 3+. */
  spokenOrder: AudioFieldKey[]
  corrections: ScenarioCorrection[]
  verificationPrompts: VerificationPrompt[]
  wordsPerMinute: number
  estimatedDurationSeconds: number
  createdAt: string
}

export interface ScriptSegment {
  id: string
  text: string
  /** Which field(s) this segment reveals. */
  fields: AudioFieldKey[]
  /** Silence after this segment, in ms. */
  pauseAfterMs: number
  kind: 'intro' | 'data' | 'correction' | 'filler' | 'outro'
}

export interface ScenarioCorrection {
  field: AudioFieldKey
  from: string
  to: string
  /** Index of the segment carrying the correction. */
  segmentIndex: number
}

/* -------------------------------------------------------------------------- */
/*  Task 2 — real-time interaction telemetry                                   */
/* -------------------------------------------------------------------------- */

export interface FieldTelemetry {
  key: AudioFieldKey
  firstInputAt: number | null
  lastEditAt: number | null
  /** ms between first focus and last edit. */
  timeOnFieldMs: number
  /** Number of times the value was changed after the first commit. */
  corrections: number
  /** Times the candidate navigated into this field. */
  visits: number
  /** Audio progress (0–1) when the field was first filled. */
  audioProgressAtEntry: number | null
  /** Audio progress (0–1) at the last edit — used for correction handling. */
  audioProgressAtLastEdit: number | null
  finalValue: string
  skipped: boolean
  correct: boolean
  /** True when the field carried a spoken correction and the candidate applied it. */
  appliedSpokenCorrection?: boolean
}

export interface AudioAttemptTelemetry {
  fields: Record<string, FieldTelemetry>
  fieldNavigationCount: number
  totalPauseMs: number
  totalCompletionMs: number
  verificationAnswers: {
    promptId: string
    answer: string
    correct: boolean
    answeredAtProgress: number
  }[]
  /** Assessment-integrity events. */
  blurCount: number
  pasteAttempts: number
  replaysUsed: number
}

/* -------------------------------------------------------------------------- */
/*  Attempts & scoring                                                         */
/* -------------------------------------------------------------------------- */

export interface AttemptFeedback {
  strengths: string[]
  improvements: string[]
  recommendation: string[]
}

/** Human-readable explanation of one pass/fail gate. */
export interface GateResult {
  label: string
  actual: number
  required: number
  unit: '%' | 'wpm' | 'pts'
  passed: boolean
}

export interface ScoreBreakdown {
  label: string
  earned: number
  max: number
}

export interface Attempt {
  id: string
  candidateId: string
  taskId: TaskId
  assignmentId: number
  attemptNumber: number
  mode: AssessmentMode

  startedAt: string
  completedAt: string

  score: number
  passed: boolean

  /* Task 1 metrics */
  wpm?: number
  rawWpm?: number
  accuracy?: number

  /* Task 2 metrics */
  dataAccuracy?: number
  criticalDataAccuracy?: number
  multitaskingScore?: number
  correctionScore?: number
  listeningScore?: number

  totalKeystrokes: number
  incorrectKeystrokes: number
  backspaces: number

  completionPercentage: number

  breakdown: ScoreBreakdown[]
  gates: GateResult[]
  feedback: AttemptFeedback

  /** Full metric payload — kept for the trainer detail drill-down. */
  typingMetrics?: TypingMetrics
  audioTelemetry?: AudioAttemptTelemetry
  scenarioId?: string
  passageId?: string

  /** Integrity signals. Never auto-fails on its own. */
  integrity: IntegrityLog
}

export interface IntegrityLog {
  blurCount: number
  focusCount: number
  pasteAttempts: number
  copyAttempts: number
  events: { at: string; type: string; detail?: string }[]
  flagged: boolean
}

/* -------------------------------------------------------------------------- */
/*  Aggregates                                                                 */
/* -------------------------------------------------------------------------- */

export interface AssignmentProgress {
  taskId: TaskId
  assignmentId: number
  status: AssignmentStatus
  attempts: number
  bestScore: number | null
  bestWpm: number | null
  bestAccuracy: number | null
  firstAttemptId: string | null
  bestAttemptId: string | null
  passingAttemptId: string | null
  /** (best − first) / first as a percentage. */
  improvementPercentage: number | null
}

export interface AssessmentResult {
  candidateId: string
  task1Average: number
  task2Average: number
  finalScore: number
  avgWpm: number
  avgAccuracy: number
  listeningAccuracy: number
  criticalDataAccuracy: number
  multitaskingScore: number
  assignmentsPassed: number
  totalAssignments: number
  totalAttempts: number
  performanceLevel: PerformanceLevel
  risk: RiskLevel
  status: CandidateStatus
  certified: boolean
  gates: GateResult[]
}

export interface Certification {
  certificateId: string
  candidateId: string
  candidateName: string
  issuedAt: string
  finalScore: number
  wpm: number
  accuracy: number
  listeningAccuracy: number
  criticalDataAccuracy: number
  multitaskingScore: number
  performanceLevel: PerformanceLevel
  assignmentsCompleted: number
}

/* -------------------------------------------------------------------------- */
/*  Trainer configuration                                                      */
/* -------------------------------------------------------------------------- */

export interface WpmScoreBand {
  minWpm: number
  points: number
}

export interface AudioLevelConfig {
  level: 1 | 2 | 3 | 4 | 5
  wpmMin: number
  wpmMax: number
  fieldCount: number
  corrections: number
  outOfOrder: boolean
  phoneticIds: boolean
  verificationPrompts: number
  fillerSegments: number
}

export interface TrainerSettings {
  /* Typing requirements */
  minWpm: number
  minAccuracy: number
  passingScore: number
  /**
   * Minimum share of the passage that must be transcribed to pass Task 1.
   * Without this, a candidate can type a short perfect prefix and score highly:
   * accuracy is measured over what was typed, and completion alone is only
   * worth 10 points.
   */
  minCompletion: number
  /**
   * What a backspace costs, as a fraction of an uncorrected error.
   * 0.2 means five corrections cost the same as one wrong character left in.
   * 0 restores the old behaviour where corrections were free.
   */
  backspacePenaltyWeight: number
  wpmBands: WpmScoreBand[]
  /**
   * How spelled-out values are read: not at all, letter by letter, or
   * phonetically. Applies to every field listed in `spellFields`.
   *
   * Without spelling, a candidate has to guess how an unfamiliar name is
   * written, which measures luck rather than listening. Real benefits calls
   * spell unusual words routinely.
   */
  nameSpelling: SpellingMode
  /**
   * Which fields get spelled after being stated.
   *
   * Configurable because spelling is expensive — a long facility name roughly
   * doubles the length of its segment. Identifiers are deliberately absent:
   * they are already read character by character by `idToWords`, so listing one
   * here would spell it twice.
   */
  spellFields: AudioFieldKey[]
  pauseThresholdMs: number

  /* Audio requirements */
  minDataAccuracy: number
  minCriticalAccuracy: number
  replayAllowed: boolean
  pauseAllowed: boolean
  /**
   * Lets the candidate scrub the audio during a CERTIFICATION attempt.
   *
   * Off by default, and deliberately so: someone who can jump back over a
   * segment is no longer being measured on real-time listening, which is the
   * whole point of Task 2. Practice mode always allows it.
   */
  seekAllowed: boolean
  /**
   * Lets the candidate change playback speed during a CERTIFICATION attempt.
   * Off by default for the same reason. Practice mode always allows it.
   */
  speedControlAllowed: boolean
  /**
   * The rate the audio starts at, 0.25–2. Candidates may only change it if
   * `speedControlAllowed` is set (practice mode always allows it).
   */
  playbackSpeed: number
  voiceURI: string | null
  audioLevels: AudioLevelConfig[]

  /* Multitasking */
  minMultitaskingScore: number
  verificationPromptFrequency: number

  /* Retry */
  unlimitedRetries: boolean
  maxAttempts: number
  requirePracticeBeforeRetry: boolean
  lockoutSeconds: number

  /* Integrity */
  blockPaste: boolean
  trackTabSwitching: boolean
  flagBlurThreshold: number
}

/* -------------------------------------------------------------------------- */
/*  Live monitoring (trainer live view)                                        */
/* -------------------------------------------------------------------------- */

export interface LiveSession {
  candidateId: string
  candidateName: string
  taskId: TaskId
  assignmentId: number
  wpm: number
  accuracy: number
  progress: number
  currentScore: number
  risk: RiskLevel
  updatedAt: string
}
