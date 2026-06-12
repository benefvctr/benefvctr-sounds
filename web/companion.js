// Companion site client: live shift status via WebSocket, leaderboard /
// player lookup / raid archive via the JSON API.

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let rarityColors = {};

async function init() {
  const cfg = await fetch('/api/config').then((r) => r.json());
  rarityColors = cfg.rarityColors ?? {};
  $('costheal').textContent = `Patch up a wounded raider. (${cfg.costs.heal}cr)`;
  $('costshield').textContent = `Block the next hit on a raider. (${cfg.costs.shield}cr)`;
  $('costbomb').textContent = `Sabotage the shift: more danger, more loot. (${cfg.costs.bomb}cr)`;
  if (cfg.mock) $('livetext').textContent = 'MOCK CHAT';
  connect();
  renderMap();
  refreshBoards();
  setInterval(refreshBoards, 8000);
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'state') renderLive(msg.state);
    if (msg.type === 'chat') haunt(msg.display, msg.text);
  };
  ws.onclose = () => setTimeout(connect, 3000);
}

function renderLive(s) {
  const live = s.phase !== 'idle';
  $('live').classList.toggle('on', live);
  $('live').classList.toggle('wiping', !!s.wipe);
  if (s.season) $('seasonline').textContent = `Season ${s.season}`;
  if (s.wipe) $('livetext').textContent = `⚠ SEASON WIPE IN ${fmt(s.wipe.secondsLeft)}`;
  else if (live) $('livetext').textContent = `SHIFT #${s.raidId} · ${s.phase.toUpperCase()}`;
  else $('livetext').textContent = `NEXT SHIFT ${fmt(s.secondsLeft)}`;

  const alive = s.raiders.filter((r) => r.alive).length;
  const haul = s.raiders.reduce((a, r) => a + (r.alive ? r.haul : 0), 0);
  $('shiftstats').innerHTML = [
    stat(s.phase.toUpperCase(), 'phase'),
    s.wing ? stat(s.wing.name, `tonight · hazard ${s.wing.tier}`) : '',
    stat(fmt(s.secondsLeft), live ? 'time left' : 'until doors'),
    stat(`${alive}/${s.raiders.length}`, 'alive'),
    stat(`${haul}cr`, 'haul at stake'),
    s.bounty ? stat(s.bounty.claimedBy ? 'CLAIMED' : `+${s.bounty.reward}cr`, `★ bounty: ${s.bounty.name}`) : '',
    s.vote ? stat(`${s.vote.a.word} ${s.vote.a.count}–${s.vote.b.count} ${s.vote.b.word}`, 'live vote') : '',
    s.action ? stat(`${s.action.word} ×${s.action.actors + s.action.lurkers}`, 'live action — type it!') : '',
  ].join('');
  // keep the schematic in sync: re-render when the wing or the squad's room moves
  const posKey = `${s.wing?.id}|${s.phase}|${s.roomIndex}`;
  liveState = s;
  if (s.wing?.id !== lastTonight || posKey !== lastPosKey) {
    lastTonight = s.wing?.id ?? null;
    lastPosKey = posKey;
    renderMap();
  }

  $('feedbox').innerHTML = s.feed.map((f) => `<div class="${f.kind}">${esc(f.text)}</div>`).join('');
}

const stat = (v, l) => `<div class="stat"><b>${esc(v)}</b><span>${esc(l)}</span></div>`;
const fmt = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

// ---------------------------------------------------------------- facility schematic
let mapData = null;
let lastTonight = null;
let lastPosKey = null;
let liveState = null; // latest snapshot, for live position on the map

const TIER_COLOR = { LOW: '#7fd47f', STANDARD: '#d8d3c8', ELEVATED: '#ffb454', SEVERE: '#ff8a4f', CATASTROPHIC: '#ff4f4f' };

