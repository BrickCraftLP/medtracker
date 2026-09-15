-- Migration: Add target_accuracy to topics
-- Run in Supabase SQL Editor (supabase.com → your project → SQL Editor)

alter table topics
  add column if not exists target_accuracy integer not null default 80;
