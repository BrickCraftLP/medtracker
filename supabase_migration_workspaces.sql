-- ============================================================
-- MedTracker — Multi-workspace support (up to 5 per user)
-- Run once in Supabase SQL Editor (Dashboard → SQL Editor).
--
-- Adds a `workspaces` table and a `workspace_id` column on every
-- data table, then migrates all existing rows into a per-user
-- default workspace so nothing is orphaned by the update.
--
-- Settings, profiles and pin_config stay account-global and are
-- deliberately untouched.
-- ============================================================

-- 1. workspaces table -----------------------------------------
create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  color text not null default '#6366f1',
  icon text not null default 'grid',
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workspaces_updated on workspaces (user_id, updated_at);

alter table workspaces enable row level security;
drop policy if exists "own data" on workspaces;
create policy "own data" on workspaces for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Reuse the delta-sync machinery so workspaces sync like any other table.
drop trigger if exists set_updated_at on workspaces;
create trigger set_updated_at before insert or update on workspaces
  for each row execute function set_updated_at();

drop trigger if exists record_deletion on workspaces;
create trigger record_deletion after delete on workspaces
  for each row execute function record_deletion();

alter table workspaces replica identity full;

-- 2. workspace_id on the data tables --------------------------
-- Nullable during the migration; backfilled in step 3.
alter table topics         add column if not exists workspace_id uuid references workspaces(id) on delete cascade;
alter table sessions       add column if not exists workspace_id uuid references workspaces(id) on delete cascade;
alter table exercises      add column if not exists workspace_id uuid references workspaces(id) on delete cascade;
alter table todos          add column if not exists workspace_id uuid references workspaces(id) on delete cascade;
alter table widget_configs add column if not exists workspace_id uuid references workspaces(id) on delete cascade;

create index if not exists idx_topics_ws         on topics         (user_id, workspace_id);
create index if not exists idx_sessions_ws       on sessions       (user_id, workspace_id);
create index if not exists idx_exercises_ws      on exercises      (user_id, workspace_id);
create index if not exists idx_todos_ws          on todos          (user_id, workspace_id);
create index if not exists idx_widget_configs_ws on widget_configs (user_id, workspace_id);

-- 3. Migrate existing users' data into a default workspace ----
-- One "Standard" workspace per existing user...
insert into workspaces (user_id, name, color, icon, display_order)
select u.id, 'Standard', '#6366f1', 'grid', 0
from auth.users u
where not exists (select 1 from workspaces w where w.user_id = u.id);

-- ...then point every orphaned row at it. Safe because the insert
-- above guarantees exactly one workspace per user at this moment.
update topics         t set workspace_id = w.id from workspaces w where w.user_id = t.user_id and t.workspace_id is null;
update sessions       s set workspace_id = w.id from workspaces w where w.user_id = s.user_id and s.workspace_id is null;
update exercises      e set workspace_id = w.id from workspaces w where w.user_id = e.user_id and e.workspace_id is null;
update todos          t set workspace_id = w.id from workspaces w where w.user_id = t.user_id and t.workspace_id is null;
update widget_configs c set workspace_id = w.id from workspaces w where w.user_id = c.user_id and c.workspace_id is null;

-- 4. widget_configs uniqueness gains the workspace dimension --
-- Without this, two workspaces cannot both hold a widget at position 0.
alter table widget_configs drop constraint if exists widget_configs_user_id_position_key;
alter table widget_configs drop constraint if exists widget_configs_user_ws_position_key;
alter table widget_configs add constraint widget_configs_user_ws_position_key
  unique (user_id, workspace_id, position);

-- 5. Cap at 5 workspaces per user -----------------------------
create or replace function enforce_workspace_limit()
returns trigger as $$
begin
  if (select count(*) from workspaces where user_id = new.user_id) >= 5 then
    raise exception 'workspace limit reached';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists workspace_limit on workspaces;
create trigger workspace_limit before insert on workspaces
  for each row execute function enforce_workspace_limit();

-- 6. Account deletion must also clear workspaces --------------
-- (auth.users cascade covers it, but keep delete_user() explicit.)
-- Re-run supabase_migration_delete_user.sql if you maintain that RPC by hand.

-- Verification:
--   select count(*) from topics where workspace_id is null;  -- expect 0
