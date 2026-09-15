-- ============================================================
-- MedTracker — Google OAuth refresh tokens
-- Run once in Supabase SQL Editor, AFTER
-- supabase_migration_calendar_connections.sql. Safe to re-run.
--
-- Holds the refresh token behind Google Calendar / Tasks sync, so a
-- connection survives reloads, token expiry and new devices. Only the
-- google-oauth Edge Function (service role) touches this table: RLS is on
-- with no policies, so the anon and authenticated roles can neither read
-- nor write a row.
--
-- Deploy alongside:
--   supabase functions deploy google-oauth
--   supabase secrets set GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=...
-- ============================================================

create table if not exists public.google_oauth_tokens (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  scopes        text[] not null default '{}',
  email         text,
  updated_at    timestamptz not null default now()
);

alter table public.google_oauth_tokens enable row level security;
revoke all on public.google_oauth_tokens from anon, authenticated;

-- Verification (as service role / SQL editor):
--   select user_id, scopes, email, updated_at from google_oauth_tokens;
