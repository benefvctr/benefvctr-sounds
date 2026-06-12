// Supabase backend. Activated when SUPABASE_URL and SUPABASE_SERVICE_KEY are
// set. Uses the service role key (server-side only — never ship it to the
// browser), so it bypasses RLS; the companion site reads through our own API,
// not directly. Records are stored as JSONB so the schema mirrors the
// in-memory shape exactly. See supabase/migrations for the table definitions.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Backend } from './types.js';
import { normalizePlayer, type DataShape, type PlayerRecord, type RaidRecord, type SeasonRecord } from '../types.js';

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
    const data: DataShape = { players: {}, raids: [], raidCounter: 0, seasons: [], season: 1 };

    const [players, raids, seasons, meta] = await Promise.all([
      this.db.from('players').select('doc'),
      this.db.from('raids').select('doc').order('id', { ascending: true }).limit(100),
      this.db.from('seasons').select('doc').order('number', { ascending: true }).limit(200),
      this.db.from('meta').select('raid_counter, season').eq('id', 1).maybeSingle(),
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
    data.raidCounter = meta.data?.raid_counter ?? 0;
    data.season = meta.data?.season ?? 1;
    return data;
  }

  async flush(
    dirtyPlayers: PlayerRecord[],
    newRaids: RaidRecord[],
    newSeasons: SeasonRecord[],
    raidCounter: number,
    season: number,
  ): Promise<void> {
    const ops: Promise<unknown>[] = [];

    if (dirtyPlayers.length) {
      ops.push(
        Promise.resolve(
          this.db.from('players').upsert(
            dirtyPlayers.map((p) => ({ login: p.name, doc: p, updated_at: new Date().toISOString() })),
            { onConflict: 'login' },
          ),
        ).then(throwIfError('players upsert')),
      );
    }
    if (newRaids.length) {
      ops.push(
        Promise.resolve(
          this.db.from('raids').upsert(
            newRaids.map((r) => ({ id: r.id, doc: r })),
            { onConflict: 'id' },
          ),
        ).then(throwIfError('raids upsert')),
      );
    }
    if (newSeasons.length) {
      ops.push(
        Promise.resolve(
          this.db.from('seasons').upsert(
            newSeasons.map((s) => ({ number: s.season, doc: s })),
            { onConflict: 'number' },
          ),
        ).then(throwIfError('seasons upsert')),
      );
    }
    ops.push(
      Promise.resolve(this.db.from('meta').upsert({ id: 1, raid_counter: raidCounter, season }, { onConflict: 'id' })).then(
        throwIfError('meta upsert'),
      ),
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
