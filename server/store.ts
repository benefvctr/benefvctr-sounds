// Flat-file persistence for the prototype. Swap this module for Supabase
// (or any DB) later — the engine only talks to the exported functions.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'data');

export interface PlayerRecord {
  name: string; // lowercase twitch login
  display: string;
  credits: number;
  stash: Record<string, number>; // itemId -> qty
  stats: {
    shifts: number;
    extractions: number;
    deaths: number;
    lootValue: number; // lifetime extracted value
    bestHaul: number;
  };
  clockedInAt: number;
  lastSeen: number;
}

export interface RaidRecord {
  id: number;
  startedAt: number;
  rooms: string[];
  raiders: { name: string; survived: boolean; haul: number }[];
}

interface DataShape {
  players: Record<string, PlayerRecord>;
  raids: RaidRecord[];
  raidCounter: number;
}

let data: DataShape = { players: {}, raids: [], raidCounter: 0 };
let dirty = false;

const FILE = join(DATA_DIR, 'nightshift.json');

export function load(): void {
  if (existsSync(FILE)) {
    try {
      data = JSON.parse(readFileSync(FILE, 'utf8'));
    } catch {
      console.error('[store] corrupt data file, starting fresh');
    }
  }
}

export function save(): void {
  if (!dirty) return;
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(data));
  dirty = false;
}

// Autosave every 10s, plus on exit.
setInterval(save, 10_000).unref();
process.on('exit', save);

export function markDirty(): void {
  dirty = true;
}

export function getPlayer(name: string): PlayerRecord | undefined {
  return data.players[name.toLowerCase()];
}

export function createPlayer(name: string, display: string): PlayerRecord {
  const key = name.toLowerCase();
  const p: PlayerRecord = {
    name: key,
    display,
    credits: 100,
    stash: { penlight: 1 },
    stats: { shifts: 0, extractions: 0, deaths: 0, lootValue: 0, bestHaul: 0 },
    clockedInAt: Date.now(),
    lastSeen: Date.now(),
  };
  data.players[key] = p;
  dirty = true;
  return p;
}

export function allPlayers(): PlayerRecord[] {
  return Object.values(data.players);
}

export function nextRaidId(): number {
  data.raidCounter += 1;
  dirty = true;
  return data.raidCounter;
}

export function recordRaid(r: RaidRecord): void {
  data.raids.push(r);
  if (data.raids.length > 100) data.raids = data.raids.slice(-100);
  dirty = true;
}

export function recentRaids(n = 20): RaidRecord[] {
  return data.raids.slice(-n).reverse();
}
