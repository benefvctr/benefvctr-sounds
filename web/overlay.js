// NIGHT SHIFT overlay client. Connects to the game server over WebSocket,
// renders the HUD, and plays the channel's alert sounds on game events.

const $ = (id) => document.getElementById(id);

const SOUNDS = {
  health: new Audio('/sounds/Health.wav'),
  shield: new Audio('/sounds/Shield_Charge.wav'),
  bomb: new Audio('/sounds/bomb_dropped.wav'),
};
// Alert volume — half by default so the sounds sit under the stream.
for (const a of Object.values(SOUNDS)) a.volume = 0.5;

function connect() {
  // Match the page's protocol: wss:// on HTTPS (Render), ws:// on local http.
  // A hardcoded ws:// is blocked as mixed content on an HTTPS page.
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'state') render(msg.state);
    if (msg.type === 'event') handleEvent(msg.event);
  };
  ws.onclose = () => setTimeout(connect, 2000);
}
connect();

// Center-screen stingers play one at a time so simultaneous events
// (e.g. two deaths in the same room) don't clobber each other.
const announceQueue = [];
let announcing = false;

function showAnnounce(a) {
  announceQueue.push(a);
  if (announceQueue.length > 4) announceQueue.shift(); // don't backlog forever
  if (!announcing) nextAnnounce();
}

function nextAnnounce() {
  const a = announceQueue.shift();
  if (!a) {
    announcing = false;
    return;
  }
  announcing = true;
  const el = $('announce');
  el.querySelector('.big').textContent = a.text;
  el.querySelector('.sub').textContent = a.sub || '';
  el.className = a.tone || 'spooky';
  void el.offsetWidth; // restart the CSS animation
  el.classList.add('show');
  setTimeout(nextAnnounce, 2700);
}

function handleEvent(ev) {
  if (ev.type === 'announce' && ev.announce) showAnnounce(ev.announce);
  if (ev.type === 'loot' && ev.loot) lootPop(ev.loot);
  if (ev.type === 'sound' && SOUNDS[ev.sound]) {
    SOUNDS[ev.sound].currentTime = 0;
    SOUNDS[ev.sound].play().catch(() => {}); // OBS allows autoplay; browsers may not until a click
  }
  if (ev.type === 'pulse') {
    const p = $('pulse');
    p.className = ev.pulse + ' on';
    setTimeout(() => (p.className = ev.pulse), 120);
  }
}

function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// A found artifact bursts up from the loot layer as its sigil.
function lootPop(l) {
  const layer = $('lootlayer');
  if (layer.children.length > 6) return;
  const el = document.createElement('div');
  el.className = 'lootpop' + (l.bounty ? ' bounty' : '');
  el.style.left = `${12 + Math.random() * 70}%`;
  const color = window.NS_rarityColor(l.rarity);
  el.innerHTML =
    window.NS_sprite(l.itemId, l.rarity, 46, true) +
    `<div class="ltext">${l.bounty ? '★ ' : ''}${escapeHtml(l.name)}</div>` +
    `<div class="lval" style="color:${color}">+${l.value}cr</div>`;
  layer.appendChild(el);
  setTimeout(() => el.remove(), 2700);
}

function renderMinimap(s) {
  const map = $('minimap');
  if (!s.overlayMap || !s.route || !s.route.length) {
    map.className = 'hidden';
    map.innerHTML = '';
    return;
  }
  map.className = '';
  const anyDead = s.raiders.some((r) => !r.alive);
  const nodes = [];
  for (let i = 0; i < s.route.length; i++) {
    let cls = 'mnode';
    if (s.phase === 'room' && i === s.roomIndex) cls += ' now';
    else if (s.phase === 'extraction' || s.phase === 'results' || i < s.roomIndex) cls += ' done';
    else if (s.phase === 'room' && i < s.roomIndex) cls += ' done';
    if (cls.includes('done') && anyDead && i <= s.roomIndex) cls += ' dead';
    nodes.push(`<div class="${cls}" title="${escapeHtml(s.route[i])}">${i + 1}</div>`);
  }
  let extCls = 'mnode ext';
  if (s.phase === 'extraction') extCls += ' now';
  else if (s.phase === 'results') extCls += ' done';
  nodes.push(`<div class="${extCls}" title="Extraction">⤒</div>`);
  map.innerHTML = nodes.join('<div class="mlink"></div>');
}

