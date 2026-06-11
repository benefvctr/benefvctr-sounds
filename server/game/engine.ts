// NIGHT SHIFT game engine — authoritative simulation.
// One instance per channel. Ticks at 1Hz, runs the shift (raid) state
// machine, consumes chat commands, and emits snapshots + one-shot events.

import { ITEM_BY_ID, rollItem, type ItemDef } from './items.js';
import { ROOMS, type RoomDef } from './rooms.js';
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

export interface EngineEvent {
  type: 'sound' | 'pulse';
  sound?: 'health' | 'shield' | 'bomb';
  pulse?: 'death' | 'extract' | 'curse' | 'bless';
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
};

export class Engine {
  phase: Phase = 'idle';
  raidId = 0;
  endsAt = 0; // current phase deadline (ms epoch)
  nextShiftAt = Date.now() + 20_000; // first shift shortly after boot
  rooms: RoomDef[] = [];
  roomIndex = -1;
  raiders = new Map<string, Raider>();
  feed: FeedEntry[] = [];
  vote: ActiveVote | null = null;
  shiftDanger = 1; // director / bomb modifiers, lasts the shift
  shiftLoot = 1;
  startedAt = 0;
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

  // ---------------------------------------------------------------- tick
  private tick(): void {
    const now = Date.now();
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
          this.nextShiftAt = now + CONFIG.raidIntervalSec * 1000;
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
    this.roomIndex = -1;
    this.startedAt = Date.now();
    // Draw the encounter deck: distinct rooms, shuffled.
    const deck = [...ROOMS].sort(() => this.rng() - 0.5);
    this.rooms = deck.slice(0, CONFIG.roomsPerShift);
    this.say('system', `SHIFT #${this.raidId} — doors open. Type !deploy to clock in for the night.`);
  }

  private beginShift(): void {
    if (this.raiders.size === 0) {
      this.say('system', 'No one clocked in. The facility waits.');
      this.phase = 'idle';
      this.nextShiftAt = Date.now() + CONFIG.raidIntervalSec * 1000;
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
    } else {
      this.vote = null;
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

    this.rollCasualties(room.danger * dangerMod, room.name);
    this.rollLoot(room.loot * lootMod);

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
      store.markDirty(player.name);
      this.say('extract', `${r.display} EXTRACTED — haul ${r.haul}cr (+${CONFIG.extractBonus}cr bonus)`);
    }
    this.onEvent({ type: 'pulse', pulse: 'extract' });
    this.finishShift();
  }

  private finishShift(): void {
    const survivors = [...this.raiders.values()].filter((r) => r.alive);
    if (survivors.length === 0) this.say('death', 'Total loss. The facility logs the shift as "productive".');
    store.recordRaid({
      id: this.raidId,
      startedAt: this.startedAt,
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
    for (const r of this.raiders.values()) {
      if (!r.alive) continue;
      const hitChance = Math.min(0.6, Math.max(0.02, 0.16 * danger * this.shiftDanger * (1 - r.light)));
      if (this.rng() >= hitChance) continue;
      if (r.shield) {
        r.shield = false;
        this.say('danger', `${r.display}'s shield shatters in ${where}.`);
      } else if (!r.wounded) {
        r.wounded = true;
        this.say('danger', `${r.display} is WOUNDED in ${where}. One more hit and it's over.`);
      } else {
        r.alive = false;
        r.deathLine = DEATH_LINES[Math.floor(this.rng() * DEATH_LINES.length)];
        const player = store.getPlayer(r.name);
        if (player) {
          player.stats.deaths += 1; // carried light item was removed at deploy — it stays lost
          store.markDirty(player.name);
        }
        this.say('death', `✖ ${r.display} ${r.deathLine}. Gear and ${r.haul}cr of loot — gone.`);
        this.onEvent({ type: 'pulse', pulse: 'death' });
      }
    }
  }

  private rollLoot(lootFactor: number): void {
    for (const r of this.raiders.values()) {
      if (!r.alive) continue;
      const chance = Math.min(0.95, Math.max(0.1, 0.5 * lootFactor * this.shiftLoot * (r.wounded ? 0.5 : 1)));
      if (this.rng() >= chance) continue;
      const item = rollItem(this.rng, lootFactor * this.shiftLoot * r.luck);
      r.loot.push(item);
      r.haul += item.value;
      this.say('loot', `${r.display} finds ${item.name} (${item.value}cr)`);
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
        this.intervene(player, CONFIG.costs.bomb, () => {
          if (this.phase !== 'room') return false;
          this.detonate(display);
          return true;
        });
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

  private detonate(by: string): void {
    this.shiftDanger *= 1.4;
    this.shiftLoot *= 1.5;
    this.say('danger', `💣 ${by} drops a charge into the shift. Walls open. So do other things.`);
    this.onEvent({ type: 'sound', sound: 'bomb' });
  }

  // ---------------------------------------------------------------- director
  director(action: string): boolean {
    switch (action) {
      case 'start':
        if (this.phase !== 'idle') return false;
        this.openLobby();
        return true;
      case 'bless':
        if (this.phase !== 'room' && this.phase !== 'extraction') return false;
        this.shiftDanger *= 0.6;
        for (const r of this.raiders.values()) if (r.alive) r.wounded = false;
        this.say('system', 'THE BENEFACTOR SMILES. Wounds close. The dark steps back.');
        this.onEvent({ type: 'pulse', pulse: 'bless' });
        this.onEvent({ type: 'sound', sound: 'health' });
        return true;
      case 'curse':
        if (this.phase !== 'room' && this.phase !== 'extraction') return false;
        this.shiftDanger *= 1.6;
        this.say('system', 'THE BENEFACTOR FROWNS. The lights dim by exactly one secret.');
        this.onEvent({ type: 'pulse', pulse: 'curse' });
        return true;
      case 'bomb':
        if (this.phase !== 'room') return false;
        this.detonate('The Director');
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
      secondsLeft: this.phase === 'idle' ? Math.max(0, Math.ceil((this.nextShiftAt - now) / 1000)) : Math.max(0, Math.ceil((this.endsAt - now) / 1000)),
      roomIndex: this.roomIndex,
      roomCount: this.rooms.length,
      room: this.phase === 'room' && room ? { name: room.name, intro: room.intro } : null,
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
