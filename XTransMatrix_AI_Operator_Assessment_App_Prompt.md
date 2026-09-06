# Build a React Web App — AI Operator Typing, Listening & Multitasking Certification Platform

Create a modern, production-quality React web application for **XTransMatrix Consulting Services Pvt. Ltd.** that evaluates new AI Operator candidates on:

- Keyboard typing speed
- Typing accuracy
- Structured data entry
- Real-time listening
- AI-generated audio comprehension
- Critical data capture
- Correction handling
- Multitasking
- Final certification readiness

The application should feel like a professional internal training platform, not a casual typing game.

## Core Product Goal

Build one complete web app with **2 Tasks**, each containing **5 progressive assignments**.

Candidates must pass each assignment before unlocking the next one.

They can retry an assignment multiple times until they reach the required passing standard.

The app must track every attempt, improvement trend, WPM, accuracy, critical-data accuracy, final score, and certification status.

After all 10 assignments are passed, generate a professional downloadable **PDF certificate** containing the candidate's name, speed, accuracy, final score, performance level, certificate ID, and completion date.

---

## Tech Stack

Use:

- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui where useful
- React Router
- Recharts for analytics
- Lucide icons
- Framer Motion only for subtle transitions
- Zustand or Context API for local/global app state
- Supabase for production-ready persistence
- PDF generation using `jspdf` + `html2canvas` or another robust client-side PDF library
- Web Speech API for browser TTS fallback
- Design the audio layer so it can later connect to an external AI TTS API such as OpenAI, ElevenLabs, or Azure Speech

Do not build this as a static mockup. Make the workflows functional.

---

## Overall Navigation

Create these main sections:

1. **Login / Candidate Setup**
2. **Candidate Dashboard**
3. **Task 1 — Keyboard Typing Speed & Accuracy**
4. **Task 2 — AI Audio Listening & Multitasking**
5. **Attempt History**
6. **Final Results**
7. **Certificate**
8. **Trainer Dashboard**
9. **Trainer Candidate Detail View**
10. **Settings / Assessment Configuration**

Use route-based navigation.

---

## User Roles

### Candidate

Can:

- Enter or select their name
- Start assignments
- Retry failed assignments
- See unlocked/locked assignments
- View live WPM
- View live accuracy
- Complete audio-based assignments
- View results
- View attempt history
- Download certificate after certification

### Trainer / Admin

Can:

- View all candidates
- See current task and assignment
- See WPM
- See accuracy
- See score
- See risk level
- See attempt counts
- View detailed performance
- Review improvement trend
- Reset assignments
- Change passing thresholds
- Configure assessment difficulty
- Export candidate results
- View certificate status

---

## Candidate Onboarding Screen

Before starting, show a clean candidate setup flow.

Fields:

- Candidate Full Name
- Employee / Candidate ID
- Email
- Batch / Cohort
- Location
- Trainer name

Primary button:

**Start Assessment**

Show a clear assessment overview:

- 2 Main Tasks
- 10 Assignments
- Minimum score: 75%
- Typing target: 30 WPM
- Typing accuracy target: 85%
- Critical data accuracy target: 85%
- All assignments must be passed to become certified

---

## Candidate Dashboard

The dashboard should immediately show:

### Welcome

`Welcome, Akhilesh`

### Certification Progress

`6 / 10 assignments completed`

Progress bar

### Overall Performance

- Current overall score
- Average WPM
- Average accuracy
- Listening accuracy
- Critical-data accuracy
- Multitasking score
- Total attempts

### Two Main Task Cards

---

# Task 1 — Keyboard Typing Speed & Accuracy

Weight in final certification:

**40%**

Show:

**5 Assignments**

Each assignment card shows:

- Assignment number
- Title
- Difficulty
- Status
- Best score
- Best WPM
- Best accuracy
- Attempts
- Start / Retry button

Locked assignments should visually show a lock icon and:

`Pass Assignment 2 to unlock`

---

## Task 1 Assignment Structure

### Assignment 1 — Basic Professional Typing

Difficulty:

**Easy**

Candidate copies a professional paragraph.

