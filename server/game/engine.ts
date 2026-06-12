// NIGHT SHIFT game engine — authoritative simulation.
// One instance per channel. Ticks at 1Hz, runs the shift (raid) state
// machine, consumes chat commands, and emits snapshots + one-shot events.

import { ITEM_BY_ID, ITEMS, rollItem, type ItemDef } from './items.js';
import { pickWing, hazardTier, type RoomDef, type WingDef } from './rooms.js';
import { beaconLuck, infirmaryShieldChance, collect, upgrade, MODULE_INFO } from './hideout.js';
import type { HideoutModule } from '../types.js';
import * as store from '../store.js';

export type Phase = 'idle' | 'lobby' | 'room' | 'extraction' | 'results';

export interface Raider {
  name: string;
  display: string;
  alive: boolean;
  wounded: boolean;
  shield: boolean;
  searching: boolean; // typed the room's SEARCH action: near-sure loot, extra risk
  braced: boolean; // typed BRACE: half hit chance, no loot this room
  light: number;
  luck: number; // beacon-boosted loot luck for this shift
  lightItemId?: string; // carried from stash; lost on death, returned on extract
  loot: ItemDef[];
  haul: number;
  deathLine?: string;
}

export interface FeedEntry {
  t: number;
  kind: 'info' | 'danger' | 'death' | 'loot' | 'vote' | 'system' | 'extract';
  text: string;
}

interface ActiveVote {
  prompt: string;
  a: { word: string; label: string; count: number };
  b: { word: string; label: string; count: number };
  voters: Map<string, 'a' | 'b'>;
  endsAt: number;
  resolved: boolean;
}

// Rooms without a vote get an action callout instead, so every room of every
// shift has something for chat to type.
interface ActiveAction {
  type: 'search' | 'brace';
  word: string;
  prompt: string;
  endsAt: number;
  actors: Set<string>; // raiders who typed it
  lurkers: Set<string>; // enrolled spectators paid a finder's fee (search only)
}

const SEARCH_PROMPTS = [
  'Unattended lockers. Loose ceiling tiles. The pockets of the missing.',
  'Something glints under the floor grating.',
  'These shelves haven’t been audited in years. Nobody is watching. Probably.',
  'A supply cart sits abandoned mid-corridor, still warm.',
];
const BRACE_PROMPTS = [
  'The walls shift. Something inhales.',
  'Footsteps overhead, matching yours. Then doubling.',
  'The lights flicker in a countdown rhythm.',
  'The temperature drops by one held breath.',
];
const LURKER_FEE = 3; // credits for enrolled spectators who join a SEARCH

export interface EngineEvent {
  type: 'sound' | 'pulse' | 'announce' | 'loot';
  sound?: 'health' | 'shield' | 'bomb';
  pulse?: 'death' | 'extract' | 'curse' | 'bless';
  /** Center-screen stinger on the overlay. */
  announce?: { text: string; sub?: string; tone: 'spooky' | 'danger' | 'good' };
  /** A loot find, for the overlay's sprite-pop layer. */
  loot?: { display: string; itemId: string; name: string; value: number; rarity: string; bounty?: boolean };
}

export interface Bounty {
  itemId: string;
  name: string;
  rarity: string;
  reward: number;
  claimedBy?: string;
}

const DEATH_LINES = [
  'was filed under MISSING',
  'opened the wrong door',
  'is still on the security tapes, waving',
  'was promoted. Posthumously.',
  'answered the phone',
  'stayed to read the memo',
  'became a line item',
  'was last seen helping something move',
  'took the stairs',
  'clocked out early',
];

const cfgNum = (env: string, dflt: number) => {
  const v = Number(process.env[env]);
  return Number.isFinite(v) && v > 0 ? v : dflt;
};

export const CONFIG = {
  raidIntervalSec: cfgNum('RAID_INTERVAL_SEC', 300),
  lobbySec: cfgNum('LOBBY_SEC', 45),
  roomSec: cfgNum('ROOM_SEC', 24),
  extractSec: cfgNum('EXTRACT_SEC', 12),
  resultsSec: cfgNum('RESULTS_SEC', 18),
  roomsPerShift: cfgNum('ROOMS_PER_SHIFT', 4),
  costs: { heal: 30, shield: 40, bomb: 60 },
  extractBonus: 50,
  wipeBits: cfgNum('WIPE_BITS', 1000), // bits in a single cheer that trigger a wipe
  wipeCountdownSec: cfgNum('WIPE_COUNTDOWN_SEC', 60),
};

