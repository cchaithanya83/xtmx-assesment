import type { CharState, TypingMetrics } from './types.ts'

/**
 * Real-time typing engine.
 *
 * The engine is a pure reducer over an immutable `TypingState`. The React layer
 * owns the textarea's value and calls `applyInput` on every change, so keystroke
 * bookkeeping never depends on React's render timing. All derived metrics are
 * computed from counters that are updated in O(changed characters), which keeps
 * long passages responsive.
 */

export interface TypingState {
  source: string
  typed: string
  startedAt: number | null
  lastKeyAt: number | null

  totalKeystrokes: number
  correctKeystrokes: number
  incorrectKeystrokes: number
  backspaces: number
  correctedErrors: number

  currentStreak: number
  longestStreak: number

  longPauses: number
  totalPauseMs: number

  /** Per-index: was this position ever typed wrong? Drives the "corrected" state. */
  everWrong: boolean[]

  finished: boolean
}

export function createTypingState(source: string): TypingState {
  return {
    source,
    typed: '',
    startedAt: null,
    lastKeyAt: null,
    totalKeystrokes: 0,
    correctKeystrokes: 0,
    incorrectKeystrokes: 0,
    backspaces: 0,
    correctedErrors: 0,
    currentStreak: 0,
    longestStreak: 0,
    longPauses: 0,
    totalPauseMs: 0,
    everWrong: new Array(source.length).fill(false),
    finished: false,
  }
}

export interface ApplyInputOptions {
  /** Pauses longer than this are recorded as "long pauses" (trainer setting). */
  pauseThresholdMs: number
  now?: number
}

/**
 * Folds the next textarea value into the state.
 *
 * Handles three shapes of change:
 *  - appended characters (normal typing, or a burst from fast input)
 *  - deletions (backspace / ctrl+backspace / selection delete)
 *  - replacements (select-then-type), treated as delete + append
 */
export function applyInput(
  state: TypingState,
  nextTyped: string,
  { pauseThresholdMs, now = performance.now() }: ApplyInputOptions,
): TypingState {
  if (state.finished) return state

  const prev = state.typed
  if (nextTyped === prev) return state

  const next: TypingState = { ...state, everWrong: state.everWrong }

  // ---- Timing --------------------------------------------------------------
  if (next.startedAt === null) {
    next.startedAt = now
  } else if (next.lastKeyAt !== null) {
    const gap = now - next.lastKeyAt
    if (gap > pauseThresholdMs) {
      next.longPauses += 1
      next.totalPauseMs += gap
    }
  }
  next.lastKeyAt = now

  // ---- Common prefix -------------------------------------------------------
  let common = 0
  const maxCommon = Math.min(prev.length, nextTyped.length)
  while (common < maxCommon && prev[common] === nextTyped[common]) common++

  const removed = prev.length - common
  const added = nextTyped.length - common

  // ---- Deletions -----------------------------------------------------------
  if (removed > 0) {
    next.backspaces += removed
    // A wrong character that gets deleted counts as a *corrected* error.
    for (let i = common; i < prev.length; i++) {
      if (i < next.source.length && prev[i] !== next.source[i]) {
        next.correctedErrors += 1
      }
    }
    // Deleting always breaks the streak.
    next.currentStreak = 0
  }

  // ---- Insertions ----------------------------------------------------------
  if (added > 0) {
    const everWrong = next.everWrong.slice()
    for (let i = common; i < nextTyped.length; i++) {
      next.totalKeystrokes += 1
      const expected = next.source[i]
      const actual = nextTyped[i]
      if (expected !== undefined && actual === expected) {
        next.correctKeystrokes += 1
        next.currentStreak += 1
        if (next.currentStreak > next.longestStreak) next.longestStreak = next.currentStreak
      } else {
        next.incorrectKeystrokes += 1
        next.currentStreak = 0
        if (i < everWrong.length) everWrong[i] = true
      }
    }
    next.everWrong = everWrong
  }

  next.typed = nextTyped

  // Auto-finish only on a *clean* completion.
  //
  // Finishing on length alone was unfair: mistyping the final character ended
  // the attempt instantly, with no chance to correct it. Now reaching the end
  // with errors still present leaves the candidate in control — they keep
  // typing, correct what they need to, and submit when ready (or the timer
  // does it for them).
  if (nextTyped.length >= next.source.length && nextTyped.startsWith(next.source)) {
    next.finished = true
  }
  return next
}

/** Marks the attempt as complete (timer expiry or explicit submit). */
export function finishTyping(state: TypingState): TypingState {
  return state.finished ? state : { ...state, finished: true }
}

/* -------------------------------------------------------------------------- */
/*  Derived metrics                                                            */
/* -------------------------------------------------------------------------- */

/** Characters that count towards "numeric / data" accuracy. */
const DATA_CHAR = /[0-9$%@./\-()]/

/**
 * Upper bound on reported WPM.
 *
 * The verified human record is roughly 216 WPM, so anything above this is an
 * artefact rather than a measurement — a submission in the first fraction of a
 * second, an automation script, or a clock that barely advanced. Capping keeps
 * dashboards and averages honest; the underlying keystroke counts are untouched,
 * and `TypingMetrics.elapsedSeconds` still shows how the value was produced.
 */
