# NIGHT SHIFT

A persistent extraction game your Twitch chat lives inside. Viewers enroll as
employees of **Benefactor Industries**, deploy into anomalous "shifts" that play
out live on your stream overlay, vote to steer the squad, and build a persistent
stash that survives across streams — until the night they don't extract.

- **Tarkov DNA** — extract to keep your loot, die and lose what you carried
- **Sim DNA** — persistent economy: credits, stash, lifetime stats
- **Control / Alan Wake DNA** — an anomalous facility on the night shift

## Quick start

```bash
npm install
npm run dev
```

Then:

| URL | What it is |
|---|---|
| `http://localhost:3000/overlay` | **OBS browser source** (1920×1080, transparent) |
| `http://localhost:3000/` | Companion site — stash lookup, leaderboard, shift archive |
| `http://localhost:3000/director` | Streamer-only controls (bless / curse / bomb / open doors / shift schedule) |

With no configuration it boots in **mock chat mode** — fake viewers enroll,
deploy, vote, and sabotage so you can see the whole loop immediately.

## Connect real Twitch chat

No OAuth or tokens needed — chat is read anonymously:

```bash
TWITCH_CHANNEL=yourchannel npm run dev
```

## How it plays

1. Every few minutes a **shift opens** and the facility assigns a **wing** — one of six, from the Surface Annex (hazard LOW) down to the Understructure (CATASTROPHIC, rare). Chat types `!deploy` to enter (first `!clockin` to enroll — 100cr + a penlight). Deeper wings hit harder and pay better; casualties are attributed to each wing's **resident entities** (the Floor Manager, the Thing in the Vents, the Below…). The full directory — rooms, residents, hazard/yield meters, tonight's live assignment — is on the companion site.
2. The squad moves through 4 rooms drawn from that wing's pool (30+ rooms across the facility). **Every room has something to type.** Vote rooms put a decision on screen — anyone in chat can type the vote word, raider or not (some are straight **FIGHT / FLEE** calls against a resident). Every other room gets an **action callout**: raiders type `SEARCH` for a near-guaranteed find at extra risk, or `BRACE` to halve their risk and forgo loot — and **spectators who type `SEARCH` collect a small finder's fee**, so even lurkers earn by participating.
3. Raiders get **wounded** on the first hit, die on the second. A carried light source lowers your odds of being hit — and is **lost forever if you die**.
4. Survive the extraction sprint to bank your haul (+50cr bonus). Loot goes to your persistent stash.

### Chat commands

| Command | Effect |
|---|---|
| `!clockin` | Enroll (once) |
| `!deploy` | Join the open lobby; auto-carries your best light source |
| *vote word* | Vote during room events (e.g. `BREACH` / `SNEAK`) |
| `!heal [name]` | 30cr — cure a wounded raider |
| `!shield [name]` | 40cr — block the next hit on a raider |
| `!bomb` | sabotage the shift: danger ×1.4, loot ×1.5. Costs 60cr, **doubling each time it's used in a shift** (60 → 120 → 240…) so it can't be spammed to grief the squad |
| `!collect` | Bank your hideout's passive income |
| `!upgrade <module>` | Upgrade a hideout module (`generator`/`vault`/`beacon`/`infirmary`) |
| `!hideout` | Collect and show your hideout summary |
| `!carry <item\|auto\|none>` | Pick your deploy loadout — carried items grant their effect and are lost on death |
| `!wear <cosmetic\|none>` | Equip drip — worn drip deploys with you (buffs apply) and is lost on death too |
| `!style m` / `!style f` | Retake your employee-file photo (avatar base) |

## The Hideout (passive income)

Every employee has a persistent base that earns credits **between shifts and
between streams** — so even lurkers build a stake and have a reason to come
back. Income accrues lazily (no background job) and is correct after restarts
or days away. Manage it on the companion site or via chat.

| Module | Effect |
|---|---|
| **Generator** | Passive credits/hour (15 × level) |
| **Vault** | Caps unclaimed income (200 × level) — overflow is wasted, so upgrade before you go offline |
| **Beacon** | Loot luck on deploy — pulls more rares/anomalies |
| **Infirmary** | Chance to deploy already shielded |

The vault cap is the hook: a daily viewer who never upgrades the vault leaves
credits on the table, which nudges them to invest and check back.

## Bounties

Every shift names a **wanted artifact** (biased toward rares). The first raider
to **extract** it claims a credit reward on top of their haul. Shown on the
overlay, the companion live panel, and called out in the feed. The director can
reroll it from the console.

## Seasonal wipes & the Hall of Fame

A single cheer of `WIPE_BITS` bits (default 1000 ≈ $10) arms a ~60s **wipe
countdown** on the overlay. When it fires, the standings are snapshotted into a
permanent **Hall of Fame**, the #1 player earns a **crown** (which survives all
future wipes), and every account resets to a fresh economy as the season number
ticks up. The director can trigger or cancel a wipe manually.

## The Incident Log

Every death is immortalized in a permanent graveyard on the companion site —
the epitaph, the resident that did it, the wing and room. Built for screenshots.

## Items & buffs

19 field items + 12 cosmetics, all listed with effects in the site's
**Quartermaster's Catalogue**. Anything equipped (carried item + worn drip)
deploys with you: buffs apply for the shift, and **everything equipped is lost
if you die**. Buff types: *safety* (lower hit chance), *guard* (block the first
hit), *second wind* (auto-cure first wound), *phoenix* (cheat death once),
*luck* (rarer finds), *find* (more finds), *bonus* (extra extract credits).
14 field items and 9 cosmetics carry effects; the rest are sell-value or pure
drip.

## Employees, drip & player cards

