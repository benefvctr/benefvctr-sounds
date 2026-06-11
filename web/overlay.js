// NIGHT SHIFT overlay client. Connects to the game server over WebSocket,
// renders the HUD, and plays the channel's alert sounds on game events.

const $ = (id) => document.getElementById(id);

const SOUNDS = {
  health: new Audio('/sounds/Health.wav'),
  shield: new Audio('/sounds/Shield_Charge.wav'),
  bomb: new Audio('/sounds/bomb_dropped.wav'),
};

function connect() {
  const ws = new WebSocket(`ws://${location.host}/ws`);
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'state') render(msg.state);
    if (msg.type === 'event') handleEvent(msg.event);
  };
  ws.onclose = () => setTimeout(connect, 2000);
}
connect();

function handleEvent(ev) {
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
  if (s.phase === 'lobby') {
    $('roomname').textContent = 'DOORS OPEN — !deploy TO ENTER';
  } else if (s.phase === 'room' && s.room) {
    $('roomname').textContent = `ROOM ${s.roomIndex + 1}/${s.roomCount} — ${s.room.name}`;
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

  // feed
  const feed = $('feed');
  feed.innerHTML = s.feed
    .slice(-6)
    .map((f) => `<div class="line ${f.kind}">${escapeHtml(f.text)}</div>`)
    .join('');

  // squad
  const alive = s.raiders.filter((r) => r.alive).length;
  $('squadhead').textContent = `ON SHIFT — ${alive}/${s.raiders.length} ALIVE`;
  $('chips').innerHTML = s.raiders
    .map((r) => {
      const cls = ['chip', !r.alive && 'dead', r.alive && r.wounded && 'wounded', r.alive && r.shield && 'shield'].filter(Boolean).join(' ');
      const haul = r.alive && r.haul > 0 ? `<span class="haul">${r.haul}</span>` : '';
      return `<span class="${cls}">${escapeHtml(r.display)}${haul}</span>`;
    })
    .join('');

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
