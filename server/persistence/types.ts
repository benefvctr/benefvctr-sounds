// A persistence backend just needs to load everything at boot and accept
// periodic flushes of whatever changed. The store keeps the authoritative
// copy in memory; backends are write-through targets.

import type { DataShape, Incident, PlayerRecord, RaidRecord, SeasonRecord } from '../types.js';

/** Everything that changed since the last flush. */
export interface FlushDelta {
  players: PlayerRecord[];
  raids: RaidRecord[];
  seasons: SeasonRecord[];
  incidents: Incident[];
  raidCounter: number;
  season: number;
  incidentCounter: number;
}

export interface Backend {
  readonly label: string;
  init(): Promise<void>;
  loadAll(): Promise<DataShape>;
  flush(delta: FlushDelta): Promise<void>;
}
