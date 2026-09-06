import type { Assignment, Task } from '@/types'
import { A1_PASSAGES, A2_PASSAGES, A3_PASSAGES, A4_PASSAGES, A5_PASSAGES } from './passages'

/**
 * Static task/assignment catalogue. Candidate-specific state (status, attempts,
 * best scores) lives in the store and is joined against this at render time.
 */

const TASK1_ASSIGNMENTS: Assignment[] = [
  {
    id: 1,
    taskId: 1,
    title: 'Basic Professional Typing',
    difficulty: 'Easy',
    description:
      'Reproduce a professional operations paragraph exactly as written. Establishes your baseline speed and accuracy on continuous prose.',
    objectives: [
      'Sustain a steady rhythm across continuous prose',
      'Maintain punctuation and capitalisation accuracy',
      'Complete the passage within the time limit',
    ],
    timeLimitSeconds: 240,
    passagePool: A1_PASSAGES,
  },
  {
    id: 2,
    taskId: 1,
    title: 'Names, Dates & Numbers',
    difficulty: 'Easy–Medium',
    description:
      'Enter a structured member intake sheet containing names, dates of birth, phone numbers, email addresses and monetary values.',
    objectives: [
      'Transcribe proper nouns without spelling drift',
      'Keep date and currency formatting exact',
      'Handle punctuation-heavy fields such as email and phone',
    ],
    timeLimitSeconds: 300,
    passagePool: A2_PASSAGES,
  },
  {
    id: 3,
    taskId: 1,
    title: 'IDs & Alphanumeric Data',
    difficulty: 'Medium',
    description:
      'Capture member IDs, policy numbers, authorization numbers and reference IDs that mix letters, digits and separators.',
    objectives: [
      'Reproduce mixed alphanumeric identifiers character-for-character',
      'Preserve hyphens, case and digit grouping',
      'Avoid transposition errors in long numeric strings',
    ],
    timeLimitSeconds: 300,
    passagePool: A3_PASSAGES,
  },
  {
    id: 4,
    taskId: 1,
    title: 'Healthcare Data Entry',
    difficulty: 'Medium–Hard',
    description:
      'Type a benefit verification note combining clinical terminology with a structured benefits block: deductible, coinsurance, eligibility, prior authorization and network status.',
    objectives: [
      'Spell healthcare terminology accurately under time pressure',
      'Switch cleanly between prose and structured field entry',
      'Keep monetary and percentage values exact',
    ],
    timeLimitSeconds: 420,
    passagePool: A4_PASSAGES,
  },
  {
    id: 5,
    taskId: 1,
    title: 'Advanced Mixed Data Challenge',
    difficulty: 'Hard',
    description:
      'A full escalation case file: professional narrative plus names, DOBs, IDs, dates, monetary values and healthcare terminology — under a stricter timer.',
    objectives: [
      'Sustain accuracy across a long, mixed-format document',
      'Maintain speed while switching character classes constantly',
      'Finish within a compressed time budget',
    ],
    timeLimitSeconds: 480,
    passagePool: A5_PASSAGES,
  },
]

const TASK2_ASSIGNMENTS: Assignment[] = [
  {
    id: 1,
    taskId: 2,
    title: 'Basic Listening & Capture',
    difficulty: 'Easy',
    description:
      'AI-generated audio states member name, date of birth, phone number and member ID clearly and in form order. Capture each value into the correct field.',
    objectives: [
      'Capture four core identity fields from live audio',
      'Keep pace with a 100–110 WPM speaker',
      'Format dates and phone numbers correctly',
    ],
    timeLimitSeconds: 300,
    audioLevel: 1,
  },
  {
    id: 2,
    taskId: 2,
    title: 'Healthcare Information Capture',
    difficulty: 'Medium',
    description:
      'The caller adds provider, copay, deductible, network status and effective date to the identity block. Seven fields, still spoken in form order.',
    objectives: [
      'Capture benefit values alongside identity data',
      'Distinguish copay, deductible and coinsurance',
      'Record network status accurately',
    ],
    timeLimitSeconds: 360,
    audioLevel: 2,
  },
  {
    id: 3,
    taskId: 2,
    title: 'Fast & Out-of-Order Information',
    difficulty: 'Medium–Hard',
    description:
      'The speaker moves faster and delivers information out of sequence — authorization number first, then DOB, then provider. You must route each value to the right field.',
    objectives: [
      'Route out-of-sequence data to the correct fields',
      'Hold values in short-term memory while navigating',
      'Sustain accuracy at 120–130 WPM',
    ],
    timeLimitSeconds: 420,
    audioLevel: 3,
  },
  {
    id: 4,
    taskId: 2,
    title: 'Corrections & Complex IDs',
    difficulty: 'Hard',
    description:
      'The caller corrects themselves mid-sentence and spells identifiers phonetically ("T as in Tango, X as in X-ray"). Only the corrected value counts.',
    objectives: [
      'Apply spoken corrections and discard superseded values',
      'Decode phonetic alphabet spelling into identifiers',
      'Maintain critical-data accuracy above 85%',
    ],
    timeLimitSeconds: 480,
    audioLevel: 4,
  },
  {
    id: 5,
    taskId: 2,
    title: 'Full Multitasking Simulation',
    difficulty: 'Advanced',
    description:
      'The final challenge. Listen continuously, type into structured fields, handle corrections, update prior values and answer inline verification prompts while new audio keeps arriving.',
    objectives: [
      'Keep typing while audio continues playing',
      'Answer verification prompts without losing the stream',
      'Handle multiple corrections and out-of-order delivery',
      'Achieve a multitasking score of at least 75%',
    ],
    timeLimitSeconds: 600,
    audioLevel: 5,
  },
]

export const TASKS: Task[] = [
  {
    id: 1,
    title: 'Keyboard Typing Speed & Accuracy',
    subtitle: 'Transcription, structured data entry and identifier precision',
    weight: 0.4,
    assignments: TASK1_ASSIGNMENTS,
  },
  {
    id: 2,
    title: 'AI Audio Listening & Multitasking',
    subtitle: 'Real-time listening, critical data capture and correction handling',
    weight: 0.6,
    assignments: TASK2_ASSIGNMENTS,
  },
]

export function getTask(taskId: number): Task {
  const task = TASKS.find((t) => t.id === taskId)
  if (!task) throw new Error(`Unknown task ${taskId}`)
  return task
}

export function getAssignment(taskId: number, assignmentId: number): Assignment {
  const assignment = getTask(taskId).assignments.find((a) => a.id === assignmentId)
  if (!assignment) throw new Error(`Unknown assignment ${taskId}-${assignmentId}`)
  return assignment
}

export const TOTAL_ASSIGNMENTS = TASKS.reduce((sum, t) => sum + t.assignments.length, 0)