function render(s) {
  const idle = s.phase === 'idle';
  $('idle').classList.toggle('show', idle);
  $('hud').classList.toggle('show', !idle);

  if (idle) {
    $('countdown').textContent = fmt(s.secondsLeft);
    $('vote').classList.remove('show');
    return;
  }

  // status block
  $('shiftno').textContent = `SHIFT #${s.raidId}`;
  const wing = s.wing ? s.wing.name.toUpperCase() : '';
  if (s.phase === 'lobby') {
    $('roomname').textContent = wing ? `${wing} — !deploy TO ENTER` : 'DOORS OPEN — !deploy TO ENTER';
  } else if (s.phase === 'room' && s.room) {
    $('roomname').textContent = `${wing ? wing + ' · ' : ''}ROOM ${s.roomIndex + 1}/${s.roomCount} — ${s.room.name}`;
  } else if (s.phase === 'extraction') {
    $('roomname').textContent = 'EXTRACTION OPEN — RUN';
  } else if (s.phase === 'results') {
    $('roomname').textContent = 'SHIFT REPORT FILED';
  }
  $('timer').textContent = String(s.secondsLeft);
  $('timer').classList.toggle('low', s.secondsLeft <= 5 && s.phase !== 'results');

  // crude progress bar: refill each phase
  const total = { lobby: 45, room: 24, extraction: 12, results: 18 }[s.phase] ?? 30;
  $('roombar').style.width = `${Math.min(100, (s.secondsLeft / total) * 100)}%`;

  // room mini-map (director can hide it)
  renderMinimap(s);

  // bounty
  const bountyEl = $('bounty');
  bountyEl.classList.toggle('show', !!s.bounty);
  if (s.bounty) {
    bountyEl.classList.toggle('claimed', !!s.bounty.claimedBy);
    $('bname').textContent = s.bounty.name;
    $('brew').textContent = s.bounty.claimedBy ? `— claimed by ${s.bounty.claimedBy}` : `+${s.bounty.reward}cr`;
  }

  // feed
  const feed = $('feed');
  feed.innerHTML = s.feed
    .slice(-8)
    .map((f) => `<div class="line ${f.kind}">${escapeHtml(f.text)}</div>`)
    .join('');

  // squad
  const alive = s.raiders.filter((r) => r.alive).length;
  $('squadhead').textContent = `ON SHIFT — ${alive}/${s.raiders.length} ALIVE`;
  $('chips').innerHTML = s.raiders
    .map((r) => {
      const cls = ['chip', !r.alive && 'dead', r.alive && r.wounded && 'wounded', r.alive && r.shield && 'shield'].filter(Boolean).join(' ');
      const haul = r.alive && r.haul > 0 ? `<span class="haul">${r.haul}</span>` : '';
      const ava = r.look ? window.NS_avatar(r.name, r.look.gender, r.look, 14) : '';
      return `<span class="${cls}">${ava}${escapeHtml(r.display)}${haul}</span>`;
    })
    .join('');

  // season wipe countdown — overrides nothing, sits up top
  const w = s.wipe;
  $('wipebar').classList.toggle('show', !!w);
  if (w) {
    $('wsub').textContent = `${w.by}${w.bits ? ` · ${w.bits} BITS` : ''}`;
    $('wclock').textContent = `0:${String(w.secondsLeft).padStart(2, '0')}`;
  }

  // action callout (non-vote rooms)
  const a = s.action;
  $('action').classList.toggle('show', !!a && s.phase === 'room');
  if (a) {
    $('action').classList.toggle('brace', a.type === 'brace');
    $('aword').textContent = `TYPE ${a.word}`;
    $('aprompt').textContent = a.prompt;
    $('ameta').textContent =
      a.type === 'search'
        ? 'RAIDERS: NEAR-SURE FIND, EXTRA RISK · SPECTATORS: FINDER’S FEE'
        : 'RAIDERS ONLY: HALF RISK, NO LOOT THIS ROOM';
    $('acount').textContent = a.type === 'search' ? `${a.actors + a.lurkers}↯` : `${a.actors}⛨`;
  }

  // vote
  const v = s.vote;
  $('vote').classList.toggle('show', !!v && s.phase === 'room');
  if (v) {
    $('vprompt').textContent = v.prompt;
    $('vaword').textContent = v.a.word;
    $('vbword').textContent = v.b.word;
    $('valabel').textContent = v.a.label;
    $('vblabel').textContent = v.b.label;
    $('vacount').textContent = v.a.count;
    $('vbcount').textContent = v.b.count;
    const total = v.a.count + v.b.count;
    $('vabar').style.width = total ? `${(v.a.count / total) * 100}%` : '0%';
    $('vbbar').style.width = total ? `${(v.b.count / total) * 100}%` : '0%';
    $('vtimer').textContent = `VOTE CLOSES IN ${v.secondsLeft}`;
  }
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