// A vertical cross-section of the facility: six wings stacked surface→deep,
// an elevator shaft down the left, the tonight sector pulsing, and a live
// marker tracking the squad's room.
async function renderMap() {
  if (!mapData) {
    try {
      mapData = await fetch('/api/map').then((r) => r.json());
    } catch {
      return;
    }
  }
  const tonight = lastTonight;
  const s = liveState;
  const W = 900, bandH = 96, padTop = 14, shaftX = 64;
  const H = padTop * 2 + mapData.wings.length * bandH;

  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Facility schematic">`;
  // depth gradient
  svg += `<defs><linearGradient id="depth" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#0c0e12"/><stop offset="100%" stop-color="#1a0608"/></linearGradient></defs>`;
  svg += `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#depth)"/>`;
  // elevator shaft
  svg += `<line x1="${shaftX}" y1="${padTop}" x2="${shaftX}" y2="${H - padTop}" stroke="rgba(255,180,84,0.25)" stroke-width="2"/>`;

  mapData.wings.forEach((w, i) => {
    const y = padTop + i * bandH;
    const cy = y + bandH / 2;
    const tcolor = TIER_COLOR[w.tier] ?? '#fff';
    const isTonight = w.id === tonight;

    // elevator stop
    svg += `<circle cx="${shaftX}" cy="${cy}" r="4" fill="${isTonight ? '#ffb454' : 'rgba(255,180,84,0.4)'}"/>`;
    // band
    svg += `<rect class="wing-band" x="${shaftX + 26}" y="${y + 8}" width="${W - shaftX - 40}" height="${bandH - 16}" rx="5"
      fill="rgba(0,0,0,0.32)" stroke="${tcolor}" stroke-opacity="${isTonight ? 0.9 : 0.3}" stroke-width="${isTonight ? 2 : 1}"/>`;
    if (isTonight) {
      svg += `<rect class="tonight-glow" x="${shaftX + 26}" y="${y + 8}" width="${W - shaftX - 40}" height="${bandH - 16}" rx="5"
        fill="none" stroke="#ffb454" stroke-width="3"/>`;
    }
    // labels
    svg += `<text class="wing-label" x="${shaftX + 42}" y="${y + 30}">${esc(w.name)}</text>`;
    svg += `<text class="wing-tier" x="${shaftX + 42}" y="${y + 47}" fill="${tcolor}">HAZARD ${esc(w.tier)} · YIELD ×${w.loot.toFixed(2)}</text>`;
    if (isTonight) svg += `<text class="wing-tier" x="${shaftX + 42}" y="${y + 64}" fill="#ffb454" font-weight="bold">◀ TONIGHT'S ASSIGNMENT</text>`;
    else svg += `<text class="wing-tier" x="${shaftX + 42}" y="${y + 64}" fill="rgba(216,211,200,0.4)">${esc(w.entities.join(' · '))}</text>`;

    // room nodes along the right
    const nodeY = y + bandH / 2;
    const x0 = shaftX + 360, x1 = W - 60;
    const gap = w.rooms.length > 1 ? (x1 - x0) / (w.rooms.length - 1) : 0;
    w.rooms.forEach((r, ri) => {
      const rx = w.rooms.length > 1 ? x0 + ri * gap : (x0 + x1) / 2;
      const stroke = r.vote ? '#5fb7ff' : tcolor;
      // is the live squad here?
      const here = isTonight && s && s.phase === 'room' && s.route && s.route[s.roomIndex] === r.name;
      svg += `<circle class="room-node" cx="${rx}" cy="${nodeY}" r="7" fill="rgba(0,0,0,0.5)" stroke="${stroke}" stroke-width="1.5" opacity="${isTonight ? 1 : 0.5}">
        <title>${esc(r.name)}${r.vote ? ' (vote)' : ''}</title></circle>`;
      if (here) svg += `<circle class="squad-marker" cx="${rx}" cy="${nodeY}" r="11" fill="none" stroke="#fff" stroke-width="2"/>`;
    });
  });
  svg += `</svg>`;
  $('map').innerHTML = svg;
}

