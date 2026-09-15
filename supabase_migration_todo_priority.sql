-- ============================================================
-- Todo priority + due time
--
-- Optional manual priority per todo: null = none, 1 = low,
-- 2 = medium, 3 = high. When null the client derives a priority
-- from the todo's topic (weight × accuracy gap, like the Planner).
-- ============================================================

alter table todos add column if not exists priority smallint;

-- Optional time of day for the due date (null = all day).
alter table todos add column if not exists due_time time;

alter table todos drop constraint if exists todos_priority_range;
alter table todos add constraint todos_priority_range
  check (priority is null or priority between 1 and 3);
