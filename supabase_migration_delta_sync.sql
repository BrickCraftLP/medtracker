-- ============================================================
-- MedTracker — Delta sync support
-- Run once in Supabase SQL Editor (Dashboard → SQL Editor).
--
-- Adds the server-side machinery the client needs to pull only
-- what changed since its last sync instead of the whole dataset:
--   1. updated_at columns (+ trigger) so edits are detectable
--   2. a deletions tombstone table (+ trigger) so removals made
--      while a device was offline can still be reconciled
--
-- widget_configs is intentionally excluded: saving widgets is a
-- full delete+reinsert (max 10 tiny rows), so the client just
-- full-pulls that table. Tracking it here would churn tombstones.
-- ============================================================

-- 1. updated_at columns ---------------------------------------
alter table topics    add column if not exists updated_at timestamptz not null default now();
alter table sessions  add column if not exists updated_at timestamptz not null default now();
alter table exercises add column if not exists updated_at timestamptz not null default now();
alter table todos     add column if not exists updated_at timestamptz not null default now();

-- Stamp updated_at on every insert/update.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at on topics;
create trigger set_updated_at before insert or update on topics
  for each row execute function set_updated_at();

drop trigger if exists set_updated_at on sessions;
create trigger set_updated_at before insert or update on sessions
  for each row execute function set_updated_at();

drop trigger if exists set_updated_at on exercises;
create trigger set_updated_at before insert or update on exercises
  for each row execute function set_updated_at();

drop trigger if exists set_updated_at on todos;
create trigger set_updated_at before insert or update on todos
  for each row execute function set_updated_at();

-- Helpful for the incremental pull queries.
create index if not exists idx_topics_updated    on topics    (user_id, updated_at);
create index if not exists idx_sessions_updated   on sessions   (user_id, updated_at);
create index if not exists idx_exercises_updated  on exercises  (user_id, updated_at);
create index if not exists idx_todos_updated      on todos      (user_id, updated_at);

-- 2. deletions tombstone table --------------------------------
create table if not exists deletions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  table_name text not null,
  row_id uuid not null,
  deleted_at timestamptz not null default now()
);

create index if not exists idx_deletions_user on deletions (user_id, deleted_at);

alter table deletions enable row level security;
drop policy if exists "own data" on deletions;
create policy "own data" on deletions for all using (auth.uid() = user_id);

-- Record a tombstone whenever a tracked row is deleted.
create or replace function record_deletion()
returns trigger as $$
begin
  insert into deletions (user_id, table_name, row_id)
  values (old.user_id, tg_table_name, old.id);
  return old;
end;
$$ language plpgsql;

drop trigger if exists record_deletion on topics;
create trigger record_deletion after delete on topics
  for each row execute function record_deletion();

drop trigger if exists record_deletion on sessions;
create trigger record_deletion after delete on sessions
  for each row execute function record_deletion();

drop trigger if exists record_deletion on exercises;
create trigger record_deletion after delete on exercises
  for each row execute function record_deletion();

drop trigger if exists record_deletion on todos;
create trigger record_deletion after delete on todos
  for each row execute function record_deletion();