// ---------------------------------------------------------------- hall of fame
function renderHallOfFame(data) {
  const fame = data?.halloffame ?? [];
  $('hofsection').style.display = fame.length ? '' : 'none';
  if (!fame.length) return;
  $('hof').innerHTML = fame
    .map((s) => {
      const champs = s.champions
        .map(
          (c, i) =>
            `<div class="champ ${i === 0 ? 'first' : ''}">${i === 0 ? '<span class="crown">♛</span> ' : `${i + 1}. `}${esc(c.display)} — ${c.netWorth}cr <span class="muted">(${c.extractions} ext · ${c.deaths} deaths)</span></div>`,
        )
        .join('');
      const date = new Date(s.endedAt).toLocaleDateString();
      return `<div class="hof">
        <div><div class="snum">S${s.season}</div><div class="smeta">${date}<br>${s.totalPlayers} employees${s.wipedBy ? `<br>wiped by ${esc(s.wipedBy)}${s.bits ? ` (${s.bits} bits)` : ''}` : ''}</div></div>
        <div class="champs">${champs || '<span class="muted">no survivors of note</span>'}</div>
      </div>`;
    })
    .join('');
}

// ---------------------------------------------------------------- directory
let directory = [];

async function refreshDirectory() {
  try {
    directory = await fetch('/api/players').then((r) => r.json());
  } catch {
    return;
  }
  renderDirectory();
}

function renderDirectory() {
  const q = $('dirsearch').value.trim().toLowerCase();
  const list = q ? directory.filter((p) => p.name.includes(q) || p.display.toLowerCase().includes(q)) : directory;
  $('directory').innerHTML =
    list
      .slice(0, 60)
      .map(
        (p) => `<div class="badge-card" data-name="${esc(p.name)}">
          ${window.NS_avatar(p.name, p.gender, p.cosmetics, 30)}
          <div><div class="bn">${esc(p.display)}${p.crowns ? ` <span class="bc">${'♛'.repeat(Math.min(p.crowns, 3))}</span>` : ''}</div>
          <div class="bw">${p.netWorth}cr · ${p.extractions} ext</div></div>
        </div>`,
      )
      .join('') || '<p class="muted">No employees match.</p>';
}

$('dirsearch').addEventListener('input', renderDirectory);
$('directory').addEventListener('click', (e) => {
  const card = e.target.closest('.badge-card');
  if (!card) return;
  $('lookup').value = card.dataset.name;
  lookupPlayer();
  $('lookup').closest('section').scrollIntoView({ behavior: 'smooth' });
});

// ---------------------------------------------------------------- incident log
function renderIncidents(data) {
  const list = data?.incidents ?? [];
  $('incidentcount').textContent = data?.total ? `(${data.total} logged, all-time)` : '';
  $('incidents').innerHTML =
    list
      .map(
        (i) => `<div class="incident">
          <div class="who">✖ ${esc(i.display)}</div>
          <div class="line">${esc(i.line)}${i.by ? ` — ${esc(i.by)}` : ''}</div>
          <div class="where">${esc([i.wing, i.room].filter(Boolean).join(' · '))} · S${i.season}</div>
        </div>`,
      )
      .join('') || '<p class="muted">No incidents on record. The night is young.</p>';
}

// ---------------------------------------------------------------- copy to chat
function copyBtn(text) {
  return `<button class="copy" data-copy="${esc(text)}">⧉ copy</button>`;
}

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.copy');
  if (!btn) return;
  try {
    await navigator.clipboard.writeText(btn.dataset.copy);
    const prev = btn.textContent;
    btn.textContent = '✓ copied';
    btn.classList.add('ok');
    setTimeout(() => {
      btn.textContent = prev;
      btn.classList.remove('ok');
    }, 1500);
  } catch {}
});

