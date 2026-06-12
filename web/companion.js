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
    s.vote ? stat(`${s.vote.a.word} ${s.vote.a.count}–${s.vote.b.count} ${s.vote.b.word}`, 'live vote') : '',
    s.action ? stat(`${s.action.word} ×${s.action.actors + s.action.lurkers}`, 'live action — type it!') : '',
  ].join('');
  // keep the map's TONIGHT badge in sync with the live shift
  if (s.wing?.id !== lastTonight) {
    lastTonight = s.wing?.id ?? null;
    renderMap();
  }

  $('feedbox').innerHTML = s.feed.map((f) => `<div class="${f.kind}">${esc(f.text)}</div>`).join('');
}

const stat = (v, l) => `<div class="stat"><b>${esc(v)}</b><span>${esc(l)}</span></div>`;
const fmt = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

// ---------------------------------------------------------------- facility map
let mapData = null;
let lastTonight = null;

const TIER_COLOR = { LOW: '#7fd47f', STANDARD: '#d8d3c8', ELEVATED: '#ffb454', SEVERE: '#ff8a4f', CATASTROPHIC: '#ff4f4f' };

async function renderMap() {
  if (!mapData) {
    try {
      mapData = await fetch('/api/map').then((r) => r.json());
    } catch {
      return;
    }
  }
  const tonight = lastTonight;
  $('map').innerHTML = mapData.wings
    .map((w) => {
      const dangerPct = Math.min(100, (w.danger / 1.8) * 100);
      const lootPct = Math.min(100, (w.loot / 2.2) * 100);
      const tcolor = TIER_COLOR[w.tier] ?? '#fff';
      return `<div class="wingrow ${w.id === tonight ? 'tonight' : ''}">
        <div>
          <div class="wingname">${esc(w.name)}${w.id === tonight ? '<span class="badge">TONIGHT</span>' : ''}</div>
          <div class="wingtag">${esc(w.tag)}</div>
          <div class="wingents">residents: ${esc(w.entities.join(' · '))}</div>
        </div>
        <div class="wingrooms">${w.rooms.map((r) => `<span class="roomchip ${r.vote ? 'vote' : ''}">${esc(r.name)}</span>`).join('')}</div>
        <div class="meters">
          <div class="mrow"><span class="mlabel">hazard</span><span class="mbar"><i style="width:${dangerPct}%;background:${tcolor}"></i></span><span class="tier" style="color:${tcolor}">${esc(w.tier)}</span></div>
          <div class="mrow"><span class="mlabel">yield</span><span class="mbar"><i style="width:${lootPct}%;background:var(--green)"></i></span><span class="tier" style="color:var(--green)">×${w.loot.toFixed(2)}</span></div>
          <div class="mlabel" style="margin-top:4px">◆ blue rooms put a vote on screen</div>
        </div>
      </div>`;
    })
    .join('');
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
  const [board, raids, seasons] = await Promise.all([
    fetch('/api/leaderboard').then((r) => r.json()),
    fetch('/api/raids').then((r) => r.json()),
    fetch('/api/seasons').then((r) => r.json()),
  ]);
  renderHallOfFame(seasons);
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
  renderPlayer();
}

let currentPlayer = null;

function renderPlayer() {
  const p = currentPlayer;
  if (!p) return;
  const box = $('playerbox');
  const h = p.hideout;
  box.innerHTML = `
    <div class="stats">
      ${stat(p.credits + 'cr', 'credits')}
      ${stat(p.netWorth + 'cr', 'net worth')}
      ${stat(p.stats.extractions + '/' + p.stats.shifts, 'extract rate')}
      ${stat(p.stats.bestHaul + 'cr', 'best haul')}
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
        .map(
          (s) => `<tr>
            <td><span style="color:${rarityColors[s.rarity] ?? '#fff'}">${esc(s.name)}</span>${s.light ? ' 🔦' : ''}<br><span class="flavor">${esc(s.flavor)}</span></td>
            <td class="num">${s.qty}</td><td class="num">${s.value}</td>
          </tr>`,
        )
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
  'THAT INFORMATION IS RESTRICTED', 'YOU ARE DOING GREAT',
];

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

init();
