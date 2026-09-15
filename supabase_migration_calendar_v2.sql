-- ============================================================
-- MedTracker — Calendar v2: calendars, semesters, events, exams
-- Run once in Supabase SQL Editor (Dashboard → SQL Editor).
-- Safe to re-run (every step is idempotent).
--
-- Requires supabase_migration_delta_sync.sql (set_updated_at /
-- record_deletion), supabase_migration_workspaces.sql (workspaces)
-- and supabase_migration_calendar.sql (scheduled_sessions) to have
-- been applied first.
--
-- The old `scheduled_sessions` table is absorbed into calendar_events
-- (step 6) but deliberately left in place, untouched, as the rollback
-- path. Nothing writes to it after this migration.
-- ============================================================

-- 1. calendars ------------------------------------------------
-- One calendar = one course of study. Calendars live inside a
-- workspace, so the existing workspace scoping stays the outer
-- separation and nothing about the sync engine changes.
create table if not exists calendars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  workspace_id uuid references workspaces(id) on delete cascade,
  name text not null,
  color text not null default '#6366f1',
  -- Emoji, same idea as topics.emoji.
  icon text not null default '🎓',
  kind text not null default 'study'
    check (kind in ('study', 'personal', 'exam', 'other')),
  -- How this study's grades are read: 'at-de' = 1..5, lower is better;
  -- 'pct' = 0..100, higher is better. Drives every average on the exams page.
  grade_scheme text not null default 'at-de' check (grade_scheme in ('at-de', 'pct')),
  is_default boolean not null default false,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_calendars_ws      on calendars (user_id, workspace_id, display_order);
create index if not exists idx_calendars_updated on calendars (user_id, updated_at);

-- At most one default calendar per workspace. This is also what makes
-- the backfill in step 5 re-runnable.
create unique index if not exists calendars_default_uniq
  on calendars (user_id, workspace_id) where is_default;

alter table calendars enable row level security;
drop policy if exists "own data" on calendars;
create policy "own data" on calendars for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists set_updated_at on calendars;
create trigger set_updated_at before insert or update on calendars
  for each row execute function set_updated_at();

drop trigger if exists record_deletion on calendars;
create trigger record_deletion after delete on calendars
  for each row execute function record_deletion();

alter table calendars replica identity full;

-- 2. semesters ------------------------------------------------
create table if not exists semesters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  workspace_id uuid references workspaces(id) on delete cascade,
  calendar_id uuid not null references calendars(id) on delete cascade,
  -- 'WS 26/27', 'Sommersemester 27' …
  name text not null,
  start_date date not null,
  end_date date not null,
  -- The average the user is aiming for; the exams page solves backwards from it.
  target_grade numeric(4,2),
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists idx_semesters_ws      on semesters (user_id, workspace_id, start_date);
create index if not exists idx_semesters_updated on semesters (user_id, updated_at);

alter table semesters enable row level security;
drop policy if exists "own data" on semesters;
create policy "own data" on semesters for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists set_updated_at on semesters;
create trigger set_updated_at before insert or update on semesters
  for each row execute function set_updated_at();

drop trigger if exists record_deletion on semesters;
create trigger record_deletion after delete on semesters
  for each row execute function record_deletion();

alter table semesters replica identity full;

