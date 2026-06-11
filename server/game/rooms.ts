// Shift "rooms" — the encounter deck. Each shift draws a handful of these.
// A room can carry a chat vote: two options that trade danger against loot.

export interface VoteOption {
  word: string; // what chat types
  label: string;
  dangerMod: number; // multiplies room danger
  lootMod: number; // multiplies room loot chance
  result: string; // feed line when this option wins
}

export interface RoomDef {
  id: string;
  name: string;
  intro: string;
  danger: number; // base death pressure for the room (0..1-ish scale factor)
  loot: number; // base loot chance multiplier
  vote?: { prompt: string; a: VoteOption; b: VoteOption };
}

export const ROOMS: RoomDef[] = [
  {
    id: 'loading',
    name: 'Loading Dock 7',
    intro: 'The dock doors are open. Nothing was scheduled for delivery tonight.',
    danger: 0.8,
    loot: 1.0,
    vote: {
      prompt: 'A sealed crate is still on the lift. It is ticking, politely.',
      a: { word: 'OPEN', label: 'Open the crate', dangerMod: 1.6, lootMod: 1.8, result: 'The crate is opened. Something inside says "finally" and leaves. The packing material is valuable.' },
      b: { word: 'LEAVE', label: 'Leave it', dangerMod: 0.7, lootMod: 0.8, result: 'The crate is left alone. As the squad walks away, the ticking matches their footsteps.' },
    },
  },
  {
    id: 'breakroom',
    name: 'Break Room B',
    intro: 'The vending machine is stocked with items that have employee names on them.',
    danger: 0.6,
    loot: 1.2,
  },
  {
    id: 'sublevel3',
    name: 'Sublevel 3',
    intro: 'The lights down here run on a schedule nobody set.',
    danger: 1.2,
    loot: 1.3,
    vote: {
      prompt: 'The lights just died. The stairwell is somewhere to the left.',
      a: { word: 'PUSH', label: 'Push through dark', dangerMod: 1.7, lootMod: 1.9, result: 'The squad pushes through. The dark is full of shelves, and the shelves are full.' },
      b: { word: 'HOLD', label: 'Hold for the lights', dangerMod: 0.8, lootMod: 0.9, result: 'The squad holds position. The lights return, embarrassed about the whole thing.' },
    },
  },
  {
    id: 'archive',
    name: 'The Archive',
    intro: 'Filing cabinets to the ceiling. Some drawers are breathing.',
    danger: 1.0,
    loot: 1.5,
    vote: {
      prompt: 'One cabinet is labeled with today’s date. It is locked.',
      a: { word: 'BREACH', label: 'Pry it open', dangerMod: 1.5, lootMod: 2.0, result: 'The cabinet gives. Inside: everything the facility planned to forget.' },
      b: { word: 'SNEAK', label: 'Move on quietly', dangerMod: 0.7, lootMod: 1.0, result: 'The squad slips past. Behind them, the lock clicks open on its own. Nobody looks back.' },
    },
  },
  {
    id: 'atrium',
    name: 'Atrium of the Benefactor',
    intro: 'A portrait hangs here. Its eyes are painted closed tonight. That is new.',
    danger: 1.1,
    loot: 1.4,
  },
  {
    id: 'maintenance',
    name: 'Maintenance Crawl',
    intro: 'Pipes overhead carry something heavier than water.',
    danger: 0.9,
    loot: 1.1,
    vote: {
      prompt: 'A valve is leaking light. Actual light. It pools on the floor.',
      a: { word: 'BOTTLE', label: 'Bottle the light', dangerMod: 1.4, lootMod: 1.7, result: 'The light is bottled. It seems relieved.' },
      b: { word: 'SEAL', label: 'Seal the valve', dangerMod: 0.6, lootMod: 0.8, result: 'The valve is sealed. Facility pressure normalizes. Somewhere, an alarm stops that no one had noticed.' },
    },
  },
  {
    id: 'cafeteria',
    name: 'Night Cafeteria',
    intro: 'Every table is set for one. Every chair faces the door.',
    danger: 0.7,
    loot: 0.9,
  },
  {
    id: 'server',
    name: 'Cold Server Hall',
    intro: 'Racks of machines computing something nobody assigned. ETA: soon.',
    danger: 1.3,
    loot: 1.6,
    vote: {
      prompt: 'A terminal is logged in as YOU. There is one unsent message.',
      a: { word: 'SEND', label: 'Hit send', dangerMod: 1.8, lootMod: 2.1, result: 'The message is sent. Every machine in the hall spins down to listen. Tribute is left at the terminal.' },
      b: { word: 'WIPE', label: 'Wipe it', dangerMod: 0.8, lootMod: 1.0, result: 'The draft is deleted. The terminal logs out. The room pretends nothing happened.' },
    },
  },
  {
    id: 'stairwell',
    name: 'Stairwell Zero',
    intro: 'The stairs go down further than the building does.',
    danger: 1.4,
    loot: 1.7,
  },
  {
    id: 'garden',
    name: 'Hydroponics Annex',
    intro: 'The grow lights hum a tune. The plants lean in to hear it.',
    danger: 0.8,
    loot: 1.2,
  },
];
