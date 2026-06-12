-- Seasonal wipes + Hall of Fame.
--
-- A wipe snapshots the standings into `seasons` and resets every player to a
-- fresh economy; `meta.season` tracks the current season number. Stored as
-- JSONB to mirror the server's SeasonRecord shape, same as players/raids.

create table if not exists public.seasons (
  number integer primary key,
  doc    jsonb not null
);

alter table public.seasons enable row level security;
-- No public policies: service-role only, same as the other tables.

alter table public.meta add column if not exists season integer not null default 1;
