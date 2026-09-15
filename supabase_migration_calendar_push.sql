-- ============================================================
-- MedTracker — Calendar v2 reminders
-- Run once in Supabase SQL Editor, AFTER supabase_migration_push.sql
-- and supabase_migration_calendar_v2.sql. Safe to re-run.
--
-- Adds three notification kinds on top of the existing pipeline
-- (pg_cron → private.push_candidates() → Edge Function):
--   calendarEvents — an event starting, per its own reminder offsets
--   assignmentDue  — an assignment/deadline, evening before and at due time
--   examSoon       — an exam, N days ahead at 09:00 local
--
-- Redeploy the Edge Function afterwards:
--   supabase functions deploy push-dispatch --no-verify-jwt
-- ============================================================

-- 1. Preferences ----------------------------------------------
alter table public.notification_prefs
  add column if not exists calendar_events boolean not null default true;
alter table public.notification_prefs
  add column if not exists assignment_due boolean not null default true;
alter table public.notification_prefs
  add column if not exists exam_reminder boolean not null default true;
alter table public.notification_prefs
  add column if not exists exam_lead_days smallint not null default 3;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'notification_prefs_exam_lead_days_check'
  ) then
    alter table public.notification_prefs
      add constraint notification_prefs_exam_lead_days_check
      check (exam_lead_days in (1, 2, 3, 7));
  end if;
end $$;

