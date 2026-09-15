-- ─────────────────────────────────────────────────────────────────────────────
-- Push notifications (Web Push) — run once in the Supabase SQL editor.
--
-- Flow: pg_cron checks every minute whether anything is due (cheap, in-DB).
-- Only then pg_net calls the `push-dispatch` Edge Function, which claims the
-- due items via claim_due_notifications() (deduped through push_log) and
-- sends the actual Web Push messages. Everything here is on the Free plan.
--
-- After running this file, store the two Vault secrets (see bottom).
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net  with schema extensions;

-- Not exposed through the REST API — internal helpers for cron only.
create schema if not exists private;

-- 1. Tables ------------------------------------------------------------------

-- One row per device/browser that allowed notifications.
create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- Per-user preferences, mirrored from the Settings screen.
create table if not exists public.notification_prefs (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  enabled            boolean  not null default false,
  scheduled_sessions boolean  not null default true,
  todo_due           boolean  not null default true,
  streak             boolean  not null default true,
  active_session     boolean  not null default true,
  updates            boolean  not null default true,
  lead_minutes       smallint not null default 10 check (lead_minutes in (0, 5, 10, 15, 30)),
  timezone           text     not null default 'Europe/Vienna',
  language           text     not null default 'de' check (language in ('de', 'en')),
  updated_at         timestamptz not null default now()
);

-- A study session currently running on some device. last_seen_at is a
-- heartbeat; it stops when iOS suspends the backgrounded app.
create table if not exists public.active_sessions (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  started_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- Every notification ever claimed — the unique key makes delivery exactly-once.
create table if not exists public.push_log (
  id       bigint generated always as identity primary key,
  user_id  uuid not null references auth.users(id) on delete cascade,
  kind     text not null,
  ref_key  text not null,
  sent_at  timestamptz not null default now(),
  unique (user_id, kind, ref_key)
);

-- 2. Row Level Security ------------------------------------------------------

alter table public.push_subscriptions enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.active_sessions    enable row level security;
alter table public.push_log           enable row level security; -- no policies: service role only

drop policy if exists "push_subscriptions: own" on public.push_subscriptions;
create policy "push_subscriptions: own" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "notification_prefs: own" on public.notification_prefs;
create policy "notification_prefs: own" on public.notification_prefs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "active_sessions: own" on public.active_sessions;
create policy "active_sessions: own" on public.active_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- An unknown time zone name would make every `at time zone` below throw and
-- break the cron job for all users — fall back to UTC instead.
create or replace function private.notification_prefs_before_write()
returns trigger language plpgsql as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.timezone) then
    new.timezone := 'UTC';
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists notification_prefs_before_write on public.notification_prefs;
create trigger notification_prefs_before_write
  before insert or update on public.notification_prefs
  for each row execute function private.notification_prefs_before_write();

-- 3. Client RPC --------------------------------------------------------------

-- Upsert by endpoint and take ownership: the same device may have been
-- registered by another account that used to be logged in here.
create or replace function public.register_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null
) returns void
language sql volatile security definer set search_path = public as $$
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, last_seen_at)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, p_user_agent, now())
  on conflict (endpoint) do update
    set user_id      = excluded.user_id,
        p256dh       = excluded.p256dh,
        auth         = excluded.auth,
        user_agent   = excluded.user_agent,
        last_seen_at = now()
$$;

revoke all on function public.register_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text) to authenticated;

-- 4. Scheduling logic --------------------------------------------------------

-- Everything that should be notified right now, evaluated in each user's local
-- time. Time-bound items use a 5-minute catch-up window so a skipped or late
-- cron run still delivers; push_log prevents repeats.
create or replace function private.push_candidates()
returns table (user_id uuid, kind text, ref_key text, payload jsonb)
language sql stable security definer set search_path = public as $$
  with p as (
    select np.*, (now() at time zone np.timezone) as local_now
    from public.notification_prefs np
    where np.enabled
      and exists (select 1 from public.push_subscriptions s where s.user_id = np.user_id)
  )

  -- Planned session starts in `lead_minutes`
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
$$;

-- Cheap gate for the cron job: is there anything not yet sent?
create or replace function private.has_due_notifications()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from private.push_candidates() c
    where not exists (
      select 1 from public.push_log l
      where l.user_id = c.user_id and l.kind = c.kind and l.ref_key = c.ref_key)
  )
$$;

-- Called by the Edge Function: marks due items as sent and returns only the
-- ones this call claimed, so concurrent runs can never double-send.
create or replace function public.claim_due_notifications()
returns table (user_id uuid, kind text, ref_key text, payload jsonb)
language sql volatile security definer set search_path = public as $$
  with c as (
    select * from private.push_candidates()
  ),
  ins as (
    insert into public.push_log (user_id, kind, ref_key)
    select distinct c.user_id, c.kind, c.ref_key from c
    on conflict (user_id, kind, ref_key) do nothing
    returning push_log.user_id, push_log.kind, push_log.ref_key
  )
  select ins.user_id, ins.kind, ins.ref_key, c.payload
  from ins
  join c on c.user_id = ins.user_id and c.kind = ins.kind and c.ref_key = ins.ref_key
$$;

-- Called by the Edge Function after a deploy (scripts/notify-update.mjs).
create or replace function public.claim_update_notifications(p_version text)
returns table (user_id uuid, kind text, ref_key text, payload jsonb)
language sql volatile security definer set search_path = public as $$
  with ins as (
    insert into public.push_log (user_id, kind, ref_key)
    select np.user_id, 'updates', 'updates:' || p_version
    from public.notification_prefs np
    where np.enabled
      and np.updates
      and exists (select 1 from public.push_subscriptions s where s.user_id = np.user_id)
    on conflict (user_id, kind, ref_key) do nothing
    returning push_log.user_id, push_log.kind, push_log.ref_key
  )
  select ins.user_id, ins.kind, ins.ref_key, jsonb_build_object('version', p_version)
  from ins
$$;

revoke all on function public.claim_due_notifications()        from public, anon, authenticated;
revoke all on function public.claim_update_notifications(text) from public, anon, authenticated;
grant execute on function public.claim_due_notifications()        to service_role;
grant execute on function public.claim_update_notifications(text) to service_role;

-- 5. Cron --------------------------------------------------------------------

select cron.unschedule(jobname) from cron.job where jobname in ('push-dispatch', 'push-log-cleanup');

select cron.schedule('push-dispatch', '* * * * *', $cron$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'push_dispatch_url'),
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 10000
  )
  where private.has_due_notifications();
$cron$);

select cron.schedule('push-log-cleanup', '17 3 * * *', $cron$
  delete from public.push_log where sent_at < now() - interval '30 days';
$cron$);

-- 6. Vault secrets — run once with your own values (NOT committed anywhere) ---
--
-- select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/push-dispatch', 'push_dispatch_url');
-- select vault.create_secret('<same value as the CRON_SECRET Edge Function secret>',       'push_cron_secret');
--
-- Check the job:  select * from cron.job_run_details order by start_time desc limit 20;
-- Dry run:        select * from private.push_candidates();