export class Engine {
  phase: Phase = 'idle';
  raidId = 0;
  endsAt = 0; // current phase deadline (ms epoch)
  nextShiftAt = Date.now() + 20_000; // first shift shortly after boot
  raidIntervalSec = CONFIG.raidIntervalSec; // adjustable live from the director console
  wing: WingDef | null = null; // tonight's assignment
  private lastWingId?: string;
  rooms: RoomDef[] = [];
  roomIndex = -1;
  raiders = new Map<string, Raider>();
  feed: FeedEntry[] = [];
  vote: ActiveVote | null = null;
  action: ActiveAction | null = null;
  shiftDanger = 1; // director / bomb modifiers, lasts the shift
  shiftLoot = 1;
  startedAt = 0;
  bombsThisShift = 0; // drives escalating !bomb cost; resets each shift
  bounty: Bounty | null = null; // tonight's wanted artifact
  overlayMap = true; // director can hide the overlay mini-map if it's intrusive
  wipeState: { endsAt: number; by: string; bits: number } | null = null;
  private rng: () => number = Math.random;
  onEvent: (ev: EngineEvent) => void = () => {};

  start(): void {
    // A thrown error inside a timer is an uncaught exception that would kill
    // the whole process — never let one bad tick take down the server.
    setInterval(() => {
      try {
        this.tick();
      } catch (err) {
        console.error('[engine] tick error:', err);
      }
    }, 1000);
  }

  // ---------------------------------------------------------------- feed
  private say(kind: FeedEntry['kind'], text: string): void {
    this.feed.push({ t: Date.now(), kind, text });
    if (this.feed.length > 14) this.feed = this.feed.slice(-14);
  }

  private announce(text: string, sub: string | undefined, tone: 'spooky' | 'danger' | 'good'): void {
    this.onEvent({ type: 'announce', announce: { text, sub, tone } });
  }

  // ---------------------------------------------------------------- wipe
  /** A cheer of >= the threshold arms the season-ending wipe countdown. */
  cheer(display: string, bits: number): void {
    if (bits < CONFIG.wipeBits || this.wipeState) return;
    this.startWipe(display, bits);
  }

  private startWipe(by: string, bits: number): void {
    this.wipeState = { endsAt: Date.now() + CONFIG.wipeCountdownSec * 1000, by, bits };
    const note = bits > 0 ? `${by} cheered ${bits} bits` : `${by} pulled the lever`;
    this.say('death', `⚠ THE BENEFACTOR HAS BEEN PAID. ${note}. Season ${store.currentSeason()} ends in ${CONFIG.wipeCountdownSec}s.`);
    this.announce('WIPE INCOMING', `${note.toUpperCase()} — SEASON ${store.currentSeason()} ENDS`, 'danger');
    this.onEvent({ type: 'sound', sound: 'bomb' });
  }

  cancelWipe(): boolean {
    if (!this.wipeState) return false;
    this.wipeState = null;
    this.say('system', 'The wipe is called off. The Benefactor pockets the payment anyway.');
    this.announce('WIPE AVERTED', 'THE FACILITY EXHALES. RECORDS STAND.', 'good');
    return true;
  }

  private executeWipe(): void {
    const w = this.wipeState;
    this.wipeState = null;
    const rec = store.wipe(w?.by, w?.bits);
    const champ = rec.champions[0];
    this.say('death', `✖ SEASON ${rec.season} WIPED. ${rec.totalPlayers} accounts reset to zero.${champ ? ` Final champion: ${champ.display} (${champ.netWorth}cr) — crowned.` : ''}`);
    this.announce(`SEASON ${rec.season} ENDED`, champ ? `${champ.display.toUpperCase()} TAKES THE CROWN — ALL DEBTS CLEARED` : 'ALL DEBTS CLEARED', 'good');
    this.onEvent({ type: 'pulse', pulse: 'curse' });
  }

