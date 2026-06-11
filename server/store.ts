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
  defaultHideout,
  normalizePlayer,
  type DataShape,
  type PlayerRecord,
  type RaidRecord,
} from './types.js';

export type { PlayerRecord, RaidRecord } from './types.js';

let data: DataShape = { players: {}, raids: [], raidCounter: 0 };
let backend: Backend;

// Change tracking, so a flush only ships what actually moved.
const dirtyPlayers = new Set<string>();
const pendingRaids: RaidRecord[] = [];
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
  for (const p of Object.values(data.players)) normalizePlayer(p);
  console.log(`[store] backend: ${backend.label} — ${Object.keys(data.players).length} player(s) loaded`);

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
  dirtyPlayers.clear();

  try {
    await backend.flush(players, raids, data.raidCounter);
  } catch (err) {
    // Re-queue so nothing is lost; try again next tick.
    for (const p of players) dirtyPlayers.add(p.name);
    pendingRaids.unshift(...raids);
    console.error('[store] flush failed, will retry:', (err as Error).message);
  } finally {
    flushing = false;
  }
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
    credits: 100,
    stash: { penlight: 1 },
    stats: { shifts: 0, extractions: 0, deaths: 0, lootValue: 0, bestHaul: 0 },
    hideout: defaultHideout(),
    incomeCollectedAt: now,
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
