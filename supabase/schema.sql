-- ===========================================================================
-- XTransMatrix AI Operator Certification Platform — Supabase schema
-- ===========================================================================
-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- It is idempotent: safe to re-run.
--
-- After running it, set these in `.env.local` and restart the dev server:
--   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
--   VITE_SUPABASE_ANON_KEY=<anon public key>
--
-- The app detects them automatically and switches from browser storage to
-- Supabase (the sidebar footer will read "Supabase" instead of
-- "Local Browser Storage").
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type account_role as enum ('candidate', 'trainer', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type account_status as enum ('active', 'disabled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type assessment_mode as enum ('certification', 'practice');
exception when duplicate_object then null; end $$;

-- ===========================================================================
-- accounts — login identities
-- ===========================================================================
-- NOTE ON PASSWORDS
-- -----------------
-- In the standalone build the app derives a PBKDF2-SHA256 hash in the browser
-- and stores it here. That is appropriate for an offline training-room install.
--
-- For a multi-machine production deployment, migrate to **Supabase Auth**:
-- `password_hash`/`password_salt` become unused, `id` becomes a foreign key to
-- `auth.users(id)`, and the RLS policies at the bottom of this file switch from
-- permissive to `auth.uid()`-scoped. See docs/SUPABASE_SETUP.md § "Hardening".
-- ---------------------------------------------------------------------------
create table if not exists public.accounts (
  id                   text primary key,
  email                text not null unique,
  name                 text not null,
  role                 account_role not null default 'candidate',
  status               account_status not null default 'active',
  password_hash        text not null,
  password_salt        text not null,
  candidate_id         text,
  created_by           text,
  created_at           timestamptz not null default now(),
  last_login_at        timestamptz,
  must_change_password boolean not null default false
);

create index if not exists accounts_role_idx   on public.accounts (role);
create index if not exists accounts_status_idx on public.accounts (status);
-- Case-insensitive uniqueness on email.
create unique index if not exists accounts_email_lower_idx on public.accounts (lower(email));

-- ===========================================================================
-- candidates — assessment profiles
-- ===========================================================================
create table if not exists public.candidates (
  id             text primary key,
  full_name      text not null,
  candidate_id   text not null,
  email          text not null,
  batch          text not null default '',
  location       text not null default '',
  trainer_name   text not null default '',
  created_at     timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  is_demo        boolean not null default false
);

create unique index if not exists candidates_candidate_id_idx
  on public.candidates (upper(candidate_id));
create index if not exists candidates_batch_idx on public.candidates (batch);

-- accounts.candidate_id → candidates.id (added after both tables exist)
do $$ begin
  alter table public.accounts
    add constraint accounts_candidate_fk
    foreign key (candidate_id) references public.candidates (id) on delete set null;
exception when duplicate_object then null; end $$;

-- ===========================================================================
-- attempts — one row per submitted assessment attempt
-- ===========================================================================
-- Metrics are duplicated into typed columns (for filtering/sorting/reporting)
-- and kept whole in `payload` (so the scoring engine can evolve without a
-- migration for every new metric).
-- ---------------------------------------------------------------------------
create table if not exists public.attempts (
  id                     text primary key,
  candidate_id           text not null references public.candidates (id) on delete cascade,
  task_id                smallint not null check (task_id in (1, 2)),
  assignment_id          smallint not null check (assignment_id between 1 and 5),
  attempt_number         integer not null check (attempt_number > 0),
  mode                   assessment_mode not null default 'certification',
  score                  numeric(5,2) not null,
  passed                 boolean not null,
  wpm                    numeric(6,2),
  accuracy               numeric(5,2),
  data_accuracy          numeric(5,2),
  critical_data_accuracy numeric(5,2),
  multitasking_score     numeric(5,2),
  started_at             timestamptz not null,
  completed_at           timestamptz not null,
  payload                jsonb not null,
  created_at             timestamptz not null default now()
);

create index if not exists attempts_candidate_idx  on public.attempts (candidate_id);
create index if not exists attempts_assignment_idx on public.attempts (task_id, assignment_id);
create index if not exists attempts_completed_idx  on public.attempts (completed_at desc);
create index if not exists attempts_passed_idx     on public.attempts (passed);
-- One attempt number per candidate/assignment/mode.
create unique index if not exists attempts_unique_number_idx
  on public.attempts (candidate_id, task_id, assignment_id, mode, attempt_number);

-- ===========================================================================
-- certifications — issued certificates
-- ===========================================================================
create table if not exists public.certifications (
  certificate_id text primary key,
  candidate_id   text not null unique references public.candidates (id) on delete cascade,
  issued_at      timestamptz not null default now(),
  payload        jsonb not null
);

create index if not exists certifications_candidate_idx on public.certifications (candidate_id);

-- ===========================================================================
-- trainer_settings — single global configuration row
-- ===========================================================================
create table if not exists public.trainer_settings (
  id         text primary key default 'global',
  payload    jsonb not null,
  updated_at timestamptz not null default now()
);

-- ===========================================================================
-- Convenience view: candidate roster with derived counters
-- ===========================================================================
-- The app computes its own aggregates client-side; this view exists for BI
-- tools, exports and ad-hoc SQL reporting.
-- ---------------------------------------------------------------------------
create or replace view public.candidate_roster as
select
  c.id,
  c.candidate_id,
  c.full_name,
  c.email,
  c.batch,
  c.location,
  c.trainer_name,
  c.last_active_at,
  count(a.id) filter (where a.mode = 'certification')                as total_attempts,
  count(distinct (a.task_id, a.assignment_id))
    filter (where a.passed and a.mode = 'certification')             as assignments_passed,
  round(avg(a.wpm)      filter (where a.task_id = 1 and a.passed), 1) as avg_wpm,
  round(avg(a.accuracy) filter (where a.task_id = 1 and a.passed), 1) as avg_accuracy,
  round(
    coalesce(avg(a.score) filter (where a.task_id = 1 and a.passed), 0) * 0.4 +
    coalesce(avg(a.score) filter (where a.task_id = 2 and a.passed), 0) * 0.6,
    1
  )                                                                  as final_score,
  (cert.certificate_id is not null)                                  as certified,
  cert.certificate_id
from public.candidates c
left join public.attempts a       on a.candidate_id = c.id
left join public.certifications cert on cert.candidate_id = c.id
group by c.id, cert.certificate_id;

-- ===========================================================================
-- Row Level Security
-- ===========================================================================
-- RLS is ENABLED on every table. The policies below are the *standalone*
-- profile: the app authenticates in-browser, so the anon key needs read/write
-- access. This is appropriate for a trusted internal training-room network.
--
-- >>> BEFORE EXPOSING THIS TO THE PUBLIC INTERNET, apply the hardened profile
-- >>> at the bottom of this file (§ HARDENED POLICIES). It requires migrating
-- >>> authentication to Supabase Auth first — see docs/SUPABASE_SETUP.md.
-- ---------------------------------------------------------------------------
alter table public.accounts         enable row level security;
alter table public.candidates       enable row level security;
alter table public.attempts         enable row level security;
alter table public.certifications   enable row level security;
alter table public.trainer_settings enable row level security;

-- --- Standalone profile ----------------------------------------------------
drop policy if exists accounts_standalone         on public.accounts;
drop policy if exists candidates_standalone       on public.candidates;
drop policy if exists attempts_standalone         on public.attempts;
drop policy if exists certifications_standalone   on public.certifications;
drop policy if exists trainer_settings_standalone on public.trainer_settings;

create policy accounts_standalone on public.accounts
  for all to anon, authenticated using (true) with check (true);

create policy candidates_standalone on public.candidates
  for all to anon, authenticated using (true) with check (true);

create policy attempts_standalone on public.attempts
  for all to anon, authenticated using (true) with check (true);

create policy certifications_standalone on public.certifications
  for all to anon, authenticated using (true) with check (true);

create policy trainer_settings_standalone on public.trainer_settings
  for all to anon, authenticated using (true) with check (true);

-- ===========================================================================
-- Seed: default global settings
-- ===========================================================================
-- Mirrors DEFAULT_SETTINGS in src/data/settings.ts. The app overwrites this the
-- first time a trainer saves the configuration screen.
-- ---------------------------------------------------------------------------
insert into public.trainer_settings (id, payload)
values (
  'global',
  '{
    "minWpm": 30,
    "minAccuracy": 85,
    "passingScore": 75,
    "pauseThresholdMs": 3000,
    "minDataAccuracy": 85,
    "minCriticalAccuracy": 85,
    "replayAllowed": false,
    "pauseAllowed": false,
    "playbackSpeed": 1,
    "voiceURI": null,
    "minMultitaskingScore": 75,
    "verificationPromptFrequency": 3,
    "unlimitedRetries": true,
    "maxAttempts": 5,
    "requirePracticeBeforeRetry": false,
    "lockoutSeconds": 0,
    "blockPaste": true,
    "trackTabSwitching": true,
    "flagBlurThreshold": 3
  }'::jsonb
)
on conflict (id) do nothing;

-- ===========================================================================
-- § HARDENED POLICIES (apply only after migrating to Supabase Auth)
-- ===========================================================================
-- These are commented out deliberately. Applying them before wiring
-- `supabase.auth` will lock the application out of its own data.
--
-- Migration outline:
--   1. Create users with `supabase.auth.admin.createUser()` (server-side) or
--      `supabase.auth.signUp()` for candidate self-registration.
--   2. Set `accounts.id` to the matching `auth.users.id` UUID.
--   3. Replace `src/auth/crypto.ts` usage in the store with `supabase.auth`.
--   4. Drop the standalone policies above and run everything below.
-- ---------------------------------------------------------------------------
--
-- create or replace function public.current_role_name()
-- returns account_role
-- language sql stable security definer set search_path = public as $$
--   select role from public.accounts where id = auth.uid()::text
-- $$;
--
-- create or replace function public.is_staff()
-- returns boolean
-- language sql stable security definer set search_path = public as $$
--   select coalesce(public.current_role_name() in ('trainer', 'admin'), false)
-- $$;
--
-- create or replace function public.my_candidate_id()
-- returns text
-- language sql stable security definer set search_path = public as $$
--   select candidate_id from public.accounts where id = auth.uid()::text
-- $$;
--
-- -- accounts: read your own row; admins manage all.
-- create policy accounts_self_read on public.accounts
--   for select to authenticated
--   using (id = auth.uid()::text or public.is_staff());
--
-- create policy accounts_admin_write on public.accounts
--   for all to authenticated
--   using (public.current_role_name() = 'admin')
--   with check (public.current_role_name() = 'admin');
--
-- -- candidates: read your own profile; staff read all.
-- create policy candidates_read on public.candidates
--   for select to authenticated
--   using (id = public.my_candidate_id() or public.is_staff());
--
-- create policy candidates_self_update on public.candidates
--   for update to authenticated
--   using (id = public.my_candidate_id()) with check (id = public.my_candidate_id());
--
-- create policy candidates_staff_write on public.candidates
--   for all to authenticated
--   using (public.is_staff()) with check (public.is_staff());
--
-- -- attempts: a candidate may INSERT and READ only their own; never UPDATE or
-- -- DELETE (attempt history is append-only — product rule #3).
-- create policy attempts_read on public.attempts
--   for select to authenticated
--   using (candidate_id = public.my_candidate_id() or public.is_staff());
--
-- create policy attempts_insert_own on public.attempts
--   for insert to authenticated
--   with check (candidate_id = public.my_candidate_id());
--
-- create policy attempts_staff_manage on public.attempts
--   for all to authenticated
--   using (public.is_staff()) with check (public.is_staff());
--
-- -- certifications: read your own; only staff may issue.
-- create policy certifications_read on public.certifications
--   for select to authenticated
--   using (candidate_id = public.my_candidate_id() or public.is_staff());
--
-- create policy certifications_staff_write on public.certifications
--   for all to authenticated
--   using (public.is_staff()) with check (public.is_staff());
--
-- -- settings: everyone reads (the UI shows thresholds), only staff write.
-- create policy settings_read on public.trainer_settings
--   for select to authenticated using (true);
--
-- create policy settings_staff_write on public.trainer_settings
--   for all to authenticated
--   using (public.is_staff()) with check (public.is_staff());