  // ---------------------------------------------------------------- tick
  private tick(): void {
    const now = Date.now();
    if (this.wipeState && now >= this.wipeState.endsAt) this.executeWipe();
    switch (this.phase) {
      case 'idle':
        if (now >= this.nextShiftAt) this.openLobby();
        break;
      case 'lobby':
        if (now >= this.endsAt) this.beginShift();
        break;
      case 'room':
        if (now >= this.endsAt) this.resolveRoom();
        break;
      case 'extraction':
        if (now >= this.endsAt) this.resolveExtraction();
        break;
      case 'results':
        if (now >= this.endsAt) {
          this.phase = 'idle';
          // interval 0 = back-to-back shifts: doors reopen moments after results
          this.nextShiftAt = now + Math.max(3, this.raidIntervalSec) * 1000;
        }
        break;
    }
  }

  // ---------------------------------------------------------------- phases
  openLobby(): void {
    this.phase = 'lobby';
    this.raidId = store.nextRaidId();
    this.endsAt = Date.now() + CONFIG.lobbySec * 1000;
    this.raiders.clear();
    this.feed = [];
    this.vote = null;
    this.shiftDanger = 1;
    this.shiftLoot = 1;
    this.bombsThisShift = 0;
    this.roomIndex = -1;
    this.startedAt = Date.now();
    // Tonight's assignment: one wing of the facility, rooms drawn from its pool.
    this.wing = pickWing(this.rng, this.lastWingId);
    this.lastWingId = this.wing.id;
    const deck = [...this.wing.rooms].sort(() => this.rng() - 0.5);
    this.rooms = deck.slice(0, CONFIG.roomsPerShift);
    this.rollBounty();
    const tier = hazardTier(this.wing.danger);
    this.say('system', `SHIFT #${this.raidId} — doors open. Tonight: ${this.wing.name} (hazard ${tier}). Type !deploy to clock in.`);
    this.announce(`SHIFT #${this.raidId}`, `TONIGHT: ${this.wing.name.toUpperCase()} · HAZARD ${tier} — !deploy TO ENTER`, 'spooky');
    if (this.bounty) this.say('loot', `★ BOUNTY: extract a ${this.bounty.name} this shift for +${this.bounty.reward}cr.`);
  }

  /** Pick tonight's wanted artifact — biased toward rares for drama. */
  private rollBounty(): void {
    const pool = ITEMS.filter((i) => i.rarity === 'rare' || i.rarity === 'anomalous' || (i.rarity === 'common' && this.rng() < 0.3));
    const item = pool[Math.floor(this.rng() * pool.length)] ?? ITEMS[0];
    this.bounty = { itemId: item.id, name: item.name, rarity: item.rarity, reward: Math.round(item.value * 1.5 + 150) };
  }

  private beginShift(): void {
    if (this.raiders.size === 0) {
      this.say('system', 'No one clocked in. The facility waits.');
      this.phase = 'idle';
      // Even with interval 0, an empty lobby earns a breather so the doors
      // don't strobe open/closed to an empty room.
      this.nextShiftAt = Date.now() + Math.max(60, this.raidIntervalSec) * 1000;
      return;
    }
    this.say('system', `${this.raiders.size} employee(s) descend. The elevator doors close behind them.`);
    this.enterRoom(0);
  }

  private enterRoom(i: number): void {
    this.phase = 'room';
    this.roomIndex = i;
    const room = this.rooms[i];
    this.endsAt = Date.now() + CONFIG.roomSec * 1000;
    this.say('info', `▸ ${room.name}: ${room.intro}`);
    this.announce(room.name.toUpperCase(), `ROOM ${i + 1} OF ${this.rooms.length}`, 'spooky');
    if (room.vote) {
      this.vote = {
        prompt: room.vote.prompt,
        a: { word: room.vote.a.word, label: room.vote.a.label, count: 0 },
        b: { word: room.vote.b.word, label: room.vote.b.label, count: 0 },
        voters: new Map(),
        endsAt: this.endsAt - 3000,
        resolved: false,
      };
      this.say('vote', `CHAT DECIDES — type ${room.vote.a.word} or ${room.vote.b.word}`);
      this.action = null;
    } else {
      this.vote = null;
      // No vote here — give chat something to type anyway. Dangerous rooms
      // skew toward BRACE (survive), loose rooms toward SEARCH (profit).
      const effDanger = room.danger * (this.wing?.danger ?? 1);
      const brace = this.rng() < Math.min(0.7, Math.max(0.15, (effDanger - 0.9) * 0.8));
      const prompts = brace ? BRACE_PROMPTS : SEARCH_PROMPTS;
      this.action = {
        type: brace ? 'brace' : 'search',
        word: brace ? 'BRACE' : 'SEARCH',
        prompt: prompts[Math.floor(this.rng() * prompts.length)],
        endsAt: this.endsAt - 3000,
        actors: new Set(),
        lurkers: new Set(),
      };
      this.say(
        'vote',
        brace
          ? 'ACTION — raiders type BRACE to take cover (half risk, no loot this room)'
          : `ACTION — raiders type SEARCH for a near-sure find (risky) · spectators who SEARCH earn ${LURKER_FEE}cr`,
      );
    }
  }