Measure:

- WPM
- accuracy
- errors
- backspaces
- completion
- elapsed time

### Assignment 2 — Names, Dates & Numbers

Difficulty:

**Easy–Medium**

Candidate enters structured data including:

- names
- DOB
- phone number
- dates
- monetary values
- email addresses

### Assignment 3 — IDs & Alphanumeric Data

Difficulty:

**Medium**

Include:

- member IDs
- policy numbers
- authorization numbers
- reference IDs
- mixed letters and digits
- email addresses
- phone numbers

Example:

`UHC7845AX92`

`PA-884319-B`

`REF-72391TX`

### Assignment 4 — Healthcare Data Entry

Difficulty:

**Medium–Hard**

Include terminology such as:

- deductible
- coinsurance
- eligibility
- prior authorization
- out-of-pocket maximum
- specialist copay
- servicing provider
- network status

Mix normal paragraphs and structured fields.

### Assignment 5 — Advanced Mixed Data Challenge

Difficulty:

**Hard**

Combine:

- professional paragraph
- names
- numbers
- DOB
- IDs
- dates
- monetary values
- healthcare terminology
- structured data entry

Use a stricter timer.

---

## Task 1 Real-Time Typing Engine

This is one of the most important features.

While the candidate types, update metrics live.

Display prominently:

### Live WPM

Example:

`34 WPM`

### Live Accuracy

`94%`

### Timer

`01:42`

### Progress

`68%`

### Errors

`6`

### Correct Characters

`482`

### Backspaces

`17`

### Current Streak

`43 correct`

---

## Live Text Comparison

The source text must visually react as the candidate types.

Use per-character comparison.

Display:

- correct characters visually marked
- incorrect characters highlighted
- current character visibly indicated
- untyped text neutral
- completed text readable

Do not replace the candidate's typed text.

Typing should remain responsive even for long passages.

Track:

- total keystrokes
- correct keystrokes
- incorrect keystrokes
- corrected errors
- raw WPM
- net WPM
- accuracy percentage
- backspace count
- pauses longer than a configurable threshold

---

## Task 1 Score Formula

Each assignment scores out of **100**.

| Metric | Weight |
|---|---:|
| Typing Speed | 30 |
| Accuracy | 40 |
| Data / Number Accuracy | 20 |
| Completion | 10 |

Total:

**100**

---

## Typing Speed Score

Default scoring:

- 40+ WPM = 30 points
- 35–39 WPM = 27
- 30–34 WPM = 24
- 25–29 WPM = 17
- 20–24 WPM = 10
- Below 20 = 0

Allow trainer to edit thresholds.

---

## Task 1 Passing Conditions

Candidate must satisfy all of these:

- Overall score >= 75
- WPM >= 30
- Accuracy >= 85%

If score is 82 but WPM is 27:

Status:

**Retry Required**

Explain why.

Example:

`Overall score passed, but minimum typing speed was not achieved.`

---

# Task 2 — AI Audio Listening, Typing & Multitasking

Weight in final certification:

**60%**

Task 2 also contains 5 assignments.

Every retry should use a new randomized scenario.

---

## AI Audio Generation Architecture

Create a scenario generator.

Each scenario should produce structured JSON like:

```ts
{
  memberName: "Jennifer Anderson",
  dob: "04/17/1991",
  memberId: "BC784592",
  provider: "North Valley Medical Center",
  phone: "2145550187",
  copay: 40,
  deductible: 1500,
  coinsurance: "20%",
  networkStatus: "In Network",
  authorizationNumber: "PA87452",
  referenceNumber: "REF78219",
  effectiveDate: "01/01/2026",
  terminationDate: null,
  notes: ""
}
```

Then generate a spoken script from the scenario.

The architecture should support:

- browser TTS fallback
- future API TTS integration
- different voices
- different speaking speeds
- realistic pauses
- controlled complexity by level

Do not hard-code audio files only.

---

## Task 2 Assignment 1 — Basic Listening & Capture

Difficulty:

**Easy**

Audio gives:

- member name
- DOB
- phone
- member ID

