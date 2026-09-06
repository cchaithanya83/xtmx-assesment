# Supabase Setup

The platform runs on browser `localStorage` by default and needs **zero**
configuration. Connect Supabase when you need data to survive a cleared browser,
to be shared across machines, or to be reportable from outside the app.

Nothing in the application code changes — `resolveAdapter()` in
[`src/persistence/index.ts`](../src/persistence/index.ts) picks the Supabase
adapter automatically as soon as the two environment variables are present.

---

## 1. Create the project

1. Go to <https://supabase.com/dashboard> and click **New project**.
2. Name it (e.g. `xtmx-ai-operator-certification`), choose a region close to your
   training centre, and set a database password.
3. Wait for provisioning (~2 minutes).

## 2. Run the schema

1. Open **SQL Editor → New query**.
2. Paste the entire contents of [`supabase/schema.sql`](../supabase/schema.sql).
3. Click **Run**.

The script is idempotent — re-running it is safe. It creates:

| Table | Purpose |
|---|---|
| `accounts` | Login identities (PBKDF2 hash + salt, role, status) |
| `candidates` | Assessment profiles |
| `attempts` | One append-only row per submitted attempt |
| `certifications` | Issued certificates |
| `trainer_settings` | The single global configuration row |
| `candidate_roster` *(view)* | Roster with derived counters, for BI/exports |

It also enables Row Level Security on every table and seeds the default
thresholds.

## 3. Copy the keys

**Project Settings → API**:

| Dashboard field | Environment variable |
|---|---|
| Project URL | `VITE_SUPABASE_URL` |
| `anon` `public` key | `VITE_SUPABASE_ANON_KEY` |

Create `.env.local` in the project root:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

> Use the **anon public** key, never the `service_role` key. The service role key
> bypasses Row Level Security and must never reach a browser.

## 4. Restart

```bash
npm run dev
```

Vite only reads `.env.local` at startup, so a restart is required.

**Verify it worked:** the sidebar footer switches from
`Local Browser Storage` to `Supabase`.

---

## Migrating existing local data

Local data does not upload automatically. To move a workspace you have already
built up in the browser:

1. **Before** adding the environment variables, open the app and run this in the
   browser console to copy your workspace:

   ```js
   copy(localStorage.getItem('xtmx.workspace.v1'))
   ```

2. Save it to a file, e.g. `workspace.json`.
3. Add the environment variables and restart.
4. In the browser console on the Supabase-connected app:

   ```js
   const snapshot = JSON.parse(/* paste the file contents */)
   const { resolveAdapter } = await import('/src/persistence/index.ts')
   await resolveAdapter().save(snapshot)
   ```

`save()` performs a bulk upsert across all five tables.

---

## Hardening for production

The shipped RLS policies use the **standalone profile**: the anon key can read
and write every table. That is deliberate and correct for an internal training
room on a trusted network, because the app authenticates in the browser.

**Do not expose that configuration to the public internet.** Before an
internet-facing deployment, migrate authentication to Supabase Auth:

1. **Create Supabase Auth users** instead of local accounts.
   - Candidate sign-up → `supabase.auth.signUp({ email, password })`
   - Admin-created staff → `supabase.auth.admin.createUser()` from an Edge
     Function (needs the service role key, so it must be server-side).
2. **Set `accounts.id` to the `auth.users.id` UUID** so the RLS helper functions
   can resolve the current user.
3. **Replace the hashing calls** in `src/store/appStore.ts` (`signIn`,
   `signUpCandidate`, `changeOwnPassword`) with `supabase.auth` equivalents.
   `src/auth/accounts.ts` is the seam — its function signatures already match.
4. **Swap the policies**: drop the `*_standalone` policies and uncomment the
   `§ HARDENED POLICIES` block at the bottom of `schema.sql`.

The hardened profile enforces:

- a candidate reads only **their own** attempts, profile and certificate;
- attempts are **insert-only** for candidates — nobody can rewrite history
  (product rule #3);
- only trainers and admins read the full roster or write settings;
- only admins manage accounts.

---

## Realtime live monitoring (optional)

The trainer Live Monitoring screen currently shows sessions running in the
*same browser*, because `liveSessions` is in-memory. To monitor a whole training
room from a trainer's own machine:

1. Enable Realtime on the project (**Database → Replication**).
2. In `appStore.publishLive()`, also broadcast the payload:

   ```ts
   supabase.channel('live-sessions').send({
     type: 'broadcast',
     event: 'session',
     payload: session,
   })
   ```

3. In `TrainerLive.tsx`, subscribe to the same channel and feed each message
   into `publishLive`.

No other change is needed — that component only reads `liveSessions`.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Sidebar still says "Local Browser Storage" | Env vars missing or dev server not restarted | Check `.env.local` spelling (`VITE_` prefix is required), restart |
| "Storage issue" badge in the header | A write failed | Open the console; usually an RLS denial or a missing table |
| `relation "public.accounts" does not exist` | Schema not run | Re-run `supabase/schema.sql` |
| Sign-in works but data is empty | Schema ran on a different project | Confirm the URL matches the project you seeded |
| `new row violates row-level security policy` | Hardened policies applied without Supabase Auth | Re-apply the standalone policies, or finish the Auth migration |