  private resolveRoom(): void {
    const room = this.rooms[this.roomIndex];
    let dangerMod = 1;
    let lootMod = 1;

    if (this.vote && room.vote) {
      const { a, b } = this.vote;
      const winner = a.count === b.count ? (this.rng() < 0.5 ? 'a' : 'b') : a.count > b.count ? 'a' : 'b';
      const opt = room.vote[winner];
      dangerMod = opt.dangerMod;
      lootMod = opt.lootMod;
      this.say('vote', `Vote: ${opt.word} wins (${a.count} vs ${b.count}). ${opt.result}`);
      this.vote = null;
    }

    if (this.action) {
      const acted = this.action.actors.size;
      const paid = this.action.lurkers.size;
      if (this.action.type === 'search' && (acted > 0 || paid > 0)) {
        const parts = [];
        if (acted > 0) parts.push(`${acted} raider(s) ransack the room.`);
        if (paid > 0) parts.push(`Finder's fee paid to ${paid} spectator(s).`);
        this.say('info', parts.join(' '));
      } else if (this.action.type === 'brace' && acted > 0) {
        this.say('info', `${acted} raider(s) brace as it passes.`);
      }
    }

    this.rollCasualties(room.danger * dangerMod, room.name);
    this.rollLoot(room.loot * lootMod);

    // Action effects last exactly one room.
    this.action = null;
    for (const r of this.raiders.values()) {
      r.searching = false;
      r.braced = false;
    }

    const next = this.roomIndex + 1;
    if (this.anyAlive() && next < this.rooms.length) {
      this.enterRoom(next);
    } else if (this.anyAlive()) {
      this.phase = 'extraction';
      this.endsAt = Date.now() + CONFIG.extractSec * 1000;
      this.say('extract', 'The freight elevator is lit. EXTRACTION OPEN — final sprint.');
    } else {
      this.finishShift();
    }
  }

  private resolveExtraction(): void {
    // One last danger roll on the sprint out, then payouts.
    this.rollCasualties(1.2, 'the extraction sprint');
    for (const r of this.raiders.values()) {
      if (!r.alive) continue;
      const player = store.getPlayer(r.name);
      if (!player) continue;
      const payout = r.haul + CONFIG.extractBonus;
      player.credits += payout;
      for (const item of r.loot) player.stash[item.id] = (player.stash[item.id] ?? 0) + 1;
      if (r.lightItemId) player.stash[r.lightItemId] = (player.stash[r.lightItemId] ?? 0) + 1;
      player.stats.extractions += 1;
      player.stats.lootValue += r.haul;
      player.stats.bestHaul = Math.max(player.stats.bestHaul, r.haul);
      // Bounty: first raider to extract the wanted artifact claims the reward.
      let bountyNote = '';
      if (this.bounty && !this.bounty.claimedBy && r.loot.some((it) => it.id === this.bounty!.itemId)) {
        this.bounty.claimedBy = r.display;
        player.credits += this.bounty.reward;
        player.stats.bounties += 1;
        bountyNote = ` ★ +${this.bounty.reward}cr BOUNTY`;
        this.announce('BOUNTY CLAIMED', `${r.display.toUpperCase()} EXTRACTED THE ${this.bounty.name.toUpperCase()} — +${this.bounty.reward}cr`, 'good');
      }
      store.markDirty(player.name);
      this.say('extract', `${r.display} EXTRACTED — haul ${r.haul}cr (+${CONFIG.extractBonus}cr bonus)${bountyNote}`);
    }
    const out = [...this.raiders.values()].filter((r) => r.alive).length;
    if (out > 0) this.announce('EXTRACTION COMPLETE', `${out} EMPLOYEE(S) RETURNED TO THE SURFACE`, 'good');
    this.onEvent({ type: 'pulse', pulse: 'extract' });
    this.finishShift();
  }

