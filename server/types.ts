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
  crowns: number; // times finished #1 when a season was wiped — survives wipes
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

/** A finished season, snapshotted the instant before a wipe. The Hall of Fame. */
export interface SeasonRecord {
  season: number;
  endedAt: number;
  wipedBy?: string; // display name of the cheerer who triggered it
  bits?: number;
  totalPlayers: number;
  champions: { name: string; display: string; netWorth: number; extractions: number; deaths: number; bestHaul: number }[];
}

export interface DataShape {
  players: Record<string, PlayerRecord>;
  raids: RaidRecord[];
  raidCounter: number;
  seasons: SeasonRecord[];
  season: number; // current season number (1-based)
}

export function defaultHideout(): HideoutState {
  return { generator: 1, vault: 1, beacon: 0, infirmary: 0 };
}

/** The resettable economy fields, shared by enrollment and by a season wipe. */
export function freshEconomy() {
  return {
    credits: 100,
    stash: { penlight: 1 } as Record<string, number>,
    stats: { shifts: 0, extractions: 0, deaths: 0, lootValue: 0, bestHaul: 0 },
    hideout: defaultHideout(),
    incomeCollectedAt: Date.now(),
  };
}

/** Backfill fields on records loaded from older saves so the engine never
 *  trips over a missing property. */
export function normalizePlayer(p: PlayerRecord): PlayerRecord {
  if (!p.hideout) p.hideout = defaultHideout();
  for (const k of ['generator', 'vault', 'beacon', 'infirmary'] as const) {
    if (typeof p.hideout[k] !== 'number') p.hideout[k] = k === 'generator' || k === 'vault' ? 1 : 0;
  }
  if (typeof p.incomeCollectedAt !== 'number') p.incomeCollectedAt = Date.now();
  if (typeof p.crowns !== 'number') p.crowns = 0;
  return p;
}
