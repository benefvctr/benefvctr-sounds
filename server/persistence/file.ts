// Flat-file backend — zero setup, used by default for local dev and demos.
// Writes the whole dataset on each flush; fine for the scale a single
// channel produces.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Backend, FlushDelta } from './types.js';
import type { DataShape } from '../types.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA_DIR = join(ROOT, 'data');
const FILE = join(DATA_DIR, 'nightshift.json');

const EMPTY = (): DataShape => ({
  players: {},
  raids: [],
  raidCounter: 0,
  seasons: [],
  season: 1,
  incidents: [],
  incidentCounter: 0,
});

export class FileBackend implements Backend {
  readonly label = `file (${FILE})`;
  private data: DataShape = EMPTY();

  async init(): Promise<void> {}

  async loadAll(): Promise<DataShape> {
    if (existsSync(FILE)) {
      try {
        this.data = { ...EMPTY(), ...JSON.parse(readFileSync(FILE, 'utf8')) };
      } catch {
        console.error('[store] corrupt data file, starting fresh');
      }
    }
    // Hand the store an independent copy. Otherwise the store and this backend
    // share one object, and flush() re-applies deltas the store already made —
    // duplicating every record.
    return structuredClone(this.data);
  }

  async flush(d: FlushDelta): Promise<void> {
    for (const p of d.players) this.data.players[p.name] = p;
    for (const r of d.raids) this.data.raids.push(r);
    if (this.data.raids.length > 100) this.data.raids = this.data.raids.slice(-100);
    for (const s of d.seasons) this.data.seasons.push(s);
    for (const i of d.incidents) this.data.incidents.push(i);
    if (this.data.incidents.length > 1000) this.data.incidents = this.data.incidents.slice(-1000);
    this.data.raidCounter = d.raidCounter;
    this.data.season = d.season;
    this.data.incidentCounter = d.incidentCounter;
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(FILE, JSON.stringify(this.data));
  }
}