  private finishShift(): void {
    const survivors = [...this.raiders.values()].filter((r) => r.alive);
    if (survivors.length === 0) {
      this.say('death', 'Total loss. The facility logs the shift as "productive".');
      if (this.raiders.size > 0) this.announce('TOTAL LOSS', 'THE FACILITY LOGS THE SHIFT AS PRODUCTIVE', 'danger');
    }
    store.recordRaid({
      id: this.raidId,
      startedAt: this.startedAt,
      wing: this.wing?.name,
      rooms: this.rooms.map((r) => r.name),
      raiders: [...this.raiders.values()].map((r) => ({ name: r.name, survived: r.alive, haul: r.alive ? r.haul : 0 })),
    });
    this.phase = 'results';
    this.endsAt = Date.now() + CONFIG.resultsSec * 1000;
  }

  // ---------------------------------------------------------------- rolls
  private anyAlive(): boolean {
    return [...this.raiders.values()].some((r) => r.alive);
  }

  private rollCasualties(danger: number, where: string): void {
    const wingDanger = this.wing?.danger ?? 1;
    for (const r of this.raiders.values()) {
      if (!r.alive) continue;
      const base = 0.16 * danger * wingDanger * this.shiftDanger * (1 - r.light);
      const hitChance = Math.min(0.6, Math.max(0.02, base * (r.braced ? 0.5 : 1) + (r.searching ? 0.04 : 0)));
      if (this.rng() >= hitChance) continue;
      // Attribute the hit to one of the wing's residents.
      const ents = this.wing?.entities ?? [];
      const ent = ents.length ? ents[Math.floor(this.rng() * ents.length)] : null;
      if (r.shield) {
        r.shield = false;
        this.say('danger', `${r.display}'s shield shatters${ent ? ` against ${ent.name}` : ''} in ${where}.`);
      } else if (!r.wounded) {
        r.wounded = true;
        this.say('danger', `${r.display} is cornered${ent ? ` by ${ent.name}` : ''} in ${where} — WOUNDED. One more hit and it's over.`);
      } else {
        r.alive = false;
        // Entity-specific epitaphs when the wing has residents; house lines otherwise.
        r.deathLine =
          ent && this.rng() < 0.65
            ? ent.lines[Math.floor(this.rng() * ent.lines.length)]
            : DEATH_LINES[Math.floor(this.rng() * DEATH_LINES.length)];
        const player = store.getPlayer(r.name);
        if (player) {
          player.stats.deaths += 1; // carried light item was removed at deploy — it stays lost
          store.markDirty(player.name);
        }
        store.addIncident({
          t: Date.now(),
          name: r.name,
          display: r.display,
          line: r.deathLine,
          by: ent?.name,
          wing: this.wing?.name,
          room: where,
          season: store.currentSeason(),
        });
        this.say('death', `✖ ${r.display} ${r.deathLine}. Gear and ${r.haul}cr of loot — gone.`);
        this.onEvent({ type: 'pulse', pulse: 'death' });
        this.announce(`✖ ${r.display}`, r.deathLine.toUpperCase(), 'danger');
      }
    }
  }

  private rollLoot(lootFactor: number): void {
    const wingLoot = this.wing?.loot ?? 1;
    for (const r of this.raiders.values()) {
      if (!r.alive) continue;
      if (r.braced) continue; // heads down, hands empty
      let chance = Math.min(0.95, Math.max(0.1, 0.5 * lootFactor * wingLoot * this.shiftLoot * (r.wounded ? 0.5 : 1)));
      if (r.searching) chance = Math.max(chance, 0.9);
      if (this.rng() >= chance) continue;
      const item = rollItem(this.rng, lootFactor * wingLoot * this.shiftLoot * r.luck);
      r.loot.push(item);
      r.haul += item.value;
      const isBounty = this.bounty?.itemId === item.id && !this.bounty.claimedBy;
      this.say('loot', `${r.display} finds ${item.name} (${item.value}cr)${isBounty ? ' ★ BOUNTY ITEM' : ''}`);
      this.onEvent({ type: 'loot', loot: { display: r.display, itemId: item.id, name: item.name, value: item.value, rarity: item.rarity, bounty: isBounty } });
    }
  }