Every player has a deterministic **pixel-art employee avatar** (office attire;
`!style m`/`!style f` to change the base). Shifts occasionally drop
**cosmetics** on the same rarity scale — paper hats up to the Warden's Cap and
the EXIT Sign Halo — worn with `!wear` and rendered on the avatar everywhere it
appears (squad chips on the overlay, employee file, directory). Cosmetics are
loot: lost on death before extraction, wiped with the season.

Each player has a **shareable employee card** at `/card?u=<name>` — portrait,
crowns, stats, notable holdings — with copy-link/share buttons. The
**Employee Directory** on the site is a searchable grid of every enrolled
player; click a badge to open their file. The site remembers who you are via
localStorage (no login needed — all state changes go through chat, where Twitch
identity is free).

## The companion site

- **Facility Schematic** — a live SVG cross-section of all six wings; the
  assigned wing pulses and a marker tracks the squad's depth in real time.
- **Item sigils** — every artifact has a unique procedural emblem (rarity-framed)
  in the stash and on overlay loot drops.
- **The haunt** — live chat bleeds across the page as ghosts; the facility
  whispers back, and occasionally the page glitches, shakes, or briefly corrupts
  into containment glyphs.

`!heal` / `!shield` / `!bomb` trigger the channel's alert sounds
(`Health.wav`, `Shield_Charge.wav`, `bomb_dropped.wav`) through the overlay.

## Configuration (env vars)

| Var | Default | Meaning |
|---|---|---|
| `TWITCH_CHANNEL` | *(unset → mock chat)* | Channel to read chat from |
| `PORT` | `3000` | HTTP/WS port |
| `RAID_INTERVAL_SEC` | `300` | Downtime between shifts (adjustable live from `/director`, incl. 0 = back-to-back; an empty lobby waits 60s before reopening) |
| `LOBBY_SEC` | `45` | How long `!deploy` stays open |
| `ROOM_SEC` | `24` | Seconds per room |
| `ROOMS_PER_SHIFT` | `4` | Rooms per shift |
| `DIRECTOR_KEY` | *(unset = open)* | If set, `/director` actions require this key |
| `SUPABASE_URL` | *(unset → file store)* | Your project URL |
| `SUPABASE_SERVICE_KEY` | *(unset → file store)* | **Service role** key (server-side only) |

## Persistence

The store keeps the authoritative state in memory and flushes changes to a
backend every few seconds. Two backends, chosen automatically:

- **File** (default) — `data/nightshift.json`. Zero setup, perfect for local dev.
- **Supabase** — activates when `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` are set.

### Connecting Supabase

1. Create a project (free tier is plenty — a few KB per player). It won't pause
   while your live server is hitting it.
2. Run `supabase/migrations/0001_init.sql` in the SQL Editor (or via the CLI).
3. Set `SUPABASE_URL` and the **service role** key in your server env.

The service role key bypasses RLS and must stay server-side — the companion
site reads through this game's own API, never the database directly. The
migration enables RLS with no public policies, so the tables stay sealed even
if the anon key leaks.

## Deploying

This is a stateful WebSocket server, so it wants a long-running host, not a
static/serverless one. The overlay, companion, and director pages are all
served by the one Node process, so a single service is the whole deployment.

### Render (one-click via Blueprint)

`render.yaml` at the repo root describes the service. In Render: **New →
Blueprint → pick this repo**. Render then prompts you for the four values (all
kept out of git because this repo is public):

| Prompt | What to enter |
|---|---|
| `TWITCH_CHANNEL` | your channel login |
| `SUPABASE_URL` | `https://qqbgwrkyqvdfkhqpmvan.supabase.co` |
| `SUPABASE_SERVICE_KEY` | the **service_role** key from Supabase → Settings → API Keys |
| `DIRECTOR_KEY` | any string — locks `/director` to you |

The blueprint tracks the branch named in `render.yaml` (currently the feature
branch); point it at `main` once you merge. It defaults to the **free** plan,
which sleeps after 15 min of no traffic — fine here, since nothing is lost while
asleep (income is timestamp-based and pending state is flushed on shutdown) and
viewer connections keep it awake during a stream. Bump `plan` to `starter` to
remove cold starts entirely.

### Netlify

Best as a CDN/custom domain in front of the companion site, but the realtime
server itself should run on Render — don't host the WebSocket server on Netlify
Functions.

## Architecture

```
server/
  index.ts        HTTP + WebSocket server, JSON API, static hosting
  twitch.ts       anonymous Twitch IRC reader + mock chat simulator
  store.ts        flat-file persistence (data/) — swap for Supabase later
  types.ts        shared persistent record shapes
  store.ts        in-memory cache + write-through to a pluggable backend
  persistence/
    file.ts       flat-file backend (default)
    supabase.ts   Supabase backend (set SUPABASE_URL + SERVICE_KEY)
  game/
    engine.ts     authoritative 1Hz simulation: shift state machine, votes,
                  casualties, loot, economy, director powers
    hideout.ts    passive-income economy + module upgrades
    items.ts      item catalogue (rarity, value, light sources)
    rooms.ts      encounter deck + chat-vote definitions
supabase/migrations/  SQL schema for the Supabase backend
web/
  overlay.html/.js     OBS overlay HUD
  companion.html/.js   viewer-facing site
  director.html        streamer console
```

Persistence is a flat JSON file under `data/` (gitignored). The store module is
the only thing that touches it — swapping in Supabase/Postgres later means
replacing one file.

## Roadmap ideas

- Channel point / bits redemptions via Twitch EventSub (heal/shield/bomb as redeems)
- Loadout picking + viewer-to-viewer market on the companion site
- Hideout upgrades: passive credit income between streams
- Seasonal wipes + season leaderboards
- Twitch OAuth on the companion site so viewers manage their own stash
