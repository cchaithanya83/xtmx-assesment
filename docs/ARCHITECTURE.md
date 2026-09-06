# Architecture

The platform is **server-authoritative**. The browser renders and captures; the
server decides everything that matters.

```
┌──────────┐   Supabase Auth (JWT)   ┌──────────────────┐   service_role   ┌──────────┐
│ Browser  │ ──────────────────────► │ Edge Function    │ ───────────────► │ Postgres │
│ (React)  │ ◄────── scoped JSON ─── │ `api`            │ ◄─────────────── │  + RLS   │
└──────────┘                         └──────────────────┘                  └──────────┘
                                      authorises every
                                      request, then scopes
                                      the query by identity
```

**The browser has no database access.** Every table has RLS enabled with *no
policies*, which in Postgres denies `anon` and `authenticated` outright. The
only credential that can read data is the service role key, and it exists solely
inside the Edge Function.

---

## Why it is built this way

An earlier version kept the whole workspace in the browser: one snapshot fetched
on load, filtered client-side. That was wrong on three counts, and each is now
closed:

| Problem | Fix |
|---|---|
| Every visitor downloaded every user's password hash | Supabase Auth owns credentials; no password column exists |
| Every visitor downloaded the entire cohort's attempts (~254 KB and growing) | Queries are scoped and paginated server-side |
| The client computed its own score and posted it | The server scores from a stored session it issued |

---

## Request lifecycle

Every authenticated request follows the same path, in
[`supabase/functions/api/index.ts`](../supabase/functions/api/index.ts):

1. **Verify** — `authenticate()` validates the bearer JWT against Supabase Auth.
2. **Resolve** — the token's `sub` is looked up in `profiles` to get role and
   linked candidate. A disabled account is rejected here, so revocation takes
   effect immediately rather than when the token expires.
3. **Authorise** — `requireStaff()` / `requireAdmin()` guard the route.
4. **Scope** — `resolveCandidateId()` decides *whose* data the query may touch.

That fourth step is the one that matters most:

```ts
export function resolveCandidateId(caller: Caller, requested?: string): string {
  if (caller.profile.role === 'candidate') {
    // A candidate's own id, always. Any id in the request is ignored, so
    // tampering with it changes nothing.
    return caller.profile.candidateId
  }
  return requested   // staff may address any candidate
}
```

A candidate cannot widen a query, because they never get to say who they are.

---

## Assessment integrity

Two properties are enforced server-side.

### The answer key never reaches the browser

`POST /assessments/start` generates the Task 2 scenario **on the server** and
stores it in `assessment_sessions`, answer key included. The response is a
projection with `expected`, `supersededValue` and `correctAnswer` stripped:

```ts
fields: scenario.fields.map((f) => ({
  key: f.key, label: f.label, type: f.type, critical: f.critical,
  placeholder: f.placeholder, options: f.options, hint: f.hint,
  // note: no `expected`
}))
```

The spoken script *does* still reach the client, because the browser's speech
engine has to read it aloud — the candidate is meant to receive that
information, by ear. Moving to a hosted TTS provider closes even that gap, since
the client would then receive audio instead of text
([`TTS_INTEGRATION.md`](TTS_INTEGRATION.md)).

### The score is computed on the server

`POST /assessments/submit` sends **raw work**, never a score:

| Task | What the client sends |
|---|---|
| 1 | The typed text |
| 2 | The captured field values, plus interaction telemetry |

The server then:

- loads the session it issued and refuses if it was already consumed;
- measures elapsed time from its **own** `started_at`, capped at the assignment
  limit — a client cannot claim to have typed 500 words in one second;
- replays the typing engine over the submitted text against the passage it
  issued;
- re-grades verification prompts against the stored prompts, ignoring the
  client's `correct` flag;
- clamps every client-reported telemetry number into a plausible range.

Sequential unlocking is enforced here too, so a hand-crafted request cannot skip
to Assignment 5.

**What is still client-observed:** keystroke-level detail (backspaces, corrected
errors) and the timing of field entry relative to audio progress. These cannot
be derived from a final submission. They are recorded for the trainer and feed
the listening/multitasking component, but they are excluded from the components
that decide a pass.

---

## Shared code

Scoring lives in exactly one place. [`supabase/functions/_shared/`](../supabase/functions/_shared)
is imported by both runtimes:

- **Deno** (the Edge Function) via relative `./scoring.ts` imports;
- **Vite** (the browser) via the `@shared` alias.

The browser uses it for the live WPM/accuracy readout during an assessment —
which must be instant, and is purely cosmetic. The server uses the same
functions to produce the score that counts. They cannot drift, because they are
the same file.

`_shared` must stay free of Deno globals and browser globals alike; anything
server-only belongs in [`_server/`](../supabase/functions/_server).

---

## Data fetching

There is no caching library, deliberately: every screen wants fresh
server-scoped data, and post-mutation staleness is the bug being avoided.

- [`src/hooks/useApi.ts`](../src/hooks/useApi.ts) — fetch on mount, refetch on
  dependency change, explicit `refetch()`, abort on unmount.
- `usePolledApi` — adds an interval, paused while the tab is hidden.
- The store holds only the signed-in user's own state. Trainer screens fetch
  their own paginated data rather than caching a cohort in memory.

Mutations refetch rather than patching local state — submitting an attempt
changes progress, aggregates and certification status at once, and re-deriving
that locally is how the two copies fall out of step.

### Live monitoring

`GET /trainer/live` returns the assessment sessions that are open right now, on
any machine. The client polls every 5 seconds.

Polling rather than websockets is a deliberate trade: a realtime channel adds a
second transport and a second failure mode for a screen whose data changes every
few seconds at most.

---

## Tables

| Table | Purpose |
|---|---|
| `profiles` | Role and identity, keyed to `auth.users.id`. No credentials. |
| `candidates` | Assessment profiles |
| `assessment_sessions` | Single-use tickets holding the issued content and answer key |
| `attempts` | Append-only, server-scored |
| `certifications` | Issued certificates |
| `trainer_settings` | One global configuration row |
| `candidate_roster` *(view)* | Server-side aggregation for the trainer dashboard |

`candidate_roster` is what replaced the client-side `reduce`. The 40/60
weighting and best-attempt-per-assignment logic run in SQL.

---

## What is intentionally still client-side

- **The live typing engine.** A round trip per keystroke would destroy the live
  WPM readout. It is display only; the server re-derives the real numbers.
- **Speech synthesis.** The Web Speech API runs in the browser by design.
- **PDF generation.** The certificate is rendered from data the server already
  authorised; generating it locally avoids a server-side headless browser.
- **Charts and CSV export.** Formatting of data the caller is already entitled
  to see.

---

## Known limits

- **Telemetry timing is client-reported.** Bounded and sanity-checked, but a
  determined candidate could bias the listening/multitasking component. The
  components that decide a pass do not depend on it.
- **The Task 2 script text reaches the browser.** Inherent to browser TTS; see
  above.
- **`/auth/register` is unauthenticated**, as public sign-up must be. It
  validates input and rolls back a partial registration, but has no rate
  limiting — put Supabase's built-in rate limits or a WAF in front of it before
  opening registration to the public internet.
