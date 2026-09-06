-- ===========================================================================
-- XTransMatrix AI Operator Certification Platform — schema v2
-- ===========================================================================
-- Server-authoritative architecture.
--
--   Browser ──JWT──► Edge Function `api` ──service_role──► Postgres
--
-- The browser NEVER talks to PostgREST. Every table below has RLS enabled with
-- *no* policies, which denies `anon` and `authenticated` outright. Only the
-- Edge Function, holding the service_role key, can read or write — and it
-- authorises every request against the caller's JWT before it does.
--
-- Consequences, all deliberate:
--   * A candidate can only ever receive their own rows; scoping happens in SQL
--     on the server, not in a client-side filter.
--   * Credentials live in `auth.users` (Supabase Auth). No password material is
--     stored in, or readable from, any table here.
--   * Scores are computed on the server from a server-issued session, so a
--     forged submission cannot manufacture a pass.
--
-- Run once in the SQL Editor. Idempotent.
-- ===========================================================================

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

-- ===========================================================================
-- profiles — role and identity, keyed to Supabase Auth
-- ===========================================================================
-- `id` IS the auth.users id. Every authorisation decision in the API starts by
-- resolving the caller's JWT to a row here. Note the absence of any password
-- column: Supabase Auth owns credentials and never exposes them.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  email                text not null,
  name                 text not null default '',
  role                 account_role not null default 'candidate',
  status               account_status not null default 'active',
  candidate_id         text references public.candidates (id) on delete set null,
  created_by           uuid,
  created_at           timestamptz not null default now(),
  last_login_at        timestamptz,
  must_change_password boolean not null default false
);

create unique index if not exists profiles_email_lower_idx on public.profiles (lower(email));
create index if not exists profiles_role_idx      on public.profiles (role);
create index if not exists profiles_candidate_idx on public.profiles (candidate_id);

-- ===========================================================================
-- assessment_sessions — server-issued, single-use assessment tickets
-- ===========================================================================
-- This table is what makes scoring trustworthy.
--
-- When a candidate starts an assignment the server generates the content and
-- stores it here, including the Task 2 `expected` answers. The client receives
-- only what it needs to render and play the assessment — never the answer key.
-- On submit the server re-reads this row, scores against it, and marks the
-- session consumed so one ticket cannot be submitted twice.
-- ---------------------------------------------------------------------------
create table if not exists public.assessment_sessions (
  id             uuid primary key default gen_random_uuid(),
  candidate_id   text not null references public.candidates (id) on delete cascade,
  task_id        smallint not null check (task_id in (1, 2)),
  assignment_id  smallint not null check (assignment_id between 1 and 5),
  attempt_number integer not null check (attempt_number > 0),
  mode           assessment_mode not null default 'certification',
  -- Task 1: which passage was issued. Task 2: the full generated scenario,
  -- answer key included. Never serialised to a client response.
  passage_id     text,
  scenario       jsonb,
  started_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  consumed_at    timestamptz
);

create index if not exists sessions_candidate_idx on public.assessment_sessions (candidate_id);
create index if not exists sessions_open_idx
  on public.assessment_sessions (candidate_id, consumed_at)
  where consumed_at is null;

