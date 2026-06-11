// Flat-file backend — zero setup, used by default for local dev and demos.
// Writes the whole dataset on each flush; fine for the scale a single
// channel produces.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Backend } from './types.js';
import type { DataShape, PlayerRecord, RaidRecord } from '../types.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA_DIR = join(ROOT, 'data');
const FILE = join(DATA_DIR, 'nightshift.json');

export class FileBackend implements Backend {
  readonly label = `file (${FILE})`;
  private data: DataShape = { players: {}, raids: [], raidCounter: 0 };

  async init(): Promise<void> {}

  async loadAll(): Promise<DataShape> {
    if (existsSync(FILE)) {
      try {
        this.data = JSON.parse(readFileSync(FILE, 'utf8'));
      } catch {
        console.error('[store] corrupt data file, starting fresh');
      }
    }
    return this.data;
  }

  async flush(dirtyPlayers: PlayerRecord[], newRaids: RaidRecord[], raidCounter: number): Promise<void> {
    for (const p of dirtyPlayers) this.data.players[p.name] = p;
    for (const r of newRaids) this.data.raids.push(r);
    if (this.data.raids.length > 100) this.data.raids = this.data.raids.slice(-100);
    this.data.raidCounter = raidCounter;
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(FILE, JSON.stringify(this.data));
  }
}