Information is spoken clearly and in form order.

Candidate enters values into structured fields.

---

## Task 2 Assignment 2 — Healthcare Information Capture

Difficulty:

**Medium**

Add:

- provider
- copay
- deductible
- network status
- effective date
- plan information

---

## Task 2 Assignment 3 — Fast & Out-of-Order Information

Difficulty:

**Medium–Hard**

Audio speaks slightly faster.

Information is not given in the same sequence as the form.

Example:

Audio says authorization number first, then DOB, then provider, then member name.

Candidate must understand and put the information into the correct fields.

---

## Task 2 Assignment 4 — Corrections & Complex IDs

Difficulty:

**Hard**

Audio includes spoken corrections.

Example:

`The deductible is one thousand five hundred dollars. Sorry, correction, the deductible is one thousand seven hundred and fifty dollars.`

Expected final value:

`1750`

Also include phonetic IDs:

`T as in Tango, X as in X-ray, seven nine four two, B as in Bravo.`

Expected:

`TX7942B`

---

## Task 2 Assignment 5 — Full Multitasking Simulation

Difficulty:

**Advanced**

This is the final challenge.

Candidate must:

- listen continuously
- type into structured fields
- navigate between fields
- handle corrections
- answer inline verification prompts
- update prior values
- manage information arriving out of order
- continue working while new audio information is playing

Example verification prompt appearing mid-task:

### Verification Required

What is the provider network status?

- In Network
- Out of Network
- Not Provided

Do not pause the audio automatically unless configured by trainer.

---

## Task 2 Audio Player Rules

During assessment mode:

- play
- pause only if trainer allows
- no rewind by default
- no skip forward
- no changing playback speed
- visible progress bar
- elapsed time
- total audio duration

For practice mode, allow replay.

For certification mode, default to no replay.

---

## AI Audio Scenario Difficulty Engine

Create a difficulty configuration object.

### Level 1

- 100–110 words/minute
- 4 fields
- no corrections
- in-order data

### Level 2

- 110–120 WPM
- 6–7 fields
- healthcare data

### Level 3

- 120–130 WPM
- 8 fields
- out-of-order information

### Level 4

- 130–140 WPM
- corrections
- phonetic IDs
- longer numeric values

### Level 5

- 135–150 WPM
- 10–12 fields
- multiple corrections
- verification prompt
- out-of-order data
- multitasking

Make all values configurable from trainer settings.

---

## Task 2 Real-Time Tracking

Track:

- field entered
- first input timestamp
- last edit timestamp
- time per field
- correction count
- skipped fields
- wrong fields
- critical errors
- final field values
- field navigation count
- pause duration
- total completion time
- audio progress when each value was entered
- whether the candidate corrected data after audio correction

---

## Critical Data Fields

Mark these as critical:

- Member ID
- Policy number
- Authorization number
- Reference number
- DOB
- Phone
- Dates
- Copay
- Deductible
- Coinsurance

A critical-data error should carry a stronger penalty.

---

## Task 2 Score Formula

Every assignment scores out of **100**.

| Metric | Weight |
|---|---:|
| Information Capture | 25 |
| Data Accuracy | 25 |
| Critical Data Accuracy | 20 |
| Listening / Multitasking | 15 |
| Correction Handling | 10 |
| Completion | 5 |

Total:

**100**

---

## Task 2 Passing Conditions

Candidate must achieve:

- Overall score >= 75
- Data accuracy >= 85%
- Critical-data accuracy >= 85%

For Assignment 5 also require:

- Multitasking score >= 75%

---

## Assignment Progression

Assignments unlock sequentially.

Initial state:

Assignment 1:

**Unlocked**

Assignments 2–5:

**Locked**

After passing Assignment 1:

Assignment 2 unlocks.

Repeat through Assignment 5.

Apply the same model independently to both tasks.

---

## Retry System

Candidates can retry failed assignments.

Show result screen:

### Assignment Not Passed

**Score**
68 / 100

**Target**
75

**WPM**
27 / 30 required

**Accuracy**
82% / 85% required

### Improvement Areas

