# Deployment

Three pieces: the database schema, the API Edge Function, and the static site.

---

## 1. Database

**Supabase Dashboard → SQL Editor → New query**, paste
[`supabase/schema.sql`](../supabase/schema.sql), Run.

Before you do, **close every open tab running the app**. The script takes
exclusive locks and an active client holding a read lock will deadlock it. If
that happens nothing is applied — the transaction rolls back — and you can
simply re-run. Adding `set lock_timeout = '5s';` at the top makes it fail fast
instead of hanging.

> **Upgrading from schema v1?** The script drops the old `accounts` table,
> because it stored password hashes that any client could read. Those logins do
> not carry over — you will create the first administrator in step 4.

---

## 2. Link the project

```bash
npx supabase login          # opens a browser
npx supabase link --project-ref ilhcojizrpqgqliejjae
```

`--project-ref` is the subdomain of your Supabase URL.

---

## 3. Deploy the API

```bash
npx supabase functions deploy api
```

`verify_jwt = false` is set in [`supabase/config.toml`](../supabase/config.toml).
That is **not** a security hole: the function performs its own verification in
`_server/auth.ts` on every route. It is off at the gateway because two routes
must be reachable without a session — candidate registration, and the one-time
administrator bootstrap.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically. You
do not set them, and you must never put the service role key in `.env`.

Check it responds:

```bash
curl https://<project-ref>.supabase.co/functions/v1/api/auth/bootstrap \
  -H "apikey: <anon key>"
# → {"needsBootstrap":true}
```

---

## 4. Create the first administrator

There is no default password anywhere in the source. The bootstrap route works
exactly once — it refuses as soon as any administrator exists.

```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/api/auth/bootstrap \
  -H "apikey: <anon key>" \
  -H "Authorization: Bearer <anon key>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Your Name","email":"you@yourdomain.com","password":"a-strong-password"}'
```

Sign in with that account, then create trainers from **User Management**.

---

## 5. Front end

### Environment

`VITE_*` variables are compiled into the bundle, so changing one requires a
rebuild, not a restart.

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | The **anon public** key |

The anon key is safe to publish here. It authenticates against Supabase Auth
and routes requests to the function — it grants no data access, because RLS
denies it everything.

**Never ship the `service_role` key.**

### Netlify

Set both variables in **Site configuration → Environment variables**, then
redeploy. `.env` is gitignored, so Netlify never sees your local file.

[`netlify.toml`](../netlify.toml) already handles the SPA fallback (without it
`/signin` 404s on refresh), pins Node 22, and sets asset cache headers.

### Local

```bash
cp .env.example .env.local     # fill in the two values
npm run dev
```

---

## 6. Demo data (optional)

Sign in as an administrator → **Configuration → Regenerate demo candidates**.

This seeds 14 candidates with mixed outcomes so the trainer portal has something
to show. It writes to your real database — clear it from the same screen before
going live.

---

## Verifying it is actually locked down

The point of this architecture is that the browser cannot read the database.
Confirm it:

```bash
# Direct PostgREST access with the anon key must be refused.
curl "https://<project-ref>.supabase.co/rest/v1/profiles?select=*" \
  -H "apikey: <anon key>"
# → {"code":"42501", ... "permission denied"}   ✓

# The API without a token must be refused.
curl https://<project-ref>.supabase.co/functions/v1/api/me \
  -H "apikey: <anon key>"
# → {"error":"Authentication required"}          ✓
```

If the first returns rows, RLS is not enabled — re-run the schema.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Authentication required` on every call | No session | Sign in; check the anon key matches the project |
| `permission denied for table` | Function deployed without the service role | Redeploy; Supabase injects the key automatically |
| Sign-in works, screens are empty | Function not deployed | `npx supabase functions deploy api` |
| `/signin` 404s on refresh | SPA fallback missing | Confirm `netlify.toml` deployed |
| `deadlock detected` running the schema | The app was querying during DDL | Close app tabs, re-run |
| `cannot change name of view column` | An older `candidate_roster` view exists | Fixed in the script — it now drops the view first. Pull the latest `schema.sql` |
| `column session_id does not exist` | v1 `attempts` table survived `create table if not exists` | Fixed — the script now adds the column explicitly |
| `relation "public.accounts" does not exist` | Fresh install hitting a v1 cleanup statement | Fixed — that drop is now guarded by `to_regclass` |
| Changed env vars did nothing | `VITE_*` is baked in at build time | Trigger a fresh deploy |
| Bootstrap returns 409 | An admin already exists | Sign in, or reset via the dashboard |
