import type { AudioLevelConfig, TrainerSettings, WpmScoreBand } from './types.ts'

/**
 * Default assessment configuration. Every value here is editable by a trainer
 * from Settings → Assessment Configuration and persisted with the workspace.
 */

export const DEFAULT_WPM_BANDS: WpmScoreBand[] = [
  { minWpm: 40, points: 30 },
  { minWpm: 35, points: 27 },
  { minWpm: 30, points: 24 },
  { minWpm: 25, points: 17 },
  { minWpm: 20, points: 10 },
  { minWpm: 0, points: 0 },
]

/**
 * AI audio scenario difficulty engine. Level N drives scenario generation for
 * Task 2 Assignment N.
 */
export const DEFAULT_AUDIO_LEVELS: AudioLevelConfig[] = [
  {
    level: 1,
    wpmMin: 100,
    wpmMax: 110,
    fieldCount: 4,
    corrections: 0,
    outOfOrder: false,
    phoneticIds: false,
    verificationPrompts: 0,
    fillerSegments: 0,
  },
  {
    level: 2,
    wpmMin: 110,
    wpmMax: 120,
    fieldCount: 7,
    corrections: 0,
    outOfOrder: false,
    phoneticIds: false,
    verificationPrompts: 0,
    fillerSegments: 1,
  },
  {
    level: 3,
    wpmMin: 120,
    wpmMax: 130,
    fieldCount: 8,
    corrections: 0,
    outOfOrder: true,
    phoneticIds: false,
    verificationPrompts: 0,
    fillerSegments: 2,
  },
  {
    level: 4,
    wpmMin: 130,
    wpmMax: 140,
    fieldCount: 9,
    corrections: 2,
    outOfOrder: true,
    phoneticIds: true,
    verificationPrompts: 1,
    fillerSegments: 2,
  },
  {
    level: 5,
    wpmMin: 135,
    wpmMax: 150,
    fieldCount: 11,
    corrections: 3,
    outOfOrder: true,
    phoneticIds: true,
    verificationPrompts: 3,
    fillerSegments: 3,
  },
]

export const DEFAULT_SETTINGS: TrainerSettings = {
  /* Typing requirements */
  minWpm: 30,
  minAccuracy: 85,
  passingScore: 75,
  minCompletion: 95,
  backspacePenaltyWeight: 0.2,
  wpmBands: DEFAULT_WPM_BANDS,
  pauseThresholdMs: 3000,

  /* Audio requirements */
  minDataAccuracy: 85,
  minCriticalAccuracy: 85,
  replayAllowed: false,
  pauseAllowed: false,
  playbackSpeed: 1,
  voiceURI: null,
  audioLevels: DEFAULT_AUDIO_LEVELS,

  /* Multitasking */
  minMultitaskingScore: 75,
  verificationPromptFrequency: 3,

  /* Retry */
  unlimitedRetries: true,
  maxAttempts: 5,
  requirePracticeBeforeRetry: false,
  lockoutSeconds: 0,

  /* Integrity */
  blockPaste: true,
  trackTabSwitching: true,
  flagBlurThreshold: 3,
}

/** Task weights in the final certification score. */
export const TASK_WEIGHTS = { 1: 0.4, 2: 0.6 } as const

/** Task 1 score weighting, out of 100. */
export const TASK1_WEIGHTS = {
  speed: 30,
  accuracy: 40,
  dataAccuracy: 20,
  completion: 10,
} as const

/** Task 2 score weighting, out of 100. */
export const TASK2_WEIGHTS = {
  capture: 25,
  dataAccuracy: 25,
  criticalAccuracy: 20,
  listening: 15,
  correction: 10,
  completion: 5,
} as const

export const ORG_NAME = 'XTransMatrix Consulting Services Pvt. Ltd.'
export const ORG_SHORT = 'XTransMatrix'
export const ASSESSMENT_TITLE =
  'AI Operator Keyboard, Listening & Real-Time Data Entry Assessment'