export const MAX_PLAUSIBLE_WPM = 250

export interface MetricsOptions {
  /** Cost of a backspace relative to an uncorrected error. Default 0.2. */
  backspaceWeight?: number
  /**
   * Overrides the backspace count.
   *
   * The server replays a submission as a single input event, so it observes no
   * backspaces of its own and takes the client's count. See the note in
   * `api/assessments.ts` about what that does and does not allow.
   */
  backspaces?: number
}

/**
 * Derives the reported metrics.
 *
 * Accuracy is deliberately character-based rather than keystroke-based, so the
 * live readout during an assessment and the score recorded afterwards are the
 * same number:
 *
 *     accuracy = correctCharacters / (charactersTyped + w * backspaces)
 *
 * A wrong character left in place costs a full point of denominator without
 * contributing to the numerator. A wrong character that gets fixed costs `w`
 * instead — cheaper than leaving it, but no longer free.
 */
export function computeMetrics(
  state: TypingState,
  elapsedSeconds: number,
  options: MetricsOptions = {},
): TypingMetrics {
  const minutes = Math.max(elapsedSeconds, 1) / 60
  const backspaceWeight = options.backspaceWeight ?? 0.2
  const backspaces = options.backspaces ?? state.backspaces

  let correctCharacters = 0
  let uncorrectedErrors = 0
  let dataTotal = 0
  let dataCorrect = 0

  const len = Math.min(state.typed.length, state.source.length)
  for (let i = 0; i < len; i++) {
    const expected = state.source[i]
    const isData = DATA_CHAR.test(expected)
    if (isData) dataTotal += 1
    if (state.typed[i] === expected) {
      correctCharacters += 1
      if (isData) dataCorrect += 1
    } else {
      uncorrectedErrors += 1
    }
  }
  // Characters typed past the end of the source are all errors.
  if (state.typed.length > state.source.length) {
    uncorrectedErrors += state.typed.length - state.source.length
  }

  const rawWpm = state.totalKeystrokes / 5 / minutes
  const wpm = correctCharacters / 5 / minutes

  // Denominator is the work actually performed: every character still present,
  // plus a weighted charge for each correction.
  const effort = state.typed.length + backspaceWeight * backspaces
  const accuracy = effort === 0 ? 0 : (correctCharacters / effort) * 100
  const completionPercentage =
    state.source.length === 0
      ? 0
      : Math.min(100, (state.typed.length / state.source.length) * 100)
  const numericAccuracy = dataTotal === 0 ? 100 : (dataCorrect / dataTotal) * 100

  return {
    rawWpm: clampWpm(rawWpm),
    wpm: clampWpm(wpm),
    accuracy: Math.max(0, Math.min(100, Math.round(accuracy * 10) / 10)),
    totalKeystrokes: state.totalKeystrokes,
    correctKeystrokes: state.correctKeystrokes,
    incorrectKeystrokes: state.incorrectKeystrokes,
    correctedErrors: state.correctedErrors,
    uncorrectedErrors,
    backspaces,
    correctCharacters,
    elapsedSeconds: Math.round(elapsedSeconds),
    completionPercentage: Math.round(completionPercentage * 10) / 10,
    currentStreak: state.currentStreak,
    longestStreak: state.longestStreak,
    longPauses: state.longPauses,
    totalPauseMs: Math.round(state.totalPauseMs),
    numericAccuracy: Math.round(numericAccuracy * 10) / 10,
  }
}

function clampWpm(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0
  return Math.min(MAX_PLAUSIBLE_WPM, Math.round(value))
}

/* -------------------------------------------------------------------------- */
/*  Live per-character comparison                                              */
/* -------------------------------------------------------------------------- */

export interface CharCell {
  char: string
  state: CharState
  index: number
}

/**
 * Builds the per-character render model for the source text.
 *
 * Only the source is rendered with states — the candidate's own textarea keeps
 * its raw value, so input latency, IME composition and native caret behaviour
 * are untouched.
 */
export function buildComparison(state: TypingState): CharCell[] {
  const { source, typed, everWrong } = state
  const cells: CharCell[] = new Array(source.length)
  const cursor = typed.length

  for (let i = 0; i < source.length; i++) {
    let charState: CharState
    if (i >= cursor) {
      charState = i === cursor ? 'current' : 'pending'
    } else if (typed[i] === source[i]) {
      charState = everWrong[i] ? 'corrected' : 'correct'
    } else {
      charState = 'incorrect'
    }
    cells[i] = { char: source[i], state: charState, index: i }
  }
  return cells
}

/**
 * Splits the comparison model into word-sized chunks so React can render long
 * passages without creating one component per character.
 */
export interface ComparisonChunk {
  key: string
  cells: CharCell[]
}

export function chunkComparison(cells: CharCell[]): ComparisonChunk[] {
  const chunks: ComparisonChunk[] = []
  let current: CharCell[] = []
  for (const cell of cells) {
    current.push(cell)
    if (cell.char === ' ' || cell.char === '\n') {
      chunks.push({ key: `c${chunks.length}`, cells: current })
      current = []
    }
  }
  if (current.length) chunks.push({ key: `c${chunks.length}`, cells: current })
  return chunks
}