-- 2. Scheduler ------------------------------------------------
-- The original four arms are unchanged; three are appended. Everything is
-- still evaluated in the user's own time zone with the same 5-minute
-- catch-up window, and push_log still makes delivery exactly-once.
--
-- Recurring events are deliberately NOT expanded here: doing RRULE maths in
-- SQL would duplicate the client's expander and drift from it. A recurring
-- class therefore gets no server reminder until its occurrence is detached
-- (moved or edited), which materialises a real row. If that proves too
-- limiting, the answer is a nightly job that materialises the next 14 days,
-- not RRULE in this function.
create or replace function private.push_candidates()
returns table (user_id uuid, kind text, ref_key text, payload jsonb)
language sql stable security definer set search_path = public as $$
  with p as (
    select np.*, (now() at time zone np.timezone) as local_now
    from public.notification_prefs np
    where np.enabled
      and exists (select 1 from public.push_subscriptions s where s.user_id = np.user_id)
  )

  -- Planned session starts in `lead_minutes` (legacy scheduled_sessions)
  select p.user_id,
         'scheduledSessions'::text,
         'ss:' || ss.id::text || ':' || ss.scheduled_date::text || 'T' || ss.start_time::text,
         jsonb_build_object(
           'topic',   t.name,
           'emoji',   t.emoji,
           'time',    left(ss.start_time::text, 5),
           'minutes', p.lead_minutes,
           'note',    ss.note)
  from p
  join public.scheduled_sessions ss on ss.user_id = p.user_id
  left join public.topics t on t.id = ss.topic_id
  where p.scheduled_sessions
    and not ss.completed
    and ss.start_time is not null
    and ss.scheduled_date between p.local_now::date - 1 and p.local_now::date + 1
    and (ss.scheduled_date + ss.start_time) - make_interval(mins => p.lead_minutes) <= p.local_now
    and (ss.scheduled_date + ss.start_time) - make_interval(mins => p.lead_minutes) >  p.local_now - interval '5 minutes'

  union all

  -- To-do reached its due time; all-day to-dos go out from 08:00 on the due day
  select p.user_id,
         'todoDue'::text,
         'todo:' || td.id::text || ':' || td.due_date::text || ':' || coalesce(td.due_time::text, 'allday'),
         jsonb_build_object('text', td.text, 'time', left(td.due_time::text, 5))
  from p
  join public.todos td on td.user_id = p.user_id
  where p.todo_due
    and not coalesce(td.completed, false)
    and td.due_date between p.local_now::date - 1 and p.local_now::date
    and case
          when td.due_time is null
            then td.due_date = p.local_now::date and p.local_now::time >= time '08:00'
          else (td.due_date + td.due_time) <= p.local_now
           and (td.due_date + td.due_time) >  p.local_now - interval '5 minutes'
        end

  union all

  -- Streak at risk: after 20:00, practised yesterday but not yet today
  select p.user_id,
         'streak'::text,
         'streak:' || p.local_now::date::text,
         '{}'::jsonb
  from p
  where p.streak
    and p.local_now::time >= time '20:00'
    and exists (
      select 1 from public.sessions s
      where s.user_id = p.user_id
        and s.started_at >= ((p.local_now::date - 1)::timestamp at time zone p.timezone)
        and s.started_at <  (p.local_now::date::timestamp at time zone p.timezone))
    and not exists (
      select 1 from public.sessions s
      where s.user_id = p.user_id
        and s.started_at >= (p.local_now::date::timestamp at time zone p.timezone))

  union all

  -- Session still running but the app hasn't been seen for 30 minutes
  select p.user_id,
         'activeSession'::text,
         'active:' || a.started_at::text,
         '{}'::jsonb
  from p
  join public.active_sessions a on a.user_id = p.user_id
  where p.active_session
    and a.last_seen_at < now() - interval '30 minutes'
    and a.last_seen_at > now() - interval '12 hours'

  union all

  -- Calendar event starting, once per reminder offset the event carries
  -- (falling back to the user's global lead time when it carries none).
  select p.user_id,
         'calendarEvents'::text,
         'ev:' || e.id::text || ':' || e.start_date::text || ':' || r::text,
         jsonb_build_object(
           'title',    e.title,
           'kind',     e.kind,
           'time',     left(e.start_time::text, 5),
           'minutes',  r,
           'location', e.location,
           'date',     e.start_date::text)
  from p
  join public.calendar_events e on e.user_id = p.user_id
  cross join lateral unnest(
    case when cardinality(e.reminders) > 0
      then e.reminders
      else array[p.lead_minutes]::smallint[]
    end) as r
  where p.calendar_events
    and e.rrule is null
    and not e.completed
    and not e.all_day
    and e.start_time is not null
    and e.kind not in ('assignment', 'deadline')
    and e.start_date between p.local_now::date - 1 and p.local_now::date + 2
    and (e.start_date + e.start_time) - make_interval(mins => r) <= p.local_now
    and (e.start_date + e.start_time) - make_interval(mins => r) >  p.local_now - interval '5 minutes'

  union all

  -- Assignment / deadline: 18:00 the evening before, and again when it is due.
  -- The payload carries the checklist state, so the banner can say how much of
  -- it is actually done.
  select p.user_id,
         'assignmentDue'::text,
         'asg:' || e.id::text || ':' || e.start_date::text || ':' ||
           case when e.start_date = p.local_now::date + 1 then 'eve' else 'due' end,
         jsonb_build_object(
           'title', e.title,
           'date',  e.start_date::text,
           'done',  (select count(*) from public.todos td where td.event_id = e.id and td.completed),
           'total', (select count(*) from public.todos td where td.event_id = e.id))
  from p
  join public.calendar_events e on e.user_id = p.user_id
  where p.assignment_due
    and e.rrule is null
    and e.kind in ('assignment', 'deadline')
    and not e.completed
    and e.start_date between p.local_now::date and p.local_now::date + 1
    and case
          when e.start_date = p.local_now::date + 1
            then p.local_now::time >= time '18:00' and p.local_now::time < time '18:05'
          when e.all_day or e.start_time is null
            then p.local_now::time >= time '08:00' and p.local_now::time < time '08:05'
          else (e.start_date + e.start_time) <= p.local_now
           and (e.start_date + e.start_time) >  p.local_now - interval '5 minutes'
        end

  union all

  -- Exam countdown: 09:00 local, exam_lead_days before the exam
  select p.user_id,
         'examSoon'::text,
         'exam:' || x.id::text || ':' || x.exam_date::text,
         jsonb_build_object(
           'title', x.title,
           'days',  p.exam_lead_days,
           'date',  x.exam_date::text)
  from p
  join public.exams x on x.user_id = p.user_id
  where p.exam_reminder
    and x.status in ('planned', 'studying')
    and x.exam_date = p.local_now::date + p.exam_lead_days
    and p.local_now::time >= time '09:00'
    and p.local_now::time <  time '09:05'
$$;

-- Verification:
--   select * from private.push_candidates();
--   -- insert an event 10 minutes out with reminders = '{10}' and expect one row
