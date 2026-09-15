-- ============================================================
-- MedTracker — Calendar: scheduled study sessions + todo due dates
-- Run once in Supabase SQL Editor (Dashboard → SQL Editor).
--
-- Requires supabase_migration_delta_sync.sql (set_updated_at /
-- record_deletion functions) and supabase_migration_workspaces.sql
-- (workspaces table) to have been applied first.
-- ============================================================

-- 1. scheduled_sessions ---------------------------------------
create table if not exists scheduled_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  workspace_id uuid references workspaces(id) on delete cascade,
  topic_id uuid references topics(id) on delete cascade,
  scheduled_date date not null,
  start_time time,
  planned_minutes int,
  note text,
  completed boolean not null default false,
  -- Set once the entry has been turned into a real session.
  session_id uuid references sessions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_scheduled_ws      on scheduled_sessions (user_id, workspace_id, scheduled_date);
create index if not exists idx_scheduled_updated on scheduled_sessions (user_id, updated_at);

alter table scheduled_sessions enable row level security;
drop policy if exists "own data" on scheduled_sessions;
create policy "own data" on scheduled_sessions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Reuse the delta-sync machinery so it syncs like every other table.
drop trigger if exists set_updated_at on scheduled_sessions;
create trigger set_updated_at before insert or update on scheduled_sessions
  for each row execute function set_updated_at();

drop trigger if exists record_deletion on scheduled_sessions;
create trigger record_deletion after delete on scheduled_sessions
  for each row execute function record_deletion();

alter table scheduled_sessions replica identity full;

-- 2. Todo due dates -------------------------------------------
alter table todos add column if not exists due_date date;

create index if not exists idx_todos_due on todos (user_id, workspace_id, due_date);
