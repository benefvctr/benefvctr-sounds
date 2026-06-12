-- The Incident Log (graveyard).
--
-- Every death is immortalized here with its epitaph. Append-only, capped to
-- the most recent 1000 in memory; stored as JSONB to mirror the server's
-- Incident shape. Service-role only, same as the other tables.

create table if not exists public.incidents (
  id  integer primary key,
  doc jsonb not null
);

alter table public.incidents enable row level security;

alter table public.meta add column if not exists incident_counter integer not null default 0;
