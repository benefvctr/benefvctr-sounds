// The Hideout — each employee's persistent base. It earns credits passively
// between shifts (and between streams), and its modules feed back into raids.
//
//   generator  → passive credits/hour
//   vault      → cap on how much unclaimed income can pile up while away
//   beacon     → loot luck (more rares/anomalies) when you deploy
//   infirmary  → chance to start a shift already shielded
//
// Income accrues lazily: nothing runs in the background. We store the last
// collect timestamp and compute what's owed on demand, so it's correct even
// after the server restarts or the viewer is away for days.

import type { HideoutModule, HideoutState, PlayerRecord } from '../types.js';

const HOUR = 3_600_000;

export const RATE_PER_GEN = 15; // credits/hour per generator level
export const CAP_PER_VAULT = 200; // max stored income per vault level

export const MODULE_INFO: Record<HideoutModule, { name: string; blurb: string; max: number }> = {
  generator: { name: 'Generator', blurb: 'Passive credits while you are away.', max: 20 },
  vault: { name: 'Vault', blurb: 'How much income can bank before it overflows.', max: 20 },
  beacon: { name: 'Beacon', blurb: 'Pulls rarer loot toward you on deployment.', max: 10 },
  infirmary: { name: 'Infirmary', blurb: 'Chance to start a shift already shielded.', max: 5 },
};

/** Cost to raise a module from its current level to the next. */
export function upgradeCost(module: HideoutModule, currentLevel: number): number {
  const base = { generator: 90, vault: 80, beacon: 160, infirmary: 200 }[module];
  return Math.round(base * Math.pow(currentLevel + 1, 1.5));
}

export function incomeRatePerHour(h: HideoutState): number {
  return RATE_PER_GEN * h.generator;
}

export function incomeCap(h: HideoutState): number {
  return CAP_PER_VAULT * h.vault;
}

/** Credits currently waiting to be collected (capped by the vault). */
export function pendingIncome(p: PlayerRecord, now = Date.now()): number {
  const hours = Math.max(0, now - p.incomeCollectedAt) / HOUR;
  const earned = incomeRatePerHour(p.hideout) * hours;
  return Math.min(incomeCap(p.hideout), Math.floor(earned));
}

/** Bank pending income into credits. Returns the amount collected. */
export function collect(p: PlayerRecord, now = Date.now()): number {
  const amount = pendingIncome(p, now);
  p.credits += amount;
  p.incomeCollectedAt = now;
  return amount;
}

export interface UpgradeResult {
  ok: boolean;
  reason?: 'unknown' | 'maxed' | 'broke';
  cost?: number;
  level?: number;
}

export function upgrade(p: PlayerRecord, module: HideoutModule, now = Date.now()): UpgradeResult {
  const info = MODULE_INFO[module];
  if (!info) return { ok: false, reason: 'unknown' };
  const level = p.hideout[module];
  if (level >= info.max) return { ok: false, reason: 'maxed' };
  const cost = upgradeCost(module, level);
  if (p.credits < cost) return { ok: false, reason: 'broke', cost };
  // Bank what's owed first so a faster/larger generator doesn't apply retroactively.
  collect(p, now);
  p.credits -= cost;
  p.hideout[module] = level + 1;
  return { ok: true, cost, level: level + 1 };
}

/** Loot luck multiplier applied when a raider deploys. */
export function beaconLuck(h: HideoutState): number {
  return 1 + 0.06 * h.beacon;
}

/** Probability of deploying with a free shield. */
export function infirmaryShieldChance(h: HideoutState): number {
  return Math.min(0.7, 0.18 * h.infirmary);
}

/** A compact, display-ready view of the hideout for the companion site. */
export function publicHideout(p: PlayerRecord, now = Date.now()) {
  const modules = (Object.keys(MODULE_INFO) as HideoutModule[]).map((m) => ({
    id: m,
    name: MODULE_INFO[m].name,
    blurb: MODULE_INFO[m].blurb,
    level: p.hideout[m],
    max: MODULE_INFO[m].max,
    nextCost: p.hideout[m] >= MODULE_INFO[m].max ? null : upgradeCost(m, p.hideout[m]),
  }));
  return {
    modules,
    ratePerHour: incomeRatePerHour(p.hideout),
    cap: incomeCap(p.hideout),
    pending: pendingIncome(p, now),
    collectedAt: p.incomeCollectedAt,
  };
}