-- 3. calendar_events ------------------------------------------
-- Superset of the old scheduled_sessions: anything on the calendar is
-- a row here, discriminated by `kind`.
--
-- Times are FLOATING LOCAL WALL TIME (date + time), never timestamptz.
-- The whole app keys off local day strings (localDayKey in
-- todoPriorityCalcs.js exists precisely to avoid the UTC-boundary shift),
-- and private.push_candidates() already does `(date + time)` arithmetic
-- inside each user's own zone. A timetable is wall-clock by nature —
-- "Biochemie is at 08:15" stays 08:15 across a DST change or a trip.
create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  workspace_id uuid references workspaces(id) on delete cascade,
  calendar_id uuid references calendars(id) on delete cascade,
  semester_id uuid references semesters(id) on delete set null,
  topic_id uuid references topics(id) on delete set null,
  kind text not null default 'event'
    check (kind in ('event', 'class', 'study', 'assignment', 'exam', 'deadline', 'other')),
  title text not null default '',
  notes text,
  location text,
  -- [{ id, label, url, kind }] — Drive docs, recordings, Moodle pages…
  links jsonb not null default '[]'::jsonb,

  start_date date not null,
  start_time time,
  end_date date,
  end_time time,
  all_day boolean not null default false,

  -- Overrides the calendar colour when set.
  color text,
  -- RRULE subset (FREQ=DAILY|WEEKLY|MONTHLY, INTERVAL, BYDAY, BYMONTHDAY,
  -- COUNT, UNTIL), parsed and expanded client-side for the visible range.
  rrule text,
  rrule_until date,
  exdates date[] not null default '{}',
  -- A detached occurrence points at its series, and says which date it
  -- replaces, so the expander can skip that slot.
  recurrence_parent_id uuid references calendar_events(id) on delete cascade,
  recurrence_date date,
  -- Minutes before the start; empty falls back to notification_prefs.lead_minutes.
  reminders smallint[] not null default '{}',

  completed boolean not null default false,
  completed_at timestamptz,
  session_id uuid references sessions(id) on delete set null,
  planned_minutes int,
  -- Provenance of a row copied out of scheduled_sessions (step 6).
  legacy_scheduled_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_events_ws       on calendar_events (user_id, workspace_id, start_date);
create index if not exists idx_events_calendar on calendar_events (user_id, calendar_id, start_date);
create index if not exists idx_events_parent   on calendar_events (user_id, recurrence_parent_id);
create index if not exists idx_events_updated  on calendar_events (user_id, updated_at);
create unique index if not exists idx_events_legacy
  on calendar_events (legacy_scheduled_id) where legacy_scheduled_id is not null;

alter table calendar_events enable row level security;
drop policy if exists "own data" on calendar_events;
create policy "own data" on calendar_events for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists set_updated_at on calendar_events;
create trigger set_updated_at before insert or update on calendar_events
  for each row execute function set_updated_at();

drop trigger if exists record_deletion on calendar_events;
create trigger record_deletion after delete on calendar_events
  for each row execute function record_deletion();

alter table calendar_events replica identity full;

-- 4. exams ----------------------------------------------------
-- Standalone so an exam can be tracked (and scored) without ever
-- having been on the calendar; `event_id` links it to its slot when
-- there is one.
create table if not exists exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  workspace_id uuid references workspaces(id) on delete cascade,
  calendar_id uuid references calendars(id) on delete cascade,
  semester_id uuid references semesters(id) on delete set null,
  event_id uuid references calendar_events(id) on delete set null,
  topic_id uuid references topics(id) on delete set null,
  title text not null,
  exam_date date,
  kind text not null default 'exam'
    check (kind in ('exam', 'midterm', 'final', 'quiz', 'oral', 'paper', 'lab')),
  status text not null default 'planned'
    check (status in ('planned', 'studying', 'written', 'graded')),
  score numeric(8,2),
  max_score numeric(8,2),
  -- As written by the user ('1', 'A', 'sehr gut') …
  grade text,
  -- …and normalised for the averages, per the calendar's grade_scheme.
  grade_numeric numeric(4,2),
  passed boolean,
  weight numeric(6,2) not null default 1,
  ects numeric(5,2),
  attempt smallint not null default 1,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_exams_ws       on exams (user_id, workspace_id, exam_date);
create index if not exists idx_exams_semester on exams (user_id, semester_id);
create index if not exists idx_exams_updated  on exams (user_id, updated_at);

alter table exams enable row level security;
drop policy if exists "own data" on exams;
create policy "own data" on exams for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists set_updated_at on exams;
create trigger set_updated_at before insert or update on exams
  for each row execute function set_updated_at();

