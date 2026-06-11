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
import { ITEM_BY_ID, RARITY_COLOR } from './game/items.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = join(ROOT, 'web');
const PORT = Number(process.env.PORT) || 3000;
const CHANNEL = process.env.TWITCH_CHANNEL || '';
const DIRECTOR_KEY = process.env.DIRECTOR_KEY || '';

store.load();
const engine = new Engine();
engine.start();

// ---------------------------------------------------------------- chat in
const onChat = (login: string, display: string, msg: string) => {
  engine.handleChat(login, display, msg);
  // Leak non-command chatter to the companion site's "haunt" layer.
  // The facility is listening.
  if (!msg.startsWith('!')) broadcast({ type: 'chat', display, text: msg.slice(0, 140) });
};
if (CHANNEL) {
  connectTwitch(CHANNEL, onChat);
} else {
  startMockChat(
    onChat,
    () => engine.phase,
    () => {
      const s = engine.snapshot();
      return s.vote ? [s.vote.a.word, s.vote.b.word] : null;
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

async function serveFile(res: import('node:http').ServerResponse, path: string): Promise<void> {
  try {
    const data = await readFile(path);
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}

function publicPlayer(p: store.PlayerRecord) {
  const stash = Object.entries(p.stash).map(([id, qty]) => {
    const def = ITEM_BY_ID.get(id);
    return { id, qty, name: def?.name ?? id, value: def?.value ?? 0, rarity: def?.rarity ?? 'scrap', light: def?.light ?? 0, flavor: def?.flavor ?? '' };
  });
  const stashValue = stash.reduce((a, s) => a + s.value * s.qty, 0);
  return { name: p.name, display: p.display, credits: p.credits, stats: p.stats, stash, stashValue, netWorth: p.credits + stashValue };
}

// ---------------------------------------------------------------- server
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const path = url.pathname;

  // --- API ---
  if (path === '/api/state') return json(res, 200, engine.snapshot());
  if (path === '/api/config')
    return json(res, 200, { channel: CHANNEL || null, mock: !CHANNEL, costs: CONFIG.costs, rarityColors: RARITY_COLOR });
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
  if (path.startsWith('/api/director/') && req.method === 'POST') {
    if (DIRECTOR_KEY && url.searchParams.get('key') !== DIRECTOR_KEY) return json(res, 403, { error: 'bad key' });
    const ok = engine.director(path.slice('/api/director/'.length));
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
  console.log(`  companion  http://localhost:${PORT}/`);
  console.log(`  overlay    http://localhost:${PORT}/overlay   (OBS browser source, 1920x1080)`);
  console.log(`  director   http://localhost:${PORT}/director`);
  console.log(`  chat       ${CHANNEL ? `#${CHANNEL} (live, read-only)` : 'MOCK MODE — set TWITCH_CHANNEL=yourchannel for real chat'}`);
  console.log('');
});
