// NIGHT SHIFT item catalogue.
// Rarity drives both drop weight and market value. `light` items can be
// carried into a shift and improve survival odds — and are LOST on death.

export type Rarity = 'scrap' | 'common' | 'rare' | 'anomalous';

export interface ItemDef {
  id: string;
  name: string;
  rarity: Rarity;
  value: number; // credits
  light?: number; // survival bonus when carried (0..1)
  flavor: string;
}

export const RARITY_WEIGHT: Record<Rarity, number> = {
  scrap: 55,
  common: 30,
  rare: 12,
  anomalous: 3,
};

export const RARITY_COLOR: Record<Rarity, string> = {
  scrap: '#9a9a8e',
  common: '#7fd47f',
  rare: '#5fb7ff',
  anomalous: '#ff9d3c',
};

export const ITEMS: ItemDef[] = [
  // ---- scrap ----
  { id: 'wiring', name: 'Copper Wiring', rarity: 'scrap', value: 8, flavor: 'Stripped from a wall that hums when nobody is watching.' },
  { id: 'keycard', name: 'Expired Shift Keycard', rarity: 'scrap', value: 10, flavor: 'The photo on it is of you. You never worked here.' },
  { id: 'sludge', name: 'Break Room Coffee Sludge', rarity: 'scrap', value: 6, flavor: 'Technically a fluid. Technically.' },
  { id: 'bolts', name: 'Handful of Warm Bolts', rarity: 'scrap', value: 7, flavor: 'They were warm when you found them. They are still warm.' },
  { id: 'memo', name: 'Redacted Memo', rarity: 'scrap', value: 12, flavor: 'Every word is blacked out except "SORRY".' },

  // ---- common ----
  { id: 'multitool', name: 'Maintenance Multitool', rarity: 'common', value: 35, flavor: 'Seventeen attachments. Three of them have no conceivable use.' },
  { id: 'ration', name: 'Sealed Night Ration', rarity: 'common', value: 28, flavor: 'Best before: see reverse. Reverse is blank.' },
  { id: 'penlight', name: 'Standard Issue Penlight', rarity: 'common', value: 25, light: 0.08, flavor: 'Company policy requires it stays on. Always.' },
  { id: 'halogen', name: 'Halogen Work Lamp', rarity: 'common', value: 55, light: 0.15, flavor: 'Bright enough to keep the corridor honest.' },
  { id: 'tape', name: 'Surveillance Tape #44', rarity: 'common', value: 40, flavor: 'Forty minutes of an empty hallway. At 38:12, it waves.' },

  // ---- rare ----
  { id: 'shard', name: 'Resonant Shard', rarity: 'rare', value: 160, flavor: 'It rings at the exact pitch of your name.' },
  { id: 'blackbox', name: 'Black Box Recording', rarity: 'rare', value: 190, flavor: 'The facility has no aircraft. The facility has never had aircraft.' },
  { id: 'fuse', name: 'Prototype Fuse', rarity: 'rare', value: 140, flavor: 'Rated for currents that do not exist yet.' },
  { id: 'lantern', name: 'Veiled Lantern', rarity: 'rare', value: 240, light: 0.3, flavor: 'It does not cast light. It removes dark.' },
  { id: 'badge', name: 'Floor Manager’s Badge', rarity: 'rare', value: 210, flavor: 'There has never been a floor manager. Promotion pending.' },

  // ---- anomalous ----
  { id: 'bulb', name: 'Whispering Bulb', rarity: 'anomalous', value: 700, light: 0.4, flavor: 'It glows when you lie. Keep it away from the break room.' },
  { id: 'stapler', name: 'Non-Euclidean Stapler', rarity: 'anomalous', value: 850, flavor: 'Staples documents to events.' },
  { id: 'pen', name: 'The Benefactor’s Pen', rarity: 'anomalous', value: 1500, flavor: 'Whatever it signs, happens. It is out of ink. Mostly.' },
  { id: 'door', name: 'Pocket Door (Folded)', rarity: 'anomalous', value: 1100, flavor: 'Unfolds into a door. Where it leads depends on who knocks.' },
];