drop trigger if exists record_deletion on exams;
create trigger record_deletion after delete on exams
  for each row execute function record_deletion();

alter table exams replica identity full;

-- 5. Todos: subtasks + event links ----------------------------
-- parent_id makes a todo a subtask of another todo (depth is capped
-- at 3 client-side, not here). event_id links a task to a calendar
-- event; the event's outline renders the completion of exactly those
-- tasks, so the link must survive the task outliving its event.
--
-- sort_order is double precision so a drag-reorder is ONE write — the
-- midpoint between its two new neighbours — instead of re-indexing every
-- sibling. That matters here because offline writes are queued row by row.
alter table todos add column if not exists parent_id  uuid references todos(id) on delete cascade;
alter table todos add column if not exists event_id   uuid references calendar_events(id) on delete set null;
alter table todos add column if not exists sort_order double precision not null default 0;
alter table todos add column if not exists notes      text;

create index if not exists idx_todos_parent on todos (user_id, parent_id);
create index if not exists idx_todos_event  on todos (user_id, event_id);

-- 6. Backfill --------------------------------------------------
-- 6a. One default calendar per existing workspace. The partial unique
-- index above makes a second run a no-op.
insert into calendars (user_id, workspace_id, name, color, icon, is_default, display_order)
select w.user_id, w.id, coalesce(nullif(w.name, ''), 'Studium'),
       coalesce(w.color, '#6366f1'), '🎓', true, 0
from workspaces w
where not exists (
  select 1 from calendars c
  where c.user_id = w.user_id and c.workspace_id = w.id and c.is_default
);

-- 6b. Absorb scheduled_sessions into calendar_events. Both models are local
-- wall-clock, so this is a straight column copy — no zone conversion, no
-- chance of a row landing on the wrong day. Entries with no start_time
-- become all-day rows. The end time clamps at 23:59 instead of wrapping
-- past midnight.
insert into calendar_events (
  user_id, workspace_id, calendar_id, topic_id, kind, title, notes,
  start_date, start_time, end_date, end_time, all_day,
  planned_minutes, completed, session_id, legacy_scheduled_id, created_at
)
select
  ss.user_id,
  ss.workspace_id,
  c.id,
  ss.topic_id,
  'study',
  coalesce(t.name, 'Session'),
  ss.note,
  ss.scheduled_date,
  ss.start_time,
  ss.scheduled_date,
  case
    when ss.start_time is null then null
    when ss.start_time + make_interval(mins => coalesce(ss.planned_minutes, 30)) >= interval '24 hours'
      then time '23:59'
    else (ss.start_time + make_interval(mins => coalesce(ss.planned_minutes, 30)))::time
  end,
  ss.start_time is null,
  coalesce(ss.planned_minutes, 30),
  ss.completed,
  ss.session_id,
  ss.id,
  ss.created_at
from scheduled_sessions ss
join calendars c
  on c.user_id = ss.user_id
 and c.workspace_id is not distinct from ss.workspace_id
 and c.is_default
left join topics t on t.id = ss.topic_id
where not exists (
  select 1 from calendar_events e where e.legacy_scheduled_id = ss.id
);

-- 6c. Give every existing todo a sane sort_order (creation order), so the
-- first drag-reorder has real neighbours to compute a midpoint between.
update todos set sort_order = extract(epoch from coalesce(created_at, now()))
where sort_order = 0;

-- 7. Realtime publication -------------------------------------
do $$
declare
  tbl text;
begin
  foreach tbl in array array['calendars', 'semesters', 'calendar_events', 'exams'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = tbl
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    end if;
  end loop;
end $$;

-- Verification:
--   select count(*) from scheduled_sessions;                                    -- n
--   select count(*) from calendar_events where legacy_scheduled_id is not null; -- expect n
--   select count(*) from workspaces w
--     where not exists (select 1 from calendars c
--                       where c.workspace_id = w.id and c.is_default);          -- expect 0
