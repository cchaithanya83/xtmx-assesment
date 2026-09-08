# Editing assessment content

Two kinds of change, with very different effort:

| Want to change | Where | Deploy needed |
|---|---|---|
| Difficulty, pace, thresholds, prompt count | **Configuration screen in the app** | None |
| The actual text, data pools, phrasing, prompts | Code in `supabase/functions/_shared/` | **Function redeploy** |

> **The deploy rule.** Content lives in `supabase/functions/_shared/`, which the
> **server** uses to issue and score assessments. A Firebase or Netlify deploy
> alone changes nothing — the browser only renders what the API hands it. After
> any content edit:
>
> ```bash
> npx supabase functions deploy api
> ```

---

## 1. No-code changes: the Configuration screen

Sign in as a trainer or admin → **Configuration**. Saved to the database, live
immediately, no deploy.

**Typing:** minimum WPM, accuracy, passing score, minimum completion,
long-pause threshold.

**Audio:** data-accuracy and critical-accuracy minimums, playback speed, voice,
replay and pause permissions.

**Per-level audio difficulty** — a table with a row per level (L1–L5):

| Column | Effect |
|---|---|
| WPM min / max | How fast the caller speaks |
| Fields | How many fields the form asks for |
| Corrections | How many "sorry, correction" moments |
| Prompts | Inline verification prompts |
| Phonetic IDs | "T as in Tango" spelling |

Level N drives Task 2 Assignment N. Raising L1's field count from 4 to 6 makes
the first listening assignment harder for everyone, with no code change.

**Multitasking:** minimum score, and the number of verification prompts in
Assignment 5 specifically.

---

## 2. Task 1 — the typing passages

**File:** [`supabase/functions/_shared/passages.ts`](../supabase/functions/_shared/passages.ts)

Five pools, one per assignment. Each entry:

```ts
{
  id: 'a1-p5',                    // must be unique and stable
  label: 'Escalation Note',       // shown in the assessment header
  kind: 'prose',                  // 'prose' | 'structured' | 'mixed'
  text: 'Thank you for joining…', // exactly what the candidate types
}
```

`pickPassage(assignmentId, attemptNumber)` rotates through the pool by attempt
number, wrapping when exhausted. **Keep at least three per pool** or a retry
hands back text the candidate has already seen.

Entries within one pool should be *equivalent*: similar length, similar
character mix. Assignment 3 is scored on the same basis whichever passage is
issued, so a 200-character passage next to an 800-character one makes the same
assignment materially easier or harder depending on luck.

`\n` inside `text` is a real newline the candidate must type. That is
deliberate for the structured sheets — it is part of the data-entry task.

### The one gotcha

The server stores `passage_id` when it issues a session and resolves it **by
id** on submit:

```ts
const passage = (PASSAGE_POOLS[assignmentId] ?? []).find((p) => p.id === passageId)
if (!passage) throw badRequest('The issued passage could not be resolved')
```

So if you delete or rename an id while a candidate has that passage open, their
submit fails and the attempt is lost. Deploy content changes between sessions,
not during a live training room. Adding new entries is always safe.

### Assignment titles, descriptions, time limits

[`supabase/functions/_shared/tasks.ts`](../supabase/functions/_shared/tasks.ts) —
`title`, `difficulty`, `description`, `objectives`, `timeLimitSeconds`.

---

## 3. Task 2 — the audio

**There is no script to edit.** Every scenario is generated fresh per attempt,
which is what stops candidates memorising answers. You change the *generator*.

### 3a. The values that get spoken

[`supabase/functions/_shared/pools.ts`](../supabase/functions/_shared/pools.ts)

Plain arrays — add or remove freely:

```ts
FIRST_NAMES, LAST_NAMES        // member names
PROVIDERS, PLAN_NAMES          // facilities and plans
COPAY_VALUES, DEDUCTIBLE_VALUES, COINSURANCE_VALUES, OOP_MAX_VALUES
ID_PREFIXES, STATE_CODES       // identifier shapes
BATCHES, LOCATIONS, TRAINERS   // onboarding dropdowns
```

Bigger pools mean less repetition across attempts. Names with apostrophes or
hyphens (`O'Donnell`, `Vasquez-Lin`) are useful — they are exactly where
transcription errors happen.

### 3b. Which fields each level asks for

[`supabase/functions/_shared/scenario.ts`](../supabase/functions/_shared/scenario.ts) → `LEVEL_FIELDS`

```ts
const LEVEL_FIELDS: Record<number, AudioFieldKey[]> = {
  1: ['memberName', 'dob', 'phone', 'memberId'],
  2: ['memberName', 'dob', 'memberId', 'provider', 'copay', 'deductible', 'networkStatus'],
  …
}
```

Order here is **form order**. At level 3+ the *spoken* order is shuffled
separately, which is the skill that assignment trains.

The list is truncated to the Configuration screen's field count, so keep it at
least as long as the largest count you might set.

To add a field type that does not exist yet, add it to `AudioFieldKey` in
[`types.ts`](../supabase/functions/_shared/types.ts), give it a spec in
`FIELD_SPECS`, a generator in `generateValues()`, and a spoken form in
`speakField()`. Add it to `CRITICAL_FIELDS` if an error there should carry the
heavier penalty.

### 3c. How it is phrased

`speakField()` in `scenario.ts` — one case per field, with variants picked at
random:

```ts
case 'dob':
  return pick([
    `Date of birth ${dateToWords(value)}.`,
    `The member's date of birth is ${dateToWords(value)}.`,
    `Born ${dateToWords(value)}.`,
  ], rng)
```

Add variants to make repeated attempts feel less templated.

Conversational filler is in `pools.ts`: `INTRO_LINES`, `FILLER_LINES`,
`OUTRO_LINES`. These carry no data — they exist so the audio sounds like a call
rather than a database row being read out.

Number and date verbalisation lives in
[`speech.ts`](../supabase/functions/_shared/speech.ts): `numberToWords`,
`currencyToWords`, `dateToWords`, `phoneToWords`, `idToWords`. Change these only
if you want a different spoken convention — e.g. British "one thousand seven
hundred *and* fifty" versus American "seventeen fifty".

### 3d. The verification prompts

`buildVerificationPrompts()` in `scenario.ts`. Each candidate prompt is a
function returning `null` when its field is not in play at that level:

```ts
() => fields.includes('networkStatus')
  ? {
      id: uid('vp'),
      question: 'What is the provider network status?',
      options: ['In Network', 'Out of Network', 'Not Provided'],
      correctAnswer: values.networkStatus,
      triggerAtProgress: 0,   // assigned below; spread across the timeline
    }
  : null,
```

Add an entry to add a prompt. `correctAnswer` **must** appear in `options`, and
the distractors should be plausible — a wrong option nobody would pick measures
nothing. `triggerAtProgress` is overwritten: prompts are spread across the
middle 70% of the audio automatically.

`correctAnswer` never leaves the server. The client receives the question and
options only, and grading happens on submit.

### 3e. Which fields can carry a spoken correction

`CORRECTABLE` in `scenario.ts`. Only values with a sensible alternative belong
here — correcting a member's *name* mid-call would be strange, correcting a
deductible is routine.

---

## 4. After editing

```bash
npm run build                      # typechecks the shared code
npx supabase functions deploy api  # REQUIRED — the server owns content
npx firebase deploy --only hosting # only if you also changed the UI
```

Then sanity-check the change by starting the affected assignment in **practice
mode** — it is recorded but never counts toward certification.

For Task 2, practice mode also allows replay, which makes it much easier to
hear whether new phrasing actually sounds right.
