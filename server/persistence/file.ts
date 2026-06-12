// Flat-file backend — zero setup, used by default for local dev and demos.
// Writes the whole dataset on each flush; fine for the scale a single
// channel produces.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Backend } from './types.js';
import type { DataShape, PlayerRecord, RaidRecord, SeasonRecord } from '../types.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA_DIR = join(ROOT, 'data');
const FILE = join(DATA_DIR, 'nightshift.json');

export class FileBackend implements Backend {
  readonly label = `file (${FILE})`;
  private data: DataShape = { players: {}, raids: [], raidCounter: 0, seasons: [], season: 1 };

  async init(): Promise<void> {}

  async loadAll(): Promise<DataShape> {
    if (existsSync(FILE)) {
      try {
        this.data = JSON.parse(readFileSync(FILE, 'utf8'));
      } catch {
        console.error('[store] corrupt data file, starting fresh');
      }
    }
    // Hand the store an independent copy. Otherwise the store and this backend
    // share one object, and flush() re-applies deltas the store already made —
    // duplicating every raid and season.
    return structuredClone(this.data);
  }

  async flush(
    dirtyPlayers: PlayerRecord[],
    newRaids: RaidRecord[],
    newSeasons: SeasonRecord[],
    raidCounter: number,
    season: number,
  ): Promise<void> {
    for (const p of dirtyPlayers) this.data.players[p.name] = p;
    for (const r of newRaids) this.data.raids.push(r);
    if (this.data.raids.length > 100) this.data.raids = this.data.raids.slice(-100);
    for (const s of newSeasons) this.data.seasons.push(s);
    this.data.raidCounter = raidCounter;
    this.data.season = season;
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(FILE, JSON.stringify(this.data));
  }
}
