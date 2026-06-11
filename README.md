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
| `http://localhost:3000/director` | Streamer-only controls (bless / curse / bomb / open doors) |

With no configuration it boots in **mock chat mode** — fake viewers enroll,
deploy, vote, and sabotage so you can see the whole loop immediately.

## Connect real Twitch chat

No OAuth or tokens needed — chat is read anonymously:

```bash
TWITCH_CHANNEL=yourchannel npm run dev
```

## How it plays

1. Every ~5 minutes a **shift opens**. Chat types `!deploy` to enter (first `!clockin` to enroll — 100cr + a penlight).
2. The squad moves through 4 rooms of the facility. Some rooms put a **vote on screen** — anyone in chat can type the vote word, raider or not. Risky options = more danger, more loot.
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
| `!bomb` | 60cr — sabotage the shift: danger ×1.4, loot ×1.5 |

`!heal` / `!shield` / `!bomb` trigger the channel's alert sounds
(`Health.wav`, `Shield_Charge.wav`, `bomb_dropped.wav`) through the overlay.

## Configuration (env vars)

| Var | Default | Meaning |
|---|---|---|
| `TWITCH_CHANNEL` | *(unset → mock chat)* | Channel to read chat from |
| `PORT` | `3000` | HTTP/WS port |
| `RAID_INTERVAL_SEC` | `300` | Downtime between shifts |
| `LOBBY_SEC` | `45` | How long `!deploy` stays open |
| `ROOM_SEC` | `24` | Seconds per room |
| `ROOMS_PER_SHIFT` | `4` | Rooms per shift |
| `DIRECTOR_KEY` | *(unset = open)* | If set, `/director` actions require this key |

## Architecture

```
server/
  index.ts        HTTP + WebSocket server, JSON API, static hosting
  twitch.ts       anonymous Twitch IRC reader + mock chat simulator
  store.ts        flat-file persistence (data/) — swap for Supabase later
  game/
    engine.ts     authoritative 1Hz simulation: shift state machine, votes,
                  casualties, loot, economy, director powers
    items.ts      item catalogue (rarity, value, light sources)
    rooms.ts      encounter deck + chat-vote definitions
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