  // ---------------------------------------------------------------- chat
  handleChat(login: string, display: string, message: string): void {
    const msg = message.trim();
    const lower = msg.toLowerCase();
    const player = store.getPlayer(login);
    if (player) {
      player.lastSeen = Date.now();
      player.display = display;
    }

    // Vote words — any chatter can vote, raider or not. Last vote counts.
    if (this.vote && !this.vote.resolved && Date.now() < this.vote.endsAt) {
      const word = lower.replace(/^!/, '');
      const pick = word === this.vote.a.word.toLowerCase() ? 'a' : word === this.vote.b.word.toLowerCase() ? 'b' : null;
      if (pick) {
        const prev = this.vote.voters.get(login);
        if (prev) this.vote[prev].count -= 1;
        this.vote.voters.set(login, pick);
        this.vote[pick].count += 1;
        return;
      }
    }

    // Action words — every non-vote room has one. Raiders act; enrolled
    // spectators who join a SEARCH collect a small finder's fee.
    if (this.action && Date.now() < this.action.endsAt) {
      const word = lower.replace(/^!/, '');
      if (word === this.action.word.toLowerCase()) {
        const raider = this.raiders.get(login);
        if (raider?.alive) {
          if (!this.action.actors.has(login)) {
            this.action.actors.add(login);
            if (this.action.type === 'search') raider.searching = true;
            else raider.braced = true;
          }
        } else if (this.action.type === 'search' && player && !this.action.lurkers.has(login)) {
          this.action.lurkers.add(login);
          player.credits += LURKER_FEE;
          store.markDirty(login);
        }
        return;
      }
    }

    if (!lower.startsWith('!')) return;
    const [cmd, ...args] = lower.slice(1).split(/\s+/);

    switch (cmd) {
      case 'clockin':
      case 'enroll':
      case 'join': {
        if (player) return;
        store.createPlayer(login, display);
        this.say('system', `${display} clocks in. Welcome to the night shift. (+100cr, penlight issued)`);
        break;
      }
      case 'deploy': {
        if (this.phase !== 'lobby') return;
        const p = player ?? store.createPlayer(login, display);
        if (this.raiders.has(login)) return;
        // Auto-carry the best light source from stash; it's at stake.
        let best: ItemDef | undefined;
        for (const [id, qty] of Object.entries(p.stash)) {
          const def = ITEM_BY_ID.get(id);
          if (def?.light && qty > 0 && (!best || def.light > best.light!)) best = def;
        }
        if (best) {
          p.stash[best.id] -= 1;
          if (p.stash[best.id] <= 0) delete p.stash[best.id];
        }
        p.stats.shifts += 1;
        store.markDirty(login);
        // Hideout payoffs: beacon improves loot luck, infirmary may grant a shield.
        const startShield = this.rng() < infirmaryShieldChance(p.hideout);
        this.raiders.set(login, {
          name: login,
          display,
          alive: true,
          wounded: false,
          shield: startShield,
          searching: false,
          braced: false,
          light: best?.light ?? 0,
          luck: beaconLuck(p.hideout),
          lightItemId: best?.id,
          loot: [],
          haul: 0,
        });
        const extras = [best ? `carrying ${best.name}` : 'with no light. Bold.', startShield ? 'Infirmary shield online.' : '']
          .filter(Boolean)
          .join(' ');
        this.say('info', `${display} deploys ${extras}`);
        break;
      }
      case 'hideout':
      case 'base': {
        if (!player) return;
        const pend = collect(player, Date.now());
        if (pend > 0) store.markDirty(login);
        this.say(
          'system',
          `${display}'s hideout: gen ${player.hideout.generator} · vault ${player.hideout.vault} · beacon ${player.hideout.beacon} · infirmary ${player.hideout.infirmary}. ${pend > 0 ? `Collected ${pend}cr.` : 'Manage it on the companion site.'}`,
        );
        break;
      }
      case 'collect': {
        if (!player) return;
        const amount = collect(player, Date.now());
        store.markDirty(login);
        this.say('system', amount > 0 ? `${display} collects ${amount}cr from the hideout.` : `${display}'s hideout has nothing banked yet.`);
        break;
      }
      case 'upgrade': {
        if (!player) return;
        const module = args[0] as HideoutModule;
        if (!MODULE_INFO[module]) {
          this.say('system', `${display}: upgrade what? generator · vault · beacon · infirmary`);
          return;
        }
        const res = upgrade(player, module, Date.now());
        store.markDirty(login);
        if (res.ok) this.say('system', `${display} upgrades ${MODULE_INFO[module].name} to L${res.level} (−${res.cost}cr).`);
        else if (res.reason === 'broke') this.say('system', `${display} needs ${res.cost}cr to upgrade ${MODULE_INFO[module].name}.`);
        else if (res.reason === 'maxed') this.say('system', `${display}'s ${MODULE_INFO[module].name} is already maxed.`);
        break;
      }
      case 'heal': {
        this.intervene(player, CONFIG.costs.heal, () => {
          const target = this.findRaider(args[0]) ?? [...this.raiders.values()].find((r) => r.alive && r.wounded);
          if (!target || !target.alive || !target.wounded) return false;
          target.wounded = false;
          this.say('info', `❤ ${display} patches up ${target.display}. Back on their feet.`);
          this.onEvent({ type: 'sound', sound: 'health' });
          return true;
        });
        break;
      }
      case 'shield': {
        this.intervene(player, CONFIG.costs.shield, () => {
          const target = this.findRaider(args[0]) ?? [...this.raiders.values()].find((r) => r.alive && !r.shield);
          if (!target || !target.alive || target.shield) return false;
          target.shield = true;
          this.say('info', `⛨ ${display} projects a shield around ${target.display}.`);
          this.onEvent({ type: 'sound', sound: 'shield' });
          return true;
        });
        break;
      }
      case 'bomb': {
        // Anti-grief: the price doubles with each charge dropped this shift
        // (60 → 120 → 240 → 480…), so one person can't spam the squad to death.
        if (!player || this.phase !== 'room') return;
        const cost = CONFIG.costs.bomb * Math.pow(2, this.bombsThisShift);
        if (player.credits < cost) {
          this.say('system', `${display} reaches for a charge but can't cover the ${cost}cr cost.`);
          return;
        }
        player.credits -= cost;
        this.bombsThisShift += 1;
        store.markDirty(player.name);
        this.detonate(display, cost);
        break;
      }
    }
  }

