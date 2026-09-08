# XTransMatrix — AI Operator Certification Platform

An internal training-room platform for **XTransMatrix Consulting Services Pvt.
Ltd.** that certifies new AI Operators on keyboard typing, real-time listening,
structured data entry, critical-data capture, correction handling and
multitasking.

Two tasks, five progressive assignments each. Every assignment must be passed
individually before the next unlocks, retries are unlimited by default, and a
certificate is issued only when every certification gate is satisfied.

---

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:5173>.

### Default logins

Both are seeded on first run and **force a password change at first sign-in**.

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@xtransmatrix.com` | `XtmxAdmin@2026` |
| Trainer | `trainer@xtransmatrix.com` | `XtmxTrainer@2026` |

Candidates register themselves from **Create your account** on the sign-in page.
Trainer and administrator accounts can only be created by an administrator, in
**User Management**.

The workspace is seeded with 14 demo candidates across every status band so the
trainer portal has realistic content immediately.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on :5173 |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the production build on :4173 |
| `npm run typecheck` | TypeScript, no emit |

---

## The assessment

### Task 1 — Keyboard Typing Speed & Accuracy · 40%

| # | Assignment | Difficulty |
|---|---|---|
| 1 | Basic Professional Typing | Easy |
| 2 | Names, Dates & Numbers | Easy–Medium |
| 3 | IDs & Alphanumeric Data | Medium |
| 4 | Healthcare Data Entry | Medium–Hard |
| 5 | Advanced Mixed Data Challenge | Hard |

Scored out of 100: **typing speed 30 · accuracy 40 · data/number accuracy 20 ·
completion 10**. Passing requires score ≥ 75, ≥ 30 WPM *and* ≥ 85% accuracy —
all three, independently. A candidate who scores 87 at 27 WPM is told exactly
that: the score passed, the speed gate did not.

Each retry rotates to a different equivalent passage from a pool.

### Task 2 — AI Audio Listening & Multitasking · 60%

| # | Assignment | Difficulty | Level |
|---|---|---|---|
| 1 | Basic Listening & Capture | Easy | 1 |
| 2 | Healthcare Information Capture | Medium | 2 |
| 3 | Fast & Out-of-Order Information | Medium–Hard | 3 |
| 4 | Corrections & Complex IDs | Hard | 4 |
| 5 | Full Multitasking Simulation | Advanced | 5 |

Scored out of 100: **information capture 25 · data accuracy 25 · critical-data
accuracy 20 · listening/multitasking 15 · correction handling 10 · completion
5**. Passing requires score ≥ 75, data accuracy ≥ 85% and critical-data accuracy
≥ 85%; Assignment 5 additionally requires a multitasking score ≥ 75%.

**Every attempt generates a brand-new scenario** — different names, IDs, values
and correction positions at identical difficulty. Memorisation does not help.

### Certification

```
Task 1 average × 40%  +  Task 2 average × 60%  =  Final Certification Score
```

The certificate unlocks only when *all* of these hold: 5/5 Task 1 passed, 5/5
Task 2 passed, overall ≥ 75, ≥ 30 WPM, ≥ 85% typing accuracy, ≥ 85%
critical-data accuracy, and ≥ 75% multitasking on Assignment 5.

Performance bands: 95–100 High · 85–94 Mid · 80–84 Low (Monitor) ·
76–79 Danger · below 75 Not Certified.

---

## Roles

**Candidate** — takes assignments, sees live WPM/accuracy, retries failures,
reviews attempt history and analytics, downloads the certificate once certified.

**Trainer** — candidate roster with search/filter/sort, live monitoring,
per-candidate drill-down with charts and attempt history, assignment resets,
threshold and difficulty configuration, CSV export.

**Administrator** — everything a trainer can do, plus User Management: create
trainer/admin accounts, reset passwords, disable and remove accounts.

Role boundaries are enforced in the router, not just the UI — a candidate cannot
reach `/trainer` by typing the URL, and a trainer cannot reach `/trainer/users`.

---

## Architecture

```
src/
  auth/          crypto.ts (PBKDF2), accounts.ts (account rules)
  engine/        typingEngine · scoring · scenarioGenerator · speech
                 feedback · certification
  audio/         tts.ts — TTSProvider interface + browser/OpenAI/ElevenLabs
  persistence/   adapter interface + LocalStorage and Supabase implementations
  store/         appStore.ts (Zustand) — the single source of truth
  data/          tasks · passages · pools · settings · seed
  components/    ui (shadcn-style) · layout · typing · audio · charts · shared
  pages/         auth/ · candidate flow · trainer/ portal
