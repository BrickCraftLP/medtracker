-- ============================================================
-- MedTracker — Realtime DELETE fix
-- Run once in Supabase SQL Editor (Dashboard → SQL Editor)
--
-- By default, Postgres only includes the primary key in the
-- WAL for DELETE events. Supabase Realtime cannot evaluate
-- the user_id filter without the full old row, so DELETE
-- events are silently dropped for subscribers.
--
-- REPLICA IDENTITY FULL stores all column values in the WAL
-- for every change, enabling filtered DELETE events.
-- ============================================================

ALTER TABLE todos          REPLICA IDENTITY FULL;
ALTER TABLE topics         REPLICA IDENTITY FULL;
ALTER TABLE sessions       REPLICA IDENTITY FULL;
ALTER TABLE widget_configs REPLICA IDENTITY FULL;