-- ===========================================================================
-- attempts — append-only record of every submitted attempt
-- ===========================================================================
-- Scores here are computed by the server. There is no code path by which a
-- client-supplied score reaches this table.
-- ---------------------------------------------------------------------------
create table if not exists public.attempts (
  id                     text primary key,
  candidate_id           text not null references public.candidates (id) on delete cascade,
  session_id             uuid references public.assessment_sessions (id) on delete set null,
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

-- ===========================================================================
-- trainer_settings — single global configuration row
-- ===========================================================================
create table if not exists public.trainer_settings (
  id         text primary key default 'global',
  payload    jsonb not null,
  updated_at timestamptz not null default now()
);

-- ===========================================================================
-- Server-side aggregation
-- ===========================================================================
-- The trainer roster used to be computed by shipping every attempt to the
-- browser and reducing in JavaScript. It is now one indexed query.
--
-- Weighting mirrors the scoring engine: Task 1 average x 40% + Task 2 x 60%,
-- taking each candidate's BEST attempt per assignment.
-- ---------------------------------------------------------------------------
create or replace view public.candidate_roster as
with best as (
  select
    a.candidate_id,
    a.task_id,
    a.assignment_id,
    max(a.score)                                as best_score,
    max(a.wpm)     filter (where a.task_id = 1) as best_wpm,
    max(a.accuracy) filter (where a.task_id = 1) as best_accuracy,
    max(a.critical_data_accuracy)               as best_critical,
    max(a.multitasking_score)                   as best_multitasking,
    bool_or(a.passed)                           as ever_passed,
    count(*)                                    as attempt_count
  from public.attempts a
  where a.mode = 'certification'
  group by a.candidate_id, a.task_id, a.assignment_id
),
agg as (
  select
    candidate_id,
    round(coalesce(avg(best_score) filter (where task_id = 1), 0), 1) as task1_avg,
    round(coalesce(avg(best_score) filter (where task_id = 2), 0), 1) as task2_avg,
    round(coalesce(avg(best_wpm), 0))                                 as avg_wpm,
    round(coalesce(avg(best_accuracy), 0), 1)                         as avg_accuracy,
    round(coalesce(avg(best_critical) filter (where task_id = 2), 0), 1) as critical_accuracy,
    round(coalesce(max(best_multitasking) filter (where task_id = 2 and assignment_id = 5), 0), 1)
                                                                      as multitasking_score,
    count(*) filter (where ever_passed)                               as assignments_passed,
    sum(attempt_count)                                                as total_attempts
  from best
  group by candidate_id
)
select
  c.id,
  c.candidate_id,
  c.full_name,
  c.email,
  c.batch,
  c.location,
  c.trainer_name,
  c.is_demo,
  c.last_active_at,
  coalesce(g.task1_avg, 0)          as task1_avg,
  coalesce(g.task2_avg, 0)          as task2_avg,
  round(coalesce(g.task1_avg, 0) * 0.4 + coalesce(g.task2_avg, 0) * 0.6, 1) as final_score,
  coalesce(g.avg_wpm, 0)            as avg_wpm,
  coalesce(g.avg_accuracy, 0)       as avg_accuracy,
  coalesce(g.critical_accuracy, 0)  as critical_accuracy,
  coalesce(g.multitasking_score, 0) as multitasking_score,
  coalesce(g.assignments_passed, 0) as assignments_passed,
  coalesce(g.total_attempts, 0)     as total_attempts,
  (cert.certificate_id is not null) as certified,
  cert.certificate_id
from public.candidates c
left join agg g            on g.candidate_id = c.id
left join public.certifications cert on cert.candidate_id = c.id;

-- ===========================================================================
-- Row Level Security — deny everything to clients
-- ===========================================================================
-- RLS is enabled with NO policies. In Postgres that means every statement from
-- `anon` and `authenticated` is refused. The service_role key used by the Edge
-- Function bypasses RLS, so the API is the only way in — which is the point.
--
-- Do not add policies here to "make the app work". If a request needs data, it
-- belongs behind an authorised route in supabase/functions/api.
-- ---------------------------------------------------------------------------
alter table public.candidates          enable row level security;
alter table public.profiles            enable row level security;
alter table public.assessment_sessions enable row level security;
alter table public.attempts            enable row level security;
alter table public.certifications      enable row level security;
alter table public.trainer_settings    enable row level security;

alter table public.candidates          force row level security;
alter table public.profiles            force row level security;
alter table public.assessment_sessions force row level security;
alter table public.attempts            force row level security;
alter table public.certifications      force row level security;
alter table public.trainer_settings    force row level security;

-- Remove the permissive policies from schema v1, if this is an upgrade.
drop policy if exists accounts_standalone         on public.accounts;
drop policy if exists candidates_standalone       on public.candidates;
drop policy if exists attempts_standalone         on public.attempts;
drop policy if exists certifications_standalone   on public.certifications;
drop policy if exists trainer_settings_standalone on public.trainer_settings;

-- The v1 `accounts` table held password hashes readable by any client. It is
-- superseded by `profiles` + Supabase Auth and must not survive the upgrade.
drop table if exists public.accounts cascade;

-- Views execute with the privileges of their owner, so keep them off the
-- client-reachable API surface too.
revoke all on public.candidate_roster from anon, authenticated;

-- ===========================================================================
-- Seed: default global settings
-- ===========================================================================
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
-- Housekeeping: expire abandoned assessment sessions
-- ===========================================================================
-- Sessions are single-use tickets. Ones that are never submitted would
-- otherwise accumulate. Call from a scheduled job, or let them sit — they are
-- small and unreadable by clients either way.
-- ---------------------------------------------------------------------------
create or replace function public.purge_stale_sessions()
returns integer
language plpgsql security definer set search_path = public as $$
declare removed integer;
begin
  delete from public.assessment_sessions
   where consumed_at is null and expires_at < now() - interval '1 day';
  get diagnostics removed = row_count;
  return removed;
end $$;

revoke all on function public.purge_stale_sessions() from anon, authenticated;