```

**Key design decisions:**

- **The typing engine is a pure reducer.** `applyInput(state, nextValue)` folds
  the raw textarea value, so keystroke accounting never depends on React's
  render timing and long passages stay responsive. The comparison view is
  chunked and memoised per word.
- **Progress is derived, never stored.** `deriveProgress(attempts)` projects
  lock/unlock state, best attempt and first attempt from the append-only attempt
  log. Retries cannot erase history because nothing is ever mutated.
- **Attempts store the gates they were judged against.** Changing a threshold
  affects future attempts, not past verdicts.
- **Storage is an interface.** `resolveAdapter()` returns Supabase when
  configured and LocalStorage otherwise; no other code knows the difference.
- **TTS is an interface.** The browser engine is the default and the fallback;
  hosted voices go through a server proxy so keys never reach the client.

---

## Persistence

**Default: browser `localStorage`** under the key `xtmx.workspace.v1`. Zero
configuration, works offline. The sidebar footer shows which adapter is live.

**Production: Supabase** via the auto-generated REST API (PostgREST) — no Edge
Functions in the data path. Run [`supabase/schema.sql`](supabase/schema.sql),
set two environment variables, restart:

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public key>
```

Full walkthrough, RLS notes and the production hardening path:
[`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md).

---

## Authentication

Passwords are hashed in the browser with **PBKDF2-SHA256**, 150,000 iterations,
16-byte random per-account salt. Plaintext is never stored or transmitted, and
verification is constant-time.

This is the right shape for a standalone training-room install. For an
internet-facing deployment, migrate to **Supabase Auth** — `src/auth/accounts.ts`
is the seam, and the matching RLS policies are already written (commented) at the
bottom of `schema.sql`.

---

## Assessment integrity

In certification mode the platform disables copy/paste, records window blur and
focus, logs blocked paste attempts, and flags an attempt for review once the
trainer-configured blur threshold is crossed.

These signals are **advisory**. A single focus loss never fails an attempt — the
trainer sees the pattern alongside the score and decides.

---

## Configuration

Everything below is editable by a trainer in **Configuration**, and takes effect
on future attempts:

- typing requirements (min WPM, min accuracy, passing score, WPM→points bands)
- audio requirements (data/critical accuracy, replay, pause, playback speed, voice)
- the five-level scenario difficulty engine (pace, field count, corrections,
  phonetic IDs, out-of-order delivery, verification prompts)
- multitasking threshold and prompt frequency
- retry policy (unlimited by default, max attempts, lockout, practice-before-retry)
- integrity (paste blocking, tab tracking, flag threshold)

---

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how the server-authoritative design works
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — schema, Edge Function, hosting, troubleshooting
- [`docs/CONTENT.md`](docs/CONTENT.md) — editing typing passages, audio scenarios and prompts
- [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md) — database setup, RLS, hardening
- [`docs/TTS_INTEGRATION.md`](docs/TTS_INTEGRATION.md) — hosted AI voices, proxy, caching
- [`supabase/schema.sql`](supabase/schema.sql) — schema, indexes, policies

---

## Tech stack

React 18 · TypeScript · Vite · Tailwind CSS · React Router · Zustand · Recharts ·
Lucide · jsPDF + html2canvas · Supabase · Web Speech API