async function refreshBoards() {
  const [board, raids, seasons, incidents] = await Promise.all([
    fetch('/api/leaderboard').then((r) => r.json()),
    fetch('/api/raids').then((r) => r.json()),
    fetch('/api/seasons').then((r) => r.json()),
    fetch('/api/incidents').then((r) => r.json()),
  ]);
  renderHallOfFame(seasons);
  renderIncidents(incidents);
  refreshDirectory();
  $('board').querySelector('tbody').innerHTML = board
    .map(
      (p, i) => `<tr>
        <td class="rank">${i + 1}</td><td>${esc(p.display)}${p.crowns ? ` <span class="crown">${'♛'.repeat(Math.min(p.crowns, 5))}</span>` : ''}</td>
        <td class="num cr">${p.credits}</td><td class="num">${p.stashValue}</td>
        <td class="num cr">${p.netWorth}</td>
        <td class="num">${p.stats.shifts}</td><td class="num">${p.stats.extractions}</td>
        <td class="num dead">${p.stats.deaths}</td><td class="num">${p.stats.bestHaul}</td>
        <td class="num crown">${p.crowns || ''}</td>
      </tr>`,
    )
    .join('');

  // Keep an open employee file fresh as chat changes it.
  if (currentPlayer) {
    const res = await fetch(`/api/player/${encodeURIComponent(currentPlayer.name)}`);
    if (res.ok) {
      currentPlayer = await res.json();
      renderPlayer();
    }
  }

  $('raids').querySelector('tbody').innerHTML = raids
    .map((r) => {
      const survived = r.raiders.filter((x) => x.survived).length;
      return `<tr>
        <td>#${r.id}</td><td class="muted">${r.wing ? `<span style="color:var(--amber)">${esc(r.wing)}</span> — ` : ''}${esc(r.rooms.join(' → '))}</td>
        <td>${r.raiders.map((x) => `<span class="${x.survived ? '' : 'dead'}">${esc(x.name)}</span>`).join(', ')}</td>
        <td class="num">${survived}/${r.raiders.length}</td>
      </tr>`;
    })
    .join('');
}

let lookupTimer;
$('lookup').addEventListener('input', () => {
  clearTimeout(lookupTimer);
  lookupTimer = setTimeout(lookupPlayer, 350);
});

async function lookupPlayer() {
  const name = $('lookup').value.trim().toLowerCase();
  const box = $('playerbox');
  if (!name) return (box.innerHTML = '');
  const res = await fetch(`/api/player/${encodeURIComponent(name)}`);
  if (!res.ok) {
    box.innerHTML = `<p class="muted">No employee file. Type <b style="color:var(--amber)">!clockin</b> in chat to enroll.</p>`;
    return;
  }
  currentPlayer = await res.json();
  try {
    localStorage.setItem('ns_employee', name); // remembered next visit
  } catch {}
  renderPlayer();
}

// Remember who you are between visits — no login needed.
try {
  const saved = localStorage.getItem('ns_employee');
  if (saved) {
    $('lookup').value = saved;
    setTimeout(lookupPlayer, 400);
  }
} catch {}

let currentPlayer = null;

