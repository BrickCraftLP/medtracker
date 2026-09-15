-- ============================================================
-- MedTracker — Calendars across workspaces
-- Run once in Supabase SQL Editor, AFTER supabase_migration_calendar_v2.sql.
-- Safe to re-run.
--
-- A calendar keeps exactly one OWNING workspace (its workspace_id, still not
-- null). Sharing only widens where it is *shown*:
--   shared_all           → visible in every workspace
--   shared_workspace_ids → visible in these workspaces as well
--
-- Events, semesters and exams inherit workspace_id from their calendar, so a
-- shared calendar's rows all live under one consistent scope and a workspace
-- deletion still takes its own calendars — and only its own — with it.
--
-- Deliberately NOT done here: making workspace_id nullable to mean "global".
-- IndexedDB's compound [user_id, workspace_id] index silently drops any record
-- whose key contains null, so such rows would be invisible offline with no
-- error at all.
-- ============================================================

alter table calendars add column if not exists shared_all boolean not null default false;
alter table calendars add column if not exists shared_workspace_ids uuid[] not null default '{}';

-- Which integration owns this calendar's remote link. Kept as free text rather
-- than an enum so a second provider is a client-only change.
alter table calendars add column if not exists sync_provider text;

-- calendars_default_uniq from calendar_v2 stays as it is: a shared calendar
-- still has one owning workspace, so "one default per workspace" is unaffected.

-- Verification:
--   select name, workspace_id, shared_all, shared_workspace_ids from calendars;
