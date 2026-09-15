-- ============================================================
-- MedTracker — calendar provider connection status, per user
-- Run once in Supabase SQL Editor, AFTER supabase/profiles.sql and
-- supabase_migration_google_sync.sql. Safe to re-run.
--
-- Records THAT a user connected a provider (e.g. Google), so every device
-- shows the same status. The access token itself is never stored: the
-- browser token model has none worth sharing, and each device re-obtains
-- one silently from its own Google session (see src/services/googleCalendar.js).
--
-- Shape: { "google": { "connected_at": "2026-09-14T10:00:00Z" } }
-- A missing key means not connected.
-- ============================================================

alter table public.profiles
  add column if not exists calendar_connections jsonb not null default '{}'::jsonb;

-- Atomic set/clear of one provider. A read-modify-write from the client would
-- let two devices overwrite each other's provider keys.
create or replace function public.set_calendar_connection(p_provider text, p_connected boolean)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  entry  jsonb := jsonb_build_object(p_provider, jsonb_build_object('connected_at', now()));
  result jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into profiles (id, calendar_connections)
  values (auth.uid(), case when p_connected then entry else '{}'::jsonb end)
  on conflict (id) do update
    set calendar_connections = case
      when p_connected then profiles.calendar_connections || entry
      else profiles.calendar_connections - p_provider
    end
  returning calendar_connections into result;

  return result;
end;
$$;

grant execute on function public.set_calendar_connection(text, boolean) to authenticated;

-- Verification:
--   select id, calendar_connections from profiles;