- Typing speed below target
- Accuracy below target
- Too many numeric errors

Buttons:

- **Retry Assignment**
- **Practice Before Retry**
- **Return to Dashboard**

---

## Retry Scenario Rules

For Task 1:

Generate or select a different equivalent passage/data set on retry.

For Task 2:

Generate a completely new scenario with:

- same difficulty
- same field count
- same scoring
- different names
- different IDs
- different values
- different correction positions

This prevents memorization.

---

## Attempt Tracking

Store every attempt.

Example:

| Attempt | Score | WPM | Accuracy | Status |
|---|---:|---:|---:|---|
| 1 | 61 | 24 | 80% | Failed |
| 2 | 69 | 28 | 84% | Failed |
| 3 | 77 | 31 | 88% | Passed |

Track:

- first attempt
- latest attempt
- best attempt
- passing attempt
- number of attempts
- improvement percentage

---

## Candidate Results Page

Show individual assignment scores.

### Task 1

- Assignment 1
- Assignment 2
- Assignment 3
- Assignment 4
- Assignment 5

Show:

- best score
- WPM
- accuracy
- attempts
- pass status

### Task 2

Same structure.

---

## Final Certification Calculation

Calculate:

```text
Task 1 Average × 40%
+
Task 2 Average × 60%
=
Final Certification Score
```

Example:

Task 1:

86%

Task 2:

82%

Final:

83.6%

---

## Final Performance Classification

Use these bands:

### 95–100%

**High Performance**

### 85–94%

**Mid Performance**

### 80–84%

**Low Performance — Monitor**

### 76–79%

**Danger Candidate**

### Below 75%

**Not Certified**

Certification should still require all mandatory gates to pass.

---

## Final Certification Requirements

Certificate only unlocks when:

- Task 1 = 5/5 passed
- Task 2 = 5/5 passed
- Overall score >= 75
- WPM >= 30
- typing accuracy >= 85%
- critical-data accuracy >= 85%
- Assignment 5 multitasking >= 75%

Show:

`10 / 10 Assignments Completed`

and:

`Certification Status: PASSED`

---

## Certificate Generation

Generate a professional PDF certificate.

Use XTransMatrix branding.

Certificate should include:

**XTransMatrix Consulting Services Pvt. Ltd.**

**CERTIFICATE OF COMPLETION**

Text:

`This certifies that`

### Candidate Name

`has successfully completed the`

### AI Operator Keyboard, Listening & Real-Time Data Entry Assessment

and demonstrated competency in:

- Typing Speed
- Typing Accuracy
- Active Listening
- Structured Data Entry
- Critical Data Capture
- Correction Handling
- Multitasking

Show large metrics:

**38 WPM**

**96% Accuracy**

**88/100 Overall**

Also show:

- Listening Accuracy
- Critical Data Accuracy
- Multitasking Score
- Assignments Completed: 10/10
- Performance Classification
- Certification Date
- Certificate ID

Example:

`XTMX-KB-2026-00841`

Buttons:

- **Download Certificate PDF**
- **Print Certificate**

Use a clean modern certificate layout.

---

## Trainer Dashboard

Create a separate trainer view.

Top KPI cards:

- Total Candidates
- Certified
- In Progress
- Needs Coaching
- Danger
- Not Certified

Main table:

| Candidate | Task | Assignment | Attempts | WPM | Accuracy | Score | Risk | Status |
|---|---|---|---:|---:|---:|---:|---|---|

Allow:

- search
- filter by batch
- filter by status
- filter by task
- filter by risk
- sort by WPM
- sort by score
- sort by accuracy

---

## Trainer Live View

Create a live assessment monitoring screen.

Example:

| Candidate | Live Task | WPM | Accuracy | Progress | Current Score | Risk |
|---|---|---:|---:|---:|---:|---|
| Candidate 01 | T2-A3 | 37 | 96% | 72% | 91 | Green |
| Candidate 02 | T1-A4 | 25 | 81% | 54% | 67 | Red |
| Candidate 03 | T2-A5 | 32 | 88% | 65% | 79 | Danger |

Use subtle live indicators.

