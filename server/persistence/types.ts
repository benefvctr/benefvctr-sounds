// A persistence backend just needs to load everything at boot and accept
// periodic flushes of whatever changed. The store keeps the authoritative
// copy in memory; backends are write-through targets.

import type { DataShape, PlayerRecord, RaidRecord, SeasonRecord } from '../types.js';

export interface Backend {
  readonly label: string;
  init(): Promise<void>;
  loadAll(): Promise<DataShape>;
  /** Persist what changed: dirty players, new raids, new seasons, and the counters. */
  flush(
    dirtyPlayers: PlayerRecord[],
    newRaids: RaidRecord[],
    newSeasons: SeasonRecord[],
    raidCounter: number,
    season: number,
  ): Promise<void>;
}
