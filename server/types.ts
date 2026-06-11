// Shared persistent data shapes. Kept backend-agnostic so the file store and
// the Supabase store serialize the exact same records.

export type HideoutModule = 'generator' | 'vault' | 'beacon' | 'infirmary';

export interface HideoutState {
  generator: number; // passive credit rate
  vault: number; // offline income cap
  beacon: number; // loot luck on deploy
  infirmary: number; // chance to deploy with a free shield
}

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
  hideout: HideoutState;
  incomeCollectedAt: number; // last time passive income was banked
  clockedInAt: number;
  lastSeen: number;
}

export interface RaidRecord {
  id: number;
  startedAt: number;
  wing?: string; // tonight's assigned wing (absent on records from older builds)
  rooms: string[];
  raiders: { name: string; survived: boolean; haul: number }[];
}

export interface DataShape {
  players: Record<string, PlayerRecord>;
  raids: RaidRecord[];
  raidCounter: number;
}

export function defaultHideout(): HideoutState {
  return { generator: 1, vault: 1, beacon: 0, infirmary: 0 };
}

/** Backfill fields on records loaded from older saves so the engine never
 *  trips over a missing property. */
export function normalizePlayer(p: PlayerRecord): PlayerRecord {
  if (!p.hideout) p.hideout = defaultHideout();
  for (const k of ['generator', 'vault', 'beacon', 'infirmary'] as const) {
    if (typeof p.hideout[k] !== 'number') p.hideout[k] = k === 'generator' || k === 'vault' ? 1 : 0;
  }
  if (typeof p.incomeCollectedAt !== 'number') p.incomeCollectedAt = Date.now();
  return p;
}
