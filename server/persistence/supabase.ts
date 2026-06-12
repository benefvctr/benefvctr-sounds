// Supabase backend. Activated when SUPABASE_URL and SUPABASE_SERVICE_KEY are
// set. Uses the service role key (server-side only — never ship it to the
// browser), so it bypasses RLS; the companion site reads through our own API,
// not directly. Records are stored as JSONB so the schema mirrors the
// in-memory shape exactly. See supabase/migrations for the table definitions.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Backend, FlushDelta } from './types.js';
import { normalizePlayer, type DataShape, type Incident, type PlayerRecord, type RaidRecord, type SeasonRecord } from '../types.js';

export class SupabaseBackend implements Backend {
  readonly label: string;
  private db: SupabaseClient;

  constructor(url: string, serviceKey: string) {
    this.label = `supabase (${new URL(url).host})`;
    this.db = createClient(url, serviceKey, { auth: { persistSession: false } });
  }

  async init(): Promise<void> {
    const { error } = await this.db.from('players').select('login').limit(1);
    if (error) {
      throw new Error(
        `[supabase] cannot reach tables (${error.message}). Run the SQL in supabase/migrations on your project first.`,
      );
    }
  }

  async loadAll(): Promise<DataShape> {
    const data: DataShape = { players: {}, raids: [], raidCounter: 0, seasons: [], season: 1, incidents: [], incidentCounter: 0 };

    const [players, raids, seasons, incidents, meta] = await Promise.all([
      this.db.from('players').select('doc'),
      this.db.from('raids').select('doc').order('id', { ascending: true }).limit(100),
      this.db.from('seasons').select('doc').order('number', { ascending: true }).limit(200),
      this.db.from('incidents').select('doc').order('id', { ascending: true }).limit(1000),
      this.db.from('meta').select('raid_counter, season, incident_counter').eq('id', 1).maybeSingle(),
    ]);

    if (players.error) throw players.error;
    for (const row of players.data ?? []) {
      const p = normalizePlayer(row.doc as PlayerRecord);
      data.players[p.name] = p;
    }
    if (raids.error) throw raids.error;
    data.raids = (raids.data ?? []).map((r) => r.doc as RaidRecord);
    if (seasons.error) throw seasons.error;
    data.seasons = (seasons.data ?? []).map((s) => s.doc as SeasonRecord);
    if (incidents.error) throw incidents.error;
    data.incidents = (incidents.data ?? []).map((i) => i.doc as Incident);
    data.raidCounter = meta.data?.raid_counter ?? 0;
    data.season = meta.data?.season ?? 1;
    data.incidentCounter = meta.data?.incident_counter ?? 0;
    return data;
  }

  async flush(d: FlushDelta): Promise<void> {
    const ops: Promise<unknown>[] = [];

    if (d.players.length) {
      ops.push(
        Promise.resolve(
          this.db.from('players').upsert(
            d.players.map((p) => ({ login: p.name, doc: p, updated_at: new Date().toISOString() })),
            { onConflict: 'login' },
          ),
        ).then(throwIfError('players upsert')),
      );
    }
    if (d.raids.length) {
      ops.push(
        Promise.resolve(this.db.from('raids').upsert(d.raids.map((r) => ({ id: r.id, doc: r })), { onConflict: 'id' })).then(
          throwIfError('raids upsert'),
        ),
      );
    }
    if (d.seasons.length) {
      ops.push(
        Promise.resolve(
          this.db.from('seasons').upsert(d.seasons.map((s) => ({ number: s.season, doc: s })), { onConflict: 'number' }),
        ).then(throwIfError('seasons upsert')),
      );
    }
    if (d.incidents.length) {
      ops.push(
        Promise.resolve(this.db.from('incidents').upsert(d.incidents.map((i) => ({ id: i.id, doc: i })), { onConflict: 'id' })).then(
          throwIfError('incidents upsert'),
        ),
      );
    }
    ops.push(
      Promise.resolve(
        this.db.from('meta').upsert({ id: 1, raid_counter: d.raidCounter, season: d.season, incident_counter: d.incidentCounter }, { onConflict: 'id' }),
      ).then(throwIfError('meta upsert')),
    );

    await Promise.all(ops);
  }
}

const throwIfError =
  (where: string) =>
  (res: unknown): void => {
    const error = (res as { error?: { message: string } } | null)?.error;
    if (error) throw new Error(`[supabase] ${where}: ${error.message}`);
  };
