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
  if (live) $('livetext').textContent = `SHIFT #${s.raidId} · ${s.phase.toUpperCase()}`;
  else $('livetext').textContent = `NEXT SHIFT ${fmt(s.secondsLeft)}`;

  const alive = s.raiders.filter((r) => r.alive).length;
  const haul = s.raiders.reduce((a, r) => a + (r.alive ? r.haul : 0), 0);
  $('shiftstats').innerHTML = [
    stat(s.phase.toUpperCase(), 'phase'),
    stat(fmt(s.secondsLeft), live ? 'time left' : 'until doors'),
    stat(`${alive}/${s.raiders.length}`, 'alive'),
    stat(`${haul}cr`, 'haul at stake'),
    s.vote ? stat(`${s.vote.a.word} ${s.vote.a.count}–${s.vote.b.count} ${s.vote.b.word}`, 'live vote') : '',
  ].join('');

  $('feedbox').innerHTML = s.feed.map((f) => `<div class="${f.kind}">${esc(f.text)}</div>`).join('');
}

const stat = (v, l) => `<div class="stat"><b>${esc(v)}</b><span>${esc(l)}</span></div>`;
const fmt = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

async function refreshBoards() {
  const [board, raids] = await Promise.all([
    fetch('/api/leaderboard').then((r) => r.json()),
    fetch('/api/raids').then((r) => r.json()),
  ]);
  $('board').querySelector('tbody').innerHTML = board
    .map(
      (p, i) => `<tr>
        <td class="rank">${i + 1}</td><td>${esc(p.display)}</td>
        <td class="num cr">${p.credits}</td><td class="num">${p.stashValue}</td>
        <td class="num cr">${p.netWorth}</td>
        <td class="num">${p.stats.shifts}</td><td class="num">${p.stats.extractions}</td>
        <td class="num dead">${p.stats.deaths}</td><td class="num">${p.stats.bestHaul}</td>
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
        <td>#${r.id}</td><td class="muted">${esc(r.rooms.join(' → '))}</td>
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
      <div class="muted" style="margin:6px 0 12px">Type <b style="color:var(--amber)">!collect</b> in chat to bank it. ${h.pending >= h.cap ? '<b style="color:var(--red)">VAULT FULL — overflow is wasted.</b>' : ''}</div>
      <div class="modgrid">
        ${h.modules
          .map(
            (m) => `<div class="mod">
              <div class="modname">${esc(m.name)} <span class="lvl">L${m.level}${m.level >= m.max ? ' MAX' : ''}</span></div>
              <div class="flavor">${esc(m.blurb)}</div>
              <div class="modcost">${m.nextCost === null ? 'maxed' : `!upgrade ${m.id} <span class="muted">(${m.nextCost}cr)</span>`}</div>
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
