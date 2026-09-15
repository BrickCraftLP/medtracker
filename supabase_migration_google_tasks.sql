-- ============================================================
-- MedTracker — Google Tasks sync
-- Run once in Supabase SQL Editor, AFTER supabase_migration_workspaces.sql
-- and supabase_migration_google_sync.sql. Safe to re-run.
--
-- Same split as the calendar sync: only the identity of a synced row lives
-- here. Sync bookkeeping (last pushed content, updatedMin) stays device-local
-- in IndexedDB.
-- ============================================================

-- Which Google task list a workspace's todos sync with. Null = not synced.
alter table workspaces add column if not exists google_tasklist_id text;
alter table workspaces add column if not exists google_tasks_sync boolean not null default false;
-- Several workspaces may share one list ("merged"). The primary one receives
-- tasks created in Google; the others keep only the tasks they already own.
alter table workspaces add column if not exists google_tasks_primary boolean not null default false;

-- The todo's identity on Google's side, shared across devices so a second
-- device updates the existing task instead of creating a duplicate.
alter table todos add column if not exists google_task_id text;

create unique index if not exists idx_todos_google
  on todos (user_id, google_task_id)
  where google_task_id is not null;

-- Verification:
--   select id, name, google_tasklist_id, google_tasks_sync from workspaces;