// ---- cosmetics: pure drip, found on shifts, worn on the pixel avatar ----
export interface CosmeticDef {
  id: string;
  name: string;
  rarity: Rarity;
  slot: 'hat' | 'face';
  value: number; // nominal — these are for flexing, not flipping
  flavor: string;
}

export const COSMETICS: CosmeticDef[] = [
  // scrap
  { id: 'paperhat', name: 'Paper Hat', rarity: 'scrap', slot: 'hat', value: 5, flavor: 'Folded from a memo nobody read.' },
  { id: 'tapeglasses', name: 'Taped Glasses', rarity: 'scrap', slot: 'face', value: 5, flavor: 'Repaired four times. Broken five.' },
  { id: 'visitorsticker', name: 'HELLO Visitor Sticker', rarity: 'scrap', slot: 'face', value: 6, flavor: 'The name field is filled in. Not by you.' },
  // common
  { id: 'trafficcone', name: 'Traffic Cone', rarity: 'common', slot: 'hat', value: 20, flavor: 'Found wearing it. No memory of when.' },
  { id: 'partyhat', name: 'Retirement Party Hat', rarity: 'common', slot: 'hat', value: 25, flavor: 'From a retirement party. Nobody retired.' },
  { id: 'shades', name: 'Standard Issue Shades', rarity: 'common', slot: 'face', value: 30, flavor: 'For looking at things you shouldn’t.' },
  // rare
  { id: 'hardhat', name: 'Inspector’s Hardhat', rarity: 'rare', slot: 'hat', value: 120, flavor: 'Passed every inspection. Failed every inspector.' },
  { id: 'monocle', name: 'Auditor’s Monocle', rarity: 'rare', slot: 'face', value: 150, flavor: 'It sees the numbers behind the numbers.' },
  { id: 'beret', name: 'Night Curator’s Beret', rarity: 'rare', slot: 'hat', value: 140, flavor: 'Whoever wears it curates. What, exactly, is unclear.' },
  // anomalous
  { id: 'wardencap', name: 'The Warden’s Cap', rarity: 'anomalous', slot: 'hat', value: 500, flavor: 'The Warden wants it back. The Warden can ask.' },
  { id: 'halo', name: 'EXIT Sign Halo', rarity: 'anomalous', slot: 'hat', value: 650, flavor: 'It hums above your head. It points nowhere.' },
  { id: 'thirdeye', name: 'Third Eye (Adhesive)', rarity: 'anomalous', slot: 'face', value: 700, flavor: 'Peel. Stick. See.' },
];

export const COSMETIC_BY_ID = new Map(COSMETICS.map((c) => [c.id, c]));

/** Roll a cosmetic drop, same rarity weighting as items. */
export function rollCosmetic(rng: () => number, luck = 1): CosmeticDef {
  const weights = COSMETICS.map((c) => {
    let w = RARITY_WEIGHT[c.rarity];
    if (c.rarity === 'rare') w *= luck;
    if (c.rarity === 'anomalous') w *= luck * luck;
    return w;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < COSMETICS.length; i++) {
    r -= weights[i];
    if (r <= 0) return COSMETICS[i];
  }
  return COSMETICS[0];
}

export const ITEM_BY_ID = new Map(ITEMS.map((i) => [i.id, i]));

/** Roll a random item, weighted by rarity, with an optional rarity luck multiplier. */
export function rollItem(rng: () => number, luck = 1): ItemDef {
  const weights = ITEMS.map((i) => {
    let w = RARITY_WEIGHT[i.rarity];
    if (i.rarity === 'rare') w *= luck;
    if (i.rarity === 'anomalous') w *= luck * luck;
    return w;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < ITEMS.length; i++) {
    r -= weights[i];
    if (r <= 0) return ITEMS[i];
  }
  return ITEMS[0];
}