function renderPlayer() {
  const p = currentPlayer;
  if (!p) return;
  const box = $('playerbox');
  const h = p.hideout;
  const carryLabel =
    p.carry === 'auto' ? 'auto (best light)' : p.carry === 'none' ? 'nothing' : (p.stash.find((s) => s.id === p.carry)?.name ?? p.carry);
  box.innerHTML = `
    <div class="filehead">
      <div class="portrait">${window.NS_avatar(p.name, p.gender, p.cosmetics, 84)}</div>
      <div>
        <div class="stats">
          ${stat(p.credits + 'cr', 'credits')}
          ${stat(p.netWorth + 'cr', 'net worth')}
          ${stat(p.stats.extractions + '/' + p.stats.shifts, 'extract rate')}
          ${stat(p.stats.bestHaul + 'cr', 'best haul')}
        </div>
        <div class="muted" style="margin-top:8px">carrying next deploy: <b style="color:var(--amber)">${esc(carryLabel)}</b>
          ${copyBtn('!carry auto')} <span class="muted">style: !style m / !style f</span></div>
        <a class="cardlink" href="/card?u=${encodeURIComponent(p.name)}" target="_blank">⛨ View Employee Card</a>
      </div>
    </div>

    <div class="hideout">
      <div class="hideout-head">
        <div><b>The Hideout</b> <span class="muted">${h.ratePerHour}cr/hr · banks up to ${h.cap}cr</span></div>
        <div class="pending" id="pending">+${h.pending}cr</div>
      </div>
      <div class="pbar"><i style="width:${Math.min(100, (h.pending / h.cap) * 100)}%"></i></div>
      <div class="muted" style="margin:6px 0 12px">Type <b style="color:var(--amber)">!collect</b> in chat to bank it. ${copyBtn('!collect')} ${h.pending >= h.cap ? '<b style="color:var(--red)">VAULT FULL — overflow is wasted.</b>' : ''}</div>
      <div class="modgrid">
        ${h.modules
          .map(
            (m) => `<div class="mod">
              <div class="modname">${esc(m.name)} <span class="lvl">L${m.level}${m.level >= m.max ? ' MAX' : ''}</span></div>
              <div class="flavor">${esc(m.blurb)}</div>
              <div class="modcost">${m.nextCost === null ? 'maxed' : `!upgrade ${m.id} <span class="muted">(${m.nextCost}cr)</span> ${copyBtn(`!upgrade ${m.id}`)}`}</div>
            </div>`,
          )
          .join('')}
      </div>
    </div>

    <table style="margin-top:18px"><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Value</th></tr></thead><tbody>
      ${p.stash
        .map((s) => {
          const isDrip = !!s.slot;
          const worn = isDrip && (p.cosmetics.hat === s.id || p.cosmetics.face === s.id);
          const act = isDrip
            ? `${worn ? '<span style="color:var(--green);font-size:11px">✦ worn</span> ' : ''}${copyBtn(`!wear ${s.id}`)}`
            : copyBtn(`!carry ${s.id}`);
          return `<tr>
            <td><div class="stash-item">${window.NS_sprite(s.id, s.rarity, 40)}<div><span style="color:${rarityColors[s.rarity] ?? '#fff'}">${esc(s.name)}</span>${s.light ? ' 🔦' : ''}${isDrip ? ` <span class="muted">✦ drip · ${s.slot}</span>` : ''}<br><span class="flavor">${esc(s.flavor)}</span></div></div></td>
            <td class="num">${s.qty}</td><td class="num">${s.value}<br>${act}</td>
          </tr>`;
        })
        .join('') || '<tr><td colspan="3" class="muted">Stash is empty. Deploy and extract.</td></tr>'}
    </tbody></table>`;
}

// Tick the pending-income number upward live, so the hideout feels alive even
// though the value is really computed server-side.
setInterval(() => {
  const p = currentPlayer;
  const el = $('pending');
  if (!p || !el) return;
  const h = p.hideout;
  const elapsedHr = (Date.now() - h.collectedAt) / 3_600_000;
  const live = Math.min(h.cap, Math.floor(h.ratePerHour * elapsedHr));
  el.textContent = `+${live}cr`;
  el.classList.toggle('full', live >= h.cap);
}, 1000);

// ---------------------------------------------------------------- the haunt
// Real chat messages bleed through the page as they happen. Sometimes a word
// goes missing. Sometimes the facility answers.
const FACILITY_REPLIES = [
  'WE HEAR YOU', 'NOTED', 'FILED', 'THE WALLS REMEMBER THAT', 'SAY IT AGAIN. SLOWER.',
  'THANK YOU FOR YOUR FEEDBACK', 'WHO TOLD YOU THAT', 'YES', 'DO NOT LOOK UP',
  'THAT INFORMATION IS RESTRICTED', 'YOU ARE DOING GREAT', 'WE SEE THE CURSOR',
  'STScopHIPLEASE REMAIN SEATED', 'IT IS ALREADY INSIDE', 'WELCOME BACK',
  'HE IS STILL ON THE NIGHT SHIFT', 'CHECK BEHIND YOU', 'NObody LEAVES PAYROLL',
];

// Spontaneous facility interjections — fire on their own, not tied to chat.
const FACILITY_WHISPERS = [
  'the night shift never ends',
  'employee retention is at 100%',
  'do not acknowledge the thirteenth floor',
  'your badge has been reassigned',
  'someone is reading this with you',
  'the vending machine knows your name',
  'overtime is mandatory and eternal',
  'we found your stash. we kept it warm.',
  'the portrait blinked again',
  'all exits lead to sublevel 3',
];