---

## Candidate Detail View

Trainer should be able to open a candidate.

Show:

### Profile

- Name
- Candidate ID
- Batch
- Location

### Overall Metrics

- Final score
- Avg WPM
- Avg accuracy
- Critical accuracy
- Listening accuracy
- Multitasking score

### Attempt History Chart

Line chart:

Attempt number vs score

Second chart:

WPM vs accuracy

### Assignment History

Expandable rows.

Each attempt should display:

- score
- time
- errors
- backspaces
- critical mistakes
- completion
- feedback

---

## Risk Classification

Use:

- Green
- Mid
- Low
- Danger
- Below Standard

Visual tags should be clear but professional.

Avoid overly bright colors.

---

## Trainer Settings

Trainer should be able to configure:

### Typing Requirements

- minimum WPM
- minimum accuracy
- passing score

### Audio Requirements

- minimum data accuracy
- minimum critical accuracy
- replay allowed
- playback speed
- voice
- scenario duration

### Multitasking

- minimum multitasking score
- verification prompt frequency

### Retry Settings

- unlimited retry
- max attempts
- require practice before retry
- lockout duration

Default:

Unlimited retries.

---

## Feedback Engine

After every attempt automatically generate structured feedback.

Example:

### Strengths

- Strong professional-text typing
- Good handling of names and basic IDs
- Maintained steady WPM

### Improvement Areas

- Numeric accuracy
- DOB entry
- Listening while navigating fields
- Correction handling

### Recommended Practice

- Task 1 Assignment 3 practice
- 5-minute numeric typing drill
- Task 2 correction simulation

Use rules-based feedback initially.

Design so AI-generated coaching can be added later.

---

## Visual Design

Use a modern professional internal-enterprise style.

Design direction:

- white / near-white background
- deep navy text
- slate borders
- restrained teal/accent color
- soft cards
- clean typography
- high information density without clutter

Use:

**Manrope** style typography if available.

Monospace font for:

- IDs
- timers
- WPM
- numeric data
- scores

Do not make it look like a children's typing game.

---

## Candidate Assessment UI

During an assessment, minimize distractions.

Top header:

- assignment
- difficulty
- timer
- WPM
- accuracy
- progress

Main content:

### Task 1

**Source text on left**

**Typing area on right**

or responsive stacked version.

### Task 2

**Audio player / waveform**

+

**structured form**

+

**verification prompts**

---

## Responsive Requirements

Desktop is primary because this is a training-room system.

Still make the UI responsive.

Recommended:

- desktop >= 1280px optimized
- tablet usable
- mobile view for dashboard/results
- assessment itself can show a warning recommending desktop keyboard

---

## Data Model

Create types/interfaces for:

```ts
Candidate
Trainer
Task
Assignment
Attempt
TypingMetrics
AudioScenario
AudioField
AssessmentResult
Certification
TrainerSettings
```

Suggested `Attempt` structure:

```ts
type Attempt = {
  id: string
  candidateId: string
  taskId: 1 | 2
  assignmentId: number
  attemptNumber: number

  startedAt: string
  completedAt: string

  score: number
  passed: boolean

  wpm?: number
  rawWpm?: number
  accuracy?: number

  dataAccuracy?: number
  criticalDataAccuracy?: number
  multitaskingScore?: number
  correctionScore?: number

  totalKeystrokes: number
  incorrectKeystrokes: number
  backspaces: number

  completionPercentage: number

  feedback: {
    strengths: string[]
    improvements: string[]
    recommendation: string[]
  }
}
```

---

## Scenario Generator

Create helper utilities for realistic random data.

Generate:

### Names

Use a large randomized set.

### DOB

Valid adult DOB.

### Member IDs

Patterns such as:

- ABC123456
- UHC7845AX92
- BC784592

### Authorization Numbers

- PA784521
- AUTH-89372
- TX-PA-87291

### References

- REF872391
- CALL-728391
- RQ-89231

### Healthcare Values

Copay:

- $20
- $30
- $40
- $50
- $75

Deductible:

- $500
- $750
- $1,000
- $1,500
- $1,750
- $2,000
- $3,000

