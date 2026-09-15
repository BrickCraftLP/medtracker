-- ============================================================
-- MedTracker — Realtime publication
-- Run once in Supabase SQL Editor (Dashboard → SQL Editor).
-- Safe to re-run.
--
-- postgres_changes only delivers events for tables that are part
-- of the `supabase_realtime` publication. None of the earlier
-- migrations added them, so cross-device updates only arrived on
-- the next manual/launch sync.
--
-- The client also sends a broadcast ping after each write, so
-- sync works without this — this adds a second, server-side path
-- (e.g. for writes made outside the app).
-- ============================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'topics', 'todos', 'sessions', 'scheduled_sessions',
    'workspaces', 'widget_configs', 'deletions'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

alter table todos          replica identity full;
alter table widget_configs replica identity full;
