-- MedTracker Supabase Schema
-- Run this entire file in the Supabase SQL Editor (supabase.com → your project → SQL Editor)

-- Profiles (extends auth.users)
create table profiles (
  id uuid references auth.users primary key,
  display_name text,
  avatar_url text,
  created_at timestamptz default now()
);

-- Topics
create table topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null,
  emoji text default '📚',
  color_from text default '#6366f1',
  color_to text default '#8b5cf6',
  description text,
  display_order int default 0,
  target_accuracy integer not null default 80,
  weight numeric(6,2) not null default 50,
  created_at timestamptz default now()
);

-- Migration for existing databases: run this if you already have the topics table
-- alter table topics add column if not exists weight numeric(6,2) not null default 50;
-- If you already added the integer column, run: alter table topics alter column weight type numeric(6,2);

-- Sessions
create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  topic_id uuid references topics not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  total_exercises int default 0,
  correct int default 0,
  wrong int default 0,
  duration_seconds int,
  created_at timestamptz default now()
);

-- Exercises (individual taps within a session)
create table exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions not null,
  user_id uuid references auth.users not null,
  is_correct boolean not null,
  duration_ms int not null,
  created_at timestamptz default now()
);

-- Todos
create table todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  topic_id uuid references topics,
  text text not null,
  completed boolean default false,
  due_date date,
  due_time time,
  priority smallint check (priority is null or priority between 1 and 3),
  created_at timestamptz default now()
);

-- Scheduled study sessions (calendar entries)
create table scheduled_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  topic_id uuid references topics,
  scheduled_date date not null,
  start_time time,
  planned_minutes int,
  note text,
  completed boolean not null default false,
  session_id uuid references sessions,
  created_at timestamptz default now()
);

-- Widget configs (up to 5 slots per user)
create table widget_configs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  position int not null check (position between 0 and 4),
  size text not null check (size in ('small', 'medium', 'large')),
  widget_type text not null,
  config jsonb default '{}',
  sub_widgets jsonb default '[]',
  created_at timestamptz default now(),
  unique(user_id, position)
);

-- Enable Row Level Security on all tables
alter table profiles enable row level security;
alter table topics enable row level security;
alter table sessions enable row level security;
alter table exercises enable row level security;
alter table todos enable row level security;
alter table widget_configs enable row level security;
alter table scheduled_sessions enable row level security;

-- RLS policies: users can only access their own data
create policy "own data" on profiles for all using (auth.uid() = id);
create policy "own data" on topics for all using (auth.uid() = user_id);
create policy "own data" on sessions for all using (auth.uid() = user_id);
create policy "own data" on exercises for all using (auth.uid() = user_id);
create policy "own data" on todos for all using (auth.uid() = user_id);
create policy "own data" on widget_configs for all using (auth.uid() = user_id);
create policy "own data" on scheduled_sessions for all using (auth.uid() = user_id);