const GLYPHS = '⌀⏃⏚⎔⏥⊠⟁⍜⌬⏧✲⟒☖⏁⌖⍉⋔☍⏛⟆';

function haunt(who, text) {
  const layer = $('ghosts');
  if (!layer || layer.children.length > 7) return; // don't flood the page

  // ~12% of messages lose a word to the facility
  let shown = text;
  if (Math.random() < 0.12) {
    const words = shown.split(' ');
    if (words.length > 2) {
      const i = Math.floor(Math.random() * words.length);
      words[i] = '█'.repeat(Math.max(3, words[i].length));
      shown = words.join(' ');
    }
  }

  const el = document.createElement('div');
  el.className = 'ghost';
  const whoEl = document.createElement('span');
  whoEl.className = 'who';
  whoEl.textContent = who;
  el.appendChild(whoEl);
  el.appendChild(document.createTextNode(shown));
  place(el, layer);

  // ~6% of the time, the facility responds nearby
  if (Math.random() < 0.06) {
    setTimeout(() => {
      const re = document.createElement('div');
      re.className = 'ghost reply';
      re.textContent = FACILITY_REPLIES[Math.floor(Math.random() * FACILITY_REPLIES.length)];
      place(re, layer, el);
    }, 1600);
  }
}

function place(el, layer, near) {
  if (near && near.isConnected) {
    el.style.left = `${Math.min(70, parseFloat(near.style.left) + 4)}%`;
    el.style.top = `${Math.min(88, parseFloat(near.style.top) + 5)}%`;
  } else {
    el.style.left = `${6 + Math.random() * 64}%`;
    el.style.top = `${8 + Math.random() * 80}%`;
  }
  layer.appendChild(el);
  setTimeout(() => el.remove(), 9500);
}

// ---------------------------------------------------------------- the shocks
// Spontaneous spooky activity so the page feels alive even in dead chat.
function facilityWhisper() {
  const layer = $('ghosts');
  if (!layer || layer.children.length > 7) return;
  const el = document.createElement('div');
  el.className = 'ghost reply';
  el.textContent = FACILITY_WHISPERS[Math.floor(Math.random() * FACILITY_WHISPERS.length)];
  place(el, layer);
}

// Briefly scramble a random run of visible text into containment glyphs.
function corruptText() {
  const candidates = document.querySelectorAll('h2, .wingname, td, .stat span, .incident .who, header h1');
  if (!candidates.length) return;
  const pick = [];
  for (let i = 0; i < 6 + Math.floor(Math.random() * 8); i++) {
    const el = candidates[Math.floor(Math.random() * candidates.length)];
    if (el && el.textContent.trim() && !el.dataset.orig) pick.push(el);
  }
  pick.forEach((el) => {
    el.dataset.orig = el.textContent;
    el.textContent = el.textContent.replace(/\S/g, () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)]);
    el.classList.add('corrupt');
  });
  setTimeout(() => {
    pick.forEach((el) => {
      if (el.dataset.orig !== undefined) {
        el.textContent = el.dataset.orig;
        delete el.dataset.orig;
        el.classList.remove('corrupt');
      }
    });
  }, 400 + Math.random() * 500);
}

function glitchScreen(kind) {
  const g = $('glitch');
  g.className = kind;
  setTimeout(() => (g.className = ''), 650);
  if (kind === 'flash') {
    document.body.classList.add('shake');
    setTimeout(() => document.body.classList.remove('shake'), 420);
  }
}

// The disturbance scheduler: small things often, big shocks rarely.
function scheduleHaunting() {
  const roll = Math.random();
  if (roll < 0.45) facilityWhisper();
  else if (roll < 0.7) glitchScreen('scan');
  else if (roll < 0.88) corruptText();
  else {
    glitchScreen('flash');
    facilityWhisper();
  }
  setTimeout(scheduleHaunting, 6000 + Math.random() * 12000);
}
setTimeout(scheduleHaunting, 8000);

init();
