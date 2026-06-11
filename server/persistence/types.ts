// A persistence backend just needs to load everything at boot and accept
// periodic flushes of whatever changed. The store keeps the authoritative
// copy in memory; backends are write-through targets.

import type { DataShape, PlayerRecord, RaidRecord } from '../types.js';

export interface Backend {
  readonly label: string;
  init(): Promise<void>;
  loadAll(): Promise<DataShape>;
  /** Persist the players that changed, any new raids, and the raid counter. */
  flush(dirtyPlayers: PlayerRecord[], newRaids: RaidRecord[], raidCounter: number): Promise<void>;
}
