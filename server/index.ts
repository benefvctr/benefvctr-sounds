// NIGHT SHIFT server: static hosting (overlay + companion), JSON API,
// WebSocket push to clients, chat ingestion, and the game engine.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { Engine, CONFIG } from './game/engine.js';
import { connectTwitch, startMockChat } from './twitch.js';
import * as store from './store.js';
import { COSMETIC_BY_ID, ITEM_BY_ID, RARITY_COLOR } from './game/items.js';
import { publicHideout } from './game/hideout.js';
import { WINGS, hazardTier } from './game/rooms.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = join(ROOT, 'web');
const PORT = Number(process.env.PORT) || 3000;
const CHANNEL = process.env.TWITCH_CHANNEL || '';
const DIRECTOR_KEY = process.env.DIRECTOR_KEY || '';
const BOOT_TIME = new Date().toISOString();

// Last-resort safety net: log and keep serving rather than letting any stray
// error or rejected promise terminate a live stream's game server.
process.on('uncaughtException', (err) => console.error('[fatal] uncaughtException:', err));
process.on('unhandledRejection', (err) => console.error('[fatal] unhandledRejection:', err));

await store.init();
const engine = new Engine();
engine.start();

// ---------------------------------------------------------------- chat in
// Chat is untrusted input from live viewers. A throw here must never escape to
// crash the process, so every message is handled defensively.
const onChat = (login: string, display: string, msg: string, bits = 0) => {
  try {
    engine.handleChat(login, display, msg);
    if (bits > 0) engine.cheer(display, bits); // a big enough cheer arms a season wipe
    // Leak non-command chatter to the companion site's "haunt" layer.
    // The facility is listening.
    if (!msg.startsWith('!')) broadcast({ type: 'chat', display, text: msg.slice(0, 140) });
  } catch (err) {
    console.error('[chat] handler error for', login, '-', err);
  }
};
if (CHANNEL) {
  connectTwitch(CHANNEL, onChat);
} else {
  startMockChat(
    onChat,
    () => engine.phase,
    () => {
      const s = engine.snapshot();
      if (s.vote) return [s.vote.a.word, s.vote.b.word];
      if (s.action) return [s.action.word];
      return null;
    },
  );
}

// ---------------------------------------------------------------- ws out
const wss = new WebSocketServer({ noServer: true });
const broadcast = (obj: unknown) => {
  const json = JSON.stringify(obj);
  for (const client of wss.clients) if (client.readyState === WebSocket.OPEN) client.send(json);
};
setInterval(() => broadcast({ type: 'state', state: engine.snapshot() }), 1000);
engine.onEvent = (ev) => broadcast({ type: 'event', event: ev });

// ---------------------------------------------------------------- helpers
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wav': 'audio/wav',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

function json(res: import('node:http').ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(body));
}

// HTML/JS/CSS change as the game is iterated, so never let a browser (or OBS's
// embedded Chromium) serve a stale copy. Static media can cache normally.
const NO_STORE = new Set(['.html', '.js', '.css']);