Coinsurance:

- 10%
- 20%
- 30%

Network status:

- In Network
- Out of Network

---

## Audio Script Generator

Generate natural speech from structured data.

Do not sound like reading a database row.

Example:

`Thank you. The member is Jennifer Anderson, date of birth April seventeenth, nineteen ninety-one. The member ID is B as in Bravo, C as in Charlie, seven eight four five nine two.`

Level 4 example:

`The deductible is one thousand five hundred dollars. Actually, let me correct that. The deductible is one thousand seven hundred and fifty dollars.`

Level 5 example:

Mix:

- interruptions
- corrections
- out-of-order data
- longer pauses
- phonetic spelling
- multiple numeric values

---

## Audio Generation Interface

Create an abstraction:

```ts
interface TTSProvider {
  generateSpeech(
    text: string,
    options: {
      voice?: string
      speed?: number
    }
  ): Promise<string>
}
```

Implement:

### BrowserTTSProvider

Uses SpeechSynthesis API.

Also create placeholder adapter structure for:

- OpenAITTSProvider
- ElevenLabsProvider

Do not expose API keys in frontend code.

Leave server-side integration points documented.

---

## Security / Assessment Integrity

For certification mode:

- disable copy/paste in typing box
- prevent pasting
- detect tab switching where practical
- record window blur/focus count
- show trainer flag if candidate leaves assessment screen
- do not auto-fail only because of one blur
- log suspicious events for trainer review
- randomize scenarios
- do not expose correct answers before submission

---

## Result Screen

After each assignment show a strong visual result.

Example:

## PASSED

**82 / 100**

Metrics:

- WPM 34
- Accuracy 92%
- Data Accuracy 94%
- Critical Accuracy 96%
- Attempts 2

Then:

### Strengths

### Needs Improvement

### Next Assignment

Button:

**Continue to Assignment 4**

For failed result:

## RETRY REQUIRED

Show exact failing gates.

Example:

`Typing speed: 27 WPM`

`Minimum required: 30 WPM`

Button:

**Retry Assignment**

---

## Final Candidate Dashboard State

When all assignments are complete, transform the dashboard into a certification summary.

Show:

### Certification Complete

Candidate Name

**Final Score: 88/100**

**38 WPM**

**96% Accuracy**

**91% Listening Accuracy**

**95% Critical Data Accuracy**

**87% Multitasking**

**10 / 10 Assignments Passed**

### Performance Classification

MID PERFORMANCE

Primary CTA:

**Download Certificate**

Secondary CTA:

**View Full Performance Report**

---

## Important Product Rules

1. Candidate cannot skip locked assignments.
2. Each assignment must be individually passed.
3. Retrying should not erase previous attempts.
4. Best attempt and first attempt must both remain visible to trainer.
5. Task 2 retry should create a new scenario.
6. Candidate only receives certificate when all certification requirements are met.
7. Trainer should always be able to see why a candidate passed or failed.
8. Do not reduce evaluation to WPM only.
9. Critical-data accuracy is a major component of certification.
10. Multitasking must be evaluated explicitly in Task 2 Assignment 5.

---

## Seed Demo Data

Include demo candidates so the trainer dashboard looks realistic.

Create at least 12 candidates with mixed statuses:

- Certified
- In Progress
- Needs Coaching
- Danger
- Not Certified

Include realistic scores between 60 and 98.

---

# Final Deliverable

Build the complete functional React app with:

- polished UI
- reusable components
- robust TypeScript types
- working routing
- candidate workflow
- real-time typing engine
- WPM calculation
- accuracy calculation
- 2 tasks
- 5 assignments each
- lock/unlock logic
- retries
- random scenarios
- browser-generated audio
- audio-driven structured data entry
- multitasking verification prompts
- scoring engine
- trainer dashboard
- attempt history
- performance analytics
- final certification calculation
- downloadable PDF certificate
- responsive layout
- clear comments for later backend/TTS integration

The final experience should feel like a real **XTransMatrix AI Operator Readiness & Certification Platform**, not a prototype.
