-- NIGHT SHIFT — initial schema.
--
-- Records are stored as JSONB so the database mirrors the server's in-memory
-- shape exactly; the game computes leaderboards in the app, so we don't need
-- relational columns here. The server connects with the service role key and
-- bypasses RLS — the companion site never touches these tables directly, it
-- goes through the game's own API. RLS is enabled with no public policies so
-- that even if the anon key leaked, the tables stay sealed.

create table if not exists public.players (
  login      text primary key,
  doc        jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.raids (
  id  integer primary key,
  doc jsonb not null
);

create table if not exists public.meta (
  id           integer primary key,   -- always 1
  raid_counter integer not null default 0
);

insert into public.meta (id, raid_counter)
  values (1, 0)
  on conflict (id) do nothing;

-- Handy for a future net-worth leaderboard query straight from SQL.
create index if not exists players_credits_idx
  on public.players (((doc->>'credits')::int) desc);

alter table public.players enable row level security;
alter table public.raids   enable row level security;
alter table public.meta    enable row level security;

-- No policies are created on purpose: anon/auth roles get nothing, the
-- service role (used by the server) ignores RLS entirely.