async function serveFile(res: import('node:http').ServerResponse, path: string): Promise<void> {
  try {
    const data = await readFile(path);
    const ext = extname(path);
    res.writeHead(200, {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'cache-control': NO_STORE.has(ext) ? 'no-store, must-revalidate' : 'public, max-age=3600',
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}

function publicPlayer(p: store.PlayerRecord) {
  const stash = Object.entries(p.stash).map(([id, qty]) => {
    const def = ITEM_BY_ID.get(id);
    const cos = COSMETIC_BY_ID.get(id);
    return {
      id,
      qty,
      name: def?.name ?? cos?.name ?? id,
      value: def?.value ?? cos?.value ?? 0,
      rarity: def?.rarity ?? cos?.rarity ?? 'scrap',
      light: def?.light ?? 0,
      slot: cos?.slot, // present => it's drip
      flavor: def?.flavor ?? cos?.flavor ?? '',
    };
  });
  const stashValue = stash.reduce((a, s) => a + s.value * s.qty, 0);
  return {
    name: p.name,
    display: p.display,
    credits: p.credits,
    stats: p.stats,
    crowns: p.crowns,
    carry: p.carry,
    gender: p.gender,
    cosmetics: p.cosmetics,
    stash,
    stashValue,
    netWorth: p.credits + stashValue,
    hideout: publicHideout(p),
  };
}

// ---------------------------------------------------------------- server
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const path = url.pathname;

  // --- API ---
  if (path === '/api/state') return json(res, 200, engine.snapshot());
  // Render injects RENDER_GIT_COMMIT — surfacing it makes "what's actually
  // deployed?" a one-click question instead of a guessing game.
  if (path === '/api/version')
    return json(res, 200, { commit: process.env.RENDER_GIT_COMMIT ?? 'local', startedAt: BOOT_TIME });
  if (path === '/api/config')
    return json(res, 200, { channel: CHANNEL || null, mock: !CHANNEL, costs: CONFIG.costs, rarityColors: RARITY_COLOR, wipeBits: CONFIG.wipeBits });
  if (path === '/api/leaderboard') {
    const board = store
      .allPlayers()
      .map(publicPlayer)
      .sort((a, b) => b.netWorth - a.netWorth)
      .slice(0, 50);
    return json(res, 200, board);
  }
  if (path.startsWith('/api/player/')) {
    const p = store.getPlayer(decodeURIComponent(path.slice('/api/player/'.length)));
    return p ? json(res, 200, publicPlayer(p)) : json(res, 404, { error: 'not clocked in' });
  }
  if (path === '/api/raids') return json(res, 200, store.recentRaids());
  if (path === '/api/seasons') return json(res, 200, { season: store.currentSeason(), halloffame: store.recentSeasons() });
  if (path === '/api/incidents') return json(res, 200, { total: store.incidentCount(), incidents: store.recentIncidents(40) });
  if (path === '/api/players') {
    // The employee directory: everyone, lightweight, browsable.
    const dir = store
      .allPlayers()
      .map((p) => {
        const stashValue = Object.entries(p.stash).reduce(
          (a, [id, qty]) => a + (ITEM_BY_ID.get(id)?.value ?? COSMETIC_BY_ID.get(id)?.value ?? 0) * qty,
          0,
        );
        return {
          name: p.name,
          display: p.display,
          netWorth: p.credits + stashValue,
          crowns: p.crowns,
          gender: p.gender,
          cosmetics: p.cosmetics,
          extractions: p.stats.extractions,
          deaths: p.stats.deaths,
          lastSeen: p.lastSeen,
        };
      })
      .sort((a, b) => b.netWorth - a.netWorth)
      .slice(0, 200);
    return json(res, 200, dir);
  }
  if (path === '/api/map') {
    return json(res, 200, {
      wings: WINGS.map((w) => ({
        id: w.id,
        name: w.name,
        tag: w.tag,
        danger: w.danger,
        loot: w.loot,
        tier: hazardTier(w.danger),
        entities: w.entities.map((e) => e.name),
        rooms: w.rooms.map((r) => ({ name: r.name, vote: !!r.vote })),
      })),
      tonight: engine.phase !== 'idle' && engine.wing ? engine.wing.id : null,
    });
  }
  if (path.startsWith('/api/director/') && req.method === 'POST') {
    if (DIRECTOR_KEY && url.searchParams.get('key') !== DIRECTOR_KEY) return json(res, 403, { error: 'bad key' });
    const arg = url.searchParams.has('sec') ? Number(url.searchParams.get('sec')) : undefined;
    const ok = engine.director(path.slice('/api/director/'.length), arg);
    return json(res, ok ? 200 : 409, { ok });
  }

  // --- sounds: serve the repo's .wav alert files ---
  if (path.startsWith('/sounds/')) {
    const name = normalize(path.slice('/sounds/'.length));
    if (!name.endsWith('.wav') || name.includes('..') || name.includes('/')) {
      res.writeHead(400);
      return res.end();
    }
    return serveFile(res, join(ROOT, name));
  }

  // --- pages ---
  if (path === '/' || path === '/index.html') return serveFile(res, join(WEB, 'companion.html'));
  if (path === '/overlay') return serveFile(res, join(WEB, 'overlay.html'));
  if (path === '/director') return serveFile(res, join(WEB, 'director.html'));
  if (path === '/card') return serveFile(res, join(WEB, 'card.html'));

  // --- static assets under /web ---
  const safe = normalize(path).replace(/^([/\\])+/, '');
  if (!safe.includes('..')) return serveFile(res, join(WEB, safe));
  res.writeHead(404);
  res.end('not found');
});

server.on('upgrade', (req, socket, head) => {
  if (req.url === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
      ws.send(JSON.stringify({ type: 'state', state: engine.snapshot() }));
    });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ███ NIGHT SHIFT ███');
  console.log(`  build      ${(process.env.RENDER_GIT_COMMIT ?? 'local').slice(0, 7)}`);
  console.log(`  companion  http://localhost:${PORT}/`);
  console.log(`  overlay    http://localhost:${PORT}/overlay   (OBS browser source, 1920x1080)`);
  console.log(`  director   http://localhost:${PORT}/director`);
  console.log(`  chat       ${CHANNEL ? `#${CHANNEL} (live, read-only)` : 'MOCK MODE — set TWITCH_CHANNEL=yourchannel for real chat'}`);
  console.log('');
});