  private findRaider(name?: string): Raider | undefined {
    if (!name) return undefined;
    return this.raiders.get(name.replace(/^@/, '').toLowerCase());
  }

  /** Charge a player for an intervention; only deduct if the effect lands. */
  private intervene(player: store.PlayerRecord | undefined, cost: number, effect: () => boolean): void {
    if (!player || player.credits < cost) return;
    if (this.phase !== 'room' && this.phase !== 'extraction') return;
    if (effect()) {
      player.credits -= cost;
      store.markDirty(player.name);
    }
  }

  private detonate(by: string, cost?: number): void {
    this.shiftDanger *= 1.4;
    this.shiftLoot *= 1.5;
    this.say('danger', `💣 ${by} drops a charge into the shift${cost ? ` (−${cost}cr)` : ''}. Walls open. So do other things.`);
    this.onEvent({ type: 'sound', sound: 'bomb' });
    this.announce('STRUCTURAL BREACH', `${by.toUpperCase()} DROPPED A CHARGE — DANGER RISES. SO DOES THE LOOT.`, 'danger');
  }

  // ---------------------------------------------------------------- director
  director(action: string, arg?: number): boolean {
    switch (action) {
      case 'start':
        if (this.phase !== 'idle') return false;
        this.openLobby();
        return true;
      case 'interval': {
        // Time between shifts, in seconds. 0 = back-to-back (doors reopen
        // right after results; an empty lobby still gets a 60s breather).
        if (arg === undefined || !Number.isFinite(arg)) return false;
        this.raidIntervalSec = Math.max(0, Math.min(3600, Math.round(arg)));
        if (this.phase === 'idle') this.nextShiftAt = Date.now() + Math.max(3, this.raidIntervalSec) * 1000;
        this.say('system', `The Director adjusts the shift schedule: ${this.raidIntervalSec === 0 ? 'back-to-back' : `${this.raidIntervalSec}s between shifts`}.`);
        return true;
      }
      case 'bless':
        if (this.phase !== 'room' && this.phase !== 'extraction') return false;
        this.shiftDanger *= 0.6;
        for (const r of this.raiders.values()) if (r.alive) r.wounded = false;
        this.say('system', 'THE BENEFACTOR SMILES. Wounds close. The dark steps back.');
        this.announce('THE BENEFACTOR SMILES', 'WOUNDS CLOSE. THE DARK STEPS BACK.', 'good');
        this.onEvent({ type: 'pulse', pulse: 'bless' });
        this.onEvent({ type: 'sound', sound: 'health' });
        return true;
      case 'curse':
        if (this.phase !== 'room' && this.phase !== 'extraction') return false;
        this.shiftDanger *= 1.6;
        this.say('system', 'THE BENEFACTOR FROWNS. The lights dim by exactly one secret.');
        this.announce('THE BENEFACTOR FROWNS', 'THE LIGHTS DIM BY EXACTLY ONE SECRET', 'danger');
        this.onEvent({ type: 'pulse', pulse: 'curse' });
        return true;
      case 'bomb':
        if (this.phase !== 'room') return false;
        this.detonate('The Director');
        return true;
      case 'wipe':
        if (this.wipeState) return false;
        this.startWipe('The Director', 0);
        return true;
      case 'cancelwipe':
        return this.cancelWipe();
      case 'map': // toggle the overlay mini-map
        this.overlayMap = !this.overlayMap;
        return true;
      case 'rebounty': // reroll tonight's bounty
        if (this.phase === 'idle') return false;
        this.rollBounty();
        if (this.bounty) this.say('loot', `★ BOUNTY reissued: extract a ${this.bounty.name} for +${this.bounty.reward}cr.`);
        return true;
      default:
        return false;
    }
  }

