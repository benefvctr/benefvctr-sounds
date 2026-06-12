// In-memory authoritative store with a pluggable write-through backend.
//
// The engine reads and mutates records synchronously; the store flushes
// whatever changed to the backend (flat file or Supabase) every few seconds
// and on exit. Picking a backend is a single env-var decision — no code in
// the engine ever knows which one is live.

import type { Backend } from './persistence/types.js';
import { FileBackend } from './persistence/file.js';
import { SupabaseBackend } from './persistence/supabase.js';
import {
  freshEconomy,
  normalizePlayer,
  type DataShape,
  type PlayerRecord,
  type RaidRecord,
  type SeasonRecord,
} from './types.js';
import { ITEM_BY_ID } from './game/items.js';

export type { PlayerRecord, RaidRecord, SeasonRecord } from './types.js';

let data: DataShape = { players: {}, raids: [], raidCounter: 0, seasons: [], season: 1 };
let backend: Backend;

// Change tracking, so a flush only ships what actually moved.
const dirtyPlayers = new Set<string>();
const pendingRaids: RaidRecord[] = [];
const pendingSeasons: SeasonRecord[] = [];
let flushing = false;

function chooseBackend(): Backend {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (url && key) return new SupabaseBackend(url, key);
  return new FileBackend();
}

export async function init(): Promise<void> {
  backend = chooseBackend();
  await backend.init();
  data = await backend.loadAll();
  if (!Array.isArray(data.seasons)) data.seasons = [];
  if (typeof data.season !== 'number') data.season = 1;
  for (const p of Object.values(data.players)) normalizePlayer(p);
  console.log(`[store] backend: ${backend.label} — ${Object.keys(data.players).length} player(s) loaded, season ${data.season}`);

  setInterval(() => void flush(), 8000).unref();
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

async function flush(): Promise<void> {
  if (flushing) return;
  if (dirtyPlayers.size === 0 && pendingRaids.length === 0) return;
  flushing = true;

  const players = [...dirtyPlayers].map((n) => data.players[n]).filter(Boolean);
  const raids = pendingRaids.splice(0);
  const seasons = pendingSeasons.splice(0);
  dirtyPlayers.clear();

  try {
    await backend.flush(players, raids, seasons, data.raidCounter, data.season);
  } catch (err) {
    // Re-queue so nothing is lost; try again next tick.
    for (const p of players) dirtyPlayers.add(p.name);
    pendingRaids.unshift(...raids);
    pendingSeasons.unshift(...seasons);
    console.error('[store] flush failed, will retry:', (err as Error).message);
  } finally {
    flushing = false;
  }
}

function netWorth(p: PlayerRecord): number {
  let v = p.credits;
  for (const [id, qty] of Object.entries(p.stash)) v += (ITEM_BY_ID.get(id)?.value ?? 0) * qty;
  return v;
}

export function currentSeason(): number {
  return data.season;
}

export function recentSeasons(n = 20): SeasonRecord[] {
  return data.seasons.slice(-n).reverse();
}

/**
 * End the season: snapshot the standings into the Hall of Fame, award a crown
 * to the #1 player, then reset every account to a fresh economy. Crowns and
 * identity survive; everything else is wiped. Irreversible.
 */
export function wipe(by?: string, bits?: number): SeasonRecord {
  const ranked = allPlayers()
    .map((p) => ({ p, nw: netWorth(p) }))
    .sort((a, b) => b.nw - a.nw);

  const record: SeasonRecord = {
    season: data.season,
    endedAt: Date.now(),
    wipedBy: by,
    bits,
    totalPlayers: ranked.length,
    champions: ranked.slice(0, 5).map(({ p, nw }) => ({
      name: p.name,
      display: p.display,
      netWorth: nw,
      extractions: p.stats.extractions,
      deaths: p.stats.deaths,
      bestHaul: p.stats.bestHaul,
    })),
  };

  if (ranked.length > 0 && ranked[0].nw > 100) ranked[0].p.crowns += 1; // a real win, not an empty season

  for (const p of allPlayers()) {
    Object.assign(p, freshEconomy());
    dirtyPlayers.add(p.name);
  }

  data.seasons.push(record);
  if (data.seasons.length > 200) data.seasons = data.seasons.slice(-200);
  pendingSeasons.push(record);
  data.season += 1;
  void flush(); // persist the wipe immediately, don't wait for the tick
  return record;
}

async function shutdown(): Promise<void> {
  await flush();
  process.exit(0);
}

export function markDirty(login: string): void {
  dirtyPlayers.add(login.toLowerCase());
}

export function getPlayer(name: string): PlayerRecord | undefined {
  return data.players[name.toLowerCase()];
}

export function createPlayer(name: string, display: string): PlayerRecord {
  const key = name.toLowerCase();
  const now = Date.now();
  const p: PlayerRecord = {
    name: key,
    display,
    ...freshEconomy(),
    crowns: 0,
    clockedInAt: now,
    lastSeen: now,
  };
  data.players[key] = p;
  markDirty(key);
  return p;
}

export function allPlayers(): PlayerRecord[] {
  return Object.values(data.players);
}

export function nextRaidId(): number {
  data.raidCounter += 1;
  return data.raidCounter;
}

export function recordRaid(r: RaidRecord): void {
  data.raids.push(r);
  if (data.raids.length > 100) data.raids = data.raids.slice(-100);
  pendingRaids.push(r);
}

export function recentRaids(n = 20): RaidRecord[] {
  return data.raids.slice(-n).reverse();
}
