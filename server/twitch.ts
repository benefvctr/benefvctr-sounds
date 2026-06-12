// Chat ingestion. Two modes:
//  - Real: anonymous (read-only) connection to Twitch IRC — no OAuth needed.
//  - Mock: a simulated chat of fake viewers so the game is demoable offline.

import WebSocket from 'ws';

export type ChatHandler = (login: string, display: string, message: string, bits?: number) => void;

// ---------------------------------------------------------------- real chat
export function connectTwitch(channel: string, onChat: ChatHandler): void {
  const chan = channel.toLowerCase().replace(/^#/, '');
  let ws: WebSocket;

  const connect = () => {
    ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
    ws.on('open', () => {
      // Anonymous login: justinfan + digits is Twitch's documented read-only user.
      ws.send('CAP REQ :twitch.tv/tags');
      ws.send(`NICK justinfan${Math.floor(Math.random() * 80000) + 1000}`);
      ws.send(`JOIN #${chan}`);
      console.log(`[twitch] joined #${chan} (read-only)`);
    });
    ws.on('message', (buf) => {
      for (const line of buf.toString().split('\r\n')) {
        if (!line) continue;
        if (line.startsWith('PING')) {
          ws.send('PONG :tmi.twitch.tv');
          continue;
        }
        const msg = parsePrivmsg(line);
        if (msg) onChat(msg.login, msg.display, msg.text, msg.bits);
      }
    });
    ws.on('close', () => {
      console.log('[twitch] disconnected, reconnecting in 5s');
      setTimeout(connect, 5000);
    });
    ws.on('error', (err) => console.error('[twitch] error:', err.message));
  };
  connect();
}

function parsePrivmsg(line: string): { login: string; display: string; text: string; bits: number } | null {
  // [@tags ]:login!login@login.tmi.twitch.tv PRIVMSG #chan :text
  let tags = '';
  let rest = line;
  if (rest.startsWith('@')) {
    const sp = rest.indexOf(' ');
    tags = rest.slice(1, sp);
    rest = rest.slice(sp + 1);
  }
  const m = rest.match(/^:(\w+)!\S+ PRIVMSG #\S+ :(.*)$/);
  if (!m) return null;
  const login = m[1].toLowerCase();
  let display = login;
  let bits = 0;
  for (const t of tags.split(';')) {
    if (t.startsWith('display-name=') && t.length > 13) display = t.slice(13);
    else if (t.startsWith('bits=')) bits = Number(t.slice(5)) || 0; // present on cheer messages
  }
  return { login, display, text: m[2], bits };
}

// ---------------------------------------------------------------- mock chat
const MOCK_USERS = [
  'gh0stlight', 'moss_collector', 'nullpointer_', 'cryo_stim', 'dustbunny42',
  'late_fee', 'patch_notes', 'corridor_carl', 'femur_breaker', 'wifi_password',
  'the_intern', 'soggy_receipt', 'vending_machine_fan', 'overtime_olga',
];

const MOCK_AMBIENT = [
  'anyone else hear that',
  'the vending machine just blinked at me',
  'no shot',
  'clip it',
  'do NOT open the crate',
  'i swear the portrait moved',
  'W shift',
  'rip',
  'why is my penlight warm',
  'whats on sublevel 4?',
  'lmaooo',
  'extract extract extract',
];

export function startMockChat(onChat: ChatHandler, getPhase: () => string, getVoteWords: () => string[] | null): void {
  console.log('[mock] simulated chat running — set TWITCH_CHANNEL to use real chat');
  const enrolled = new Set<string>();

  setInterval(() => {
    const user = MOCK_USERS[Math.floor(Math.random() * MOCK_USERS.length)];
    const phase = getPhase();

    if (!enrolled.has(user)) {
      enrolled.add(user);
      onChat(user, user, '!clockin', 0);
      return;
    }
    // Idle viewers tend their hideout between shifts.
    if ((phase === 'idle' || phase === 'results') && Math.random() < 0.25) {
      const modules = ['generator', 'vault', 'beacon', 'infirmary'];
      onChat(user, user, Math.random() < 0.5 ? '!collect' : `!upgrade ${modules[Math.floor(Math.random() * modules.length)]}`);
      return;
    }
    if (phase === 'lobby' && Math.random() < 0.75) {
      onChat(user, user, '!deploy');
      return;
    }
    const words = getVoteWords();
    if (words && words.length > 0 && Math.random() < 0.8) {
      onChat(user, user, words[Math.floor(Math.random() * words.length)]);
      return;
    }
    if (phase === 'room') {
      const r = Math.random();
      if (r < 0.12) onChat(user, user, '!bomb');
      else if (r < 0.3) onChat(user, user, '!heal');
      else if (r < 0.45) onChat(user, user, '!shield');
      else if (r < 0.75) onChat(user, user, MOCK_AMBIENT[Math.floor(Math.random() * MOCK_AMBIENT.length)]);
      return;
    }
    if (Math.random() < 0.3) onChat(user, user, MOCK_AMBIENT[Math.floor(Math.random() * MOCK_AMBIENT.length)]);
  }, 1200);
}