  // ---------------------------------------------------------------- snapshot
  snapshot() {
    const now = Date.now();
    const room = this.roomIndex >= 0 && this.roomIndex < this.rooms.length ? this.rooms[this.roomIndex] : null;
    return {
      now,
      phase: this.phase,
      raidId: this.raidId,
      season: store.currentSeason(),
      intervalSec: this.raidIntervalSec,
      wipe: this.wipeState
        ? { secondsLeft: Math.max(0, Math.ceil((this.wipeState.endsAt - now) / 1000)), by: this.wipeState.by, bits: this.wipeState.bits }
        : null,
      wing: this.phase !== 'idle' && this.wing ? { id: this.wing.id, name: this.wing.name, tier: hazardTier(this.wing.danger) } : null,
      secondsLeft: this.phase === 'idle' ? Math.max(0, Math.ceil((this.nextShiftAt - now) / 1000)) : Math.max(0, Math.ceil((this.endsAt - now) / 1000)),
      roomIndex: this.roomIndex,
      roomCount: this.rooms.length,
      room: this.phase === 'room' && room ? { name: room.name, intro: room.intro } : null,
      // The shift's route, for the overlay mini-map and site map.
      route: this.phase !== 'idle' ? this.rooms.map((r) => r.name) : [],
      bounty: this.bounty,
      overlayMap: this.overlayMap,
      action:
        this.action && this.phase === 'room'
          ? {
              type: this.action.type,
              word: this.action.word,
              prompt: this.action.prompt,
              actors: this.action.actors.size,
              lurkers: this.action.lurkers.size,
              secondsLeft: Math.max(0, Math.ceil((this.action.endsAt - now) / 1000)),
            }
          : null,
      vote:
        this.vote && !this.vote.resolved
          ? {
              prompt: this.vote.prompt,
              a: { word: this.vote.a.word, label: this.vote.a.label, count: this.vote.a.count },
              b: { word: this.vote.b.word, label: this.vote.b.label, count: this.vote.b.count },
              secondsLeft: Math.max(0, Math.ceil((this.vote.endsAt - now) / 1000)),
            }
          : null,
      raiders: [...this.raiders.values()].map((r) => ({
        display: r.display,
        alive: r.alive,
        wounded: r.wounded,
        shield: r.shield,
        haul: r.haul,
        lootCount: r.loot.length,
        light: r.light,
      })),
      feed: this.feed,
    };
  }
}
