-- ============================================================
-- MedTracker — Google Calendar sync
-- Run once in Supabase SQL Editor, AFTER supabase_migration_calendar_v2.sql.
-- Safe to re-run.
--
-- Only the identity of a synced row lives here. The bookkeeping — sync
-- tokens, which local revision was last pushed — is deliberately device-local
-- (IndexedDB), because each device syncs against Google independently and a
-- shared token would make two devices skip each other's changes.
-- ============================================================

-- Which Google calendar a MedTracker calendar is tied to. Null = not synced.
alter table calendars add column if not exists google_calendar_id text;
alter table calendars add column if not exists google_sync boolean not null default false;

-- The row's identity on Google's side, shared across devices so a second
-- device updates the existing Google event instead of creating a duplicate.
alter table calendar_events add column if not exists google_event_id text;
alter table calendar_events add column if not exists google_calendar_id text;

create unique index if not exists idx_events_google
  on calendar_events (user_id, google_calendar_id, google_event_id)
  where google_event_id is not null;

-- Verification:
--   select id, name, google_calendar_id, google_sync from calendars;
