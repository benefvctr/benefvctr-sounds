// The Facility. Six wings, each with its own danger/loot profile, resident
// entities (casualties get attributed to them), and a pool of rooms. A shift
// is assigned one wing per night; rooms are drawn from that wing's pool.
//
//                    ┌─ SURFACE ANNEX ──────── hazard LOW
//                    ├─ OPERATIONS BLOCK ───── hazard STANDARD
//                    ├─ MAINTENANCE WARRENS ── hazard ELEVATED
//                    ├─ RESEARCH WING ──────── hazard ELEVATED+
//                    ├─ CONTAINMENT HALLS ──── hazard SEVERE
//                    └─ THE UNDERSTRUCTURE ─── hazard CATASTROPHIC (rare)

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
  danger: number; // base death pressure for the room
  loot: number; // base loot chance multiplier
  vote?: { prompt: string; a: VoteOption; b: VoteOption };
}

export interface EntityDef {
  name: string;
  lines: string[]; // death attributions
}

export interface WingDef {
  id: string;
  name: string;
  tag: string; // one-line descriptor for the map
  danger: number; // wing-wide multiplier
  loot: number;
  weight: number; // odds of being tonight's assignment
  entities: EntityDef[];
  rooms: RoomDef[];
}

export function hazardTier(danger: number): string {
  if (danger <= 0.8) return 'LOW';
  if (danger <= 1.05) return 'STANDARD';
  if (danger <= 1.3) return 'ELEVATED';
  if (danger <= 1.55) return 'SEVERE';
  return 'CATASTROPHIC';
}

export const WINGS: WingDef[] = [
  // ════════════════════════════════════════════════════ SURFACE ANNEX
  {
    id: 'surface',
    name: 'Surface Annex',
    tag: 'The part of the building that admits to existing.',
    danger: 0.7,
    loot: 0.85,
    weight: 22,
    entities: [
      {
        name: 'the Receptionist',
        lines: ['was asked to take a seat. Forever.', 'is on hold now. The music never ends.', 'had an appointment after all.'],
      },
      {
        name: 'Custodian-Unit 9',
        lines: ['was filed under SPILLS', 'has been mopped into the architecture', 'left a streak. The streak is gone too.'],
      },
    ],
    rooms: [
      {
        id: 'lobby',
        name: 'Front Lobby',
        intro: 'The visitor log is open. Tonight’s date is already filled in, in your handwriting.',
        danger: 0.8,
        loot: 0.9,
        vote: {
          prompt: 'The log wants a signature. The pen is warm.',
          a: { word: 'SIGN', label: 'Sign the log', dangerMod: 1.5, lootMod: 1.8, result: 'The squad signs. The desk bell dings approvingly. A welcome basket is provided.' },
          b: { word: 'IGNORE', label: 'Walk past', dangerMod: 0.7, lootMod: 0.8, result: 'Nobody signs. The pen rolls off the desk and follows at a polite distance.' },
        },
      },
      {
        id: 'mailroom',
        name: 'Mailroom',
        intro: 'Every package is addressed to "CURRENT OCCUPANT". You are all current occupants.',
        danger: 0.7,
        loot: 1.1,
        vote: {
          prompt: 'One parcel in the dead-letter bin is breathing slowly.',
          a: { word: 'OPEN', label: 'Open it', dangerMod: 1.6, lootMod: 1.9, result: 'The parcel exhales and unpacks itself. Its contents are grateful and valuable.' },
          b: { word: 'RETURN', label: 'Return to sender', dangerMod: 0.6, lootMod: 0.9, result: 'Marked RETURN TO SENDER. The bin sighs. Somewhere upstairs, a door knocks itself.' },
        },
      },
      {
        id: 'hr',
        name: 'HR Suite',
        intro: 'The complaint box is full. The complaints are about you. They are dated next week.',
        danger: 0.6,
        loot: 0.8,
      },
      {
        id: 'parking',
        name: 'Parking Sublevel 1',
        intro: 'Every space is reserved. Every car is the same car.',
        danger: 0.8,
        loot: 0.95,
      },
      {
        id: 'breakroom',
        name: 'Break Room B',
        intro: 'The vending machine is stocked with items that have employee names on them.',
        danger: 0.6,
        loot: 1.2,
      },
      {
        id: 'cafeteria',
        name: 'Night Cafeteria',
        intro: 'Every table is set for one. Every chair faces the door.',
        danger: 0.7,
        loot: 0.9,
      },
      {
        id: 'loading',
        name: 'Loading Dock 7',
        intro: 'The dock doors are open. Nothing was scheduled for delivery tonight.',
        danger: 0.9,
        loot: 1.1,
        vote: {
          prompt: 'A sealed crate is still on the lift. It is ticking, politely.',
          a: { word: 'OPEN', label: 'Open the crate', dangerMod: 1.6, lootMod: 1.8, result: 'The crate is opened. Something inside says "finally" and leaves. The packing material is valuable.' },
          b: { word: 'LEAVE', label: 'Leave it', dangerMod: 0.7, lootMod: 0.8, result: 'The crate is left alone. As the squad walks away, the ticking matches their footsteps.' },
        },
      },
    ],
  },

  // ════════════════════════════════════════════════════ OPERATIONS BLOCK
  {
    id: 'operations',
    name: 'Operations Block',
    tag: 'Where the paperwork happens. To people.',
    danger: 1.0,
    loot: 1.0,
    weight: 22,
    entities: [
      {
        name: 'the Floor Manager',
        lines: ['was promoted. Posthumously.', 'is in a meeting now. The meeting has no end time.', 'received a performance review in red ink.'],
      },
      {
        name: 'the Unpaid Intern',
        lines: ['was delegated', 'is gaining valuable experience somewhere unreachable', 'will be credited in the next life'],
      },
    ],
    rooms: [
      {
        id: 'openplan',
        name: 'Open-Plan Office',
        intro: 'Two hundred desks. One phone is ringing. It is yours.',
        danger: 1.0,
        loot: 1.0,
        vote: {
          prompt: 'The phone keeps ringing. The caller ID says THIS ROOM.',
          a: { word: 'ANSWER', label: 'Answer it', dangerMod: 1.7, lootMod: 2.0, result: 'Someone answers. A voice reads out coordinates and an apology. Both prove valuable.' },
          b: { word: 'UNPLUG', label: 'Unplug it', dangerMod: 0.7, lootMod: 0.9, result: 'The phone is unplugged. It rings twice more out of spite, then sulks.' },
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
        id: 'copyroom',
        name: 'Copy Room',
        intro: 'The copier is running. Nobody queued a job. The output tray holds pictures of the squad, arriving.',
        danger: 1.1,
        loot: 1.2,
      },
      {
        id: 'atrium',
        name: 'Atrium of the Benefactor',
        intro: 'A portrait hangs here. Its eyes are painted closed tonight. That is new.',
        danger: 1.1,
        loot: 1.4,
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
        id: 'incinerator',
        name: 'Records Incinerator',
        intro: 'It burns around the clock. The smoke spells words the squad agrees not to read aloud.',
        danger: 1.2,
        loot: 1.3,
      },
    ],
  },

  // ════════════════════════════════════════════════════ MAINTENANCE WARRENS
  {
    id: 'maintenance',
    name: 'Maintenance Warrens',
    tag: 'The building’s guts. Something else’s too.',
    danger: 1.15,
    loot: 1.15,
    weight: 20,
    entities: [
      {
        name: 'the Thing in the Vents',
        lines: ['heard a noise in the ceiling and is now a noise in the ceiling', 'was carried away. Itemized: one (1) employee.', 'is circulating'],
      },
      {
        name: 'Custodian-Unit 9',
        lines: ['was deep-cleaned', 'has been scheduled for disposal. Past tense.', 'left no residue. Unit 9 is thorough.'],
      },
    ],
    rooms: [
      {
        id: 'crawl',
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
        id: 'boiler',
        name: 'Boiler Deck',
        intro: 'The boiler is cold. The heat is coming from somewhere else.',
        danger: 1.3,
        loot: 1.3,
        vote: {
          prompt: 'The pressure gauge is climbing. The release lever is labeled DO NOT.',
          a: { word: 'VENT', label: 'Pull the lever', dangerMod: 1.7, lootMod: 1.9, result: 'The lever is pulled. The building exhales for the first time in years. Loose valuables rain from the rafters.' },
          b: { word: 'WAIT', label: 'Let it climb', dangerMod: 1.0, lootMod: 1.0, result: 'Nobody touches it. The needle settles just under the red, embarrassed about the drama.' },
        },
      },
      {
        id: 'toolcage',
        name: 'Tool Cage',
        intro: 'Custodian-Unit 9 stands in the cage doorway, holding a mop it does not need.',
        danger: 1.2,
        loot: 1.5,
        vote: {
          prompt: 'Unit 9 will not move. Its chassis is full of confiscated valuables.',
          a: { word: 'FIGHT', label: 'Dismantle it', dangerMod: 1.9, lootMod: 2.3, result: 'The squad swarms it. Unit 9 is dismantled. Its parts are excellent. Its mop fights on alone for a while.' },
          b: { word: 'FLEE', label: 'Back away slowly', dangerMod: 0.6, lootMod: 0.7, result: 'The squad backs out. Unit 9 mops the spot where they stood, erasing the visit.' },
        },
      },
      {
        id: 'cistern',
        name: 'The Cistern',
        intro: 'Black water, perfectly still. The reflection shows one extra person.',
        danger: 1.3,
        loot: 1.4,
      },
      {
        id: 'freight',
        name: 'Freight Tunnels',
        intro: 'Rails in the floor. The last cart through was carrying something that scratched the walls. Recently.',
        danger: 1.1,
        loot: 1.2,
      },
    ],
  },

  // ════════════════════════════════════════════════════ RESEARCH WING
  {
    id: 'research',
    name: 'Research Wing',
    tag: 'Peer review is conducted by the specimens.',
    danger: 1.25,
    loot: 1.4,
    weight: 18,
    entities: [
      {
        name: 'Subject 11',
        lines: ['volunteered for the study, retroactively', 'is now a control group of one', 'has been cited. The citation bled.'],
      },
      {
        name: 'the Resident Doctor',
        lines: ['was seen by the doctor. The doctor liked what it saw.', 'has been prescribed elsewhere', 'is feeling much better, says the doctor. The doctor says.'],
      },
    ],
    rooms: [
      {
        id: 'hydroponics',
        name: 'Hydroponics Annex',
        intro: 'The grow lights hum a tune. The plants lean in to hear it.',
        danger: 0.9,
        loot: 1.2,
      },
      {
        id: 'specimens',
        name: 'Specimen Library',
        intro: 'Jars to the ceiling. Each label is a name. One jar is empty and labeled in pencil: RESERVED.',
        danger: 1.3,
        loot: 1.5,
        vote: {
          prompt: 'The specimens press against the glass as the squad passes. Feeding time was hours ago.',
          a: { word: 'FEED', label: 'Feed them', dangerMod: 1.3, lootMod: 1.8, result: 'Rations are sacrificed. The jars settle, content. One coughs up a tip.' },
          b: { word: 'STARVE', label: 'Keep walking', dangerMod: 1.6, lootMod: 1.1, result: 'No food is given. The jars remember. Jars are patient.' },
        },
      },
      {
        id: 'cleanroom',
        name: 'Clean Room',
        intro: 'White, sealed, spotless. The sign says STERILE. Something inside says "almost".',
        danger: 1.2,
        loot: 1.6,
        vote: {
          prompt: 'The airlock is cycling on its own. Whatever is inside has been clean long enough.',
          a: { word: 'BREAK', label: 'Break the seal', dangerMod: 1.8, lootMod: 2.2, result: 'The seal breaks. The clean room is harvested. Sterility, it turns out, was the container.' },
          b: { word: 'HOLD', label: 'Hold the door', dangerMod: 0.8, lootMod: 0.9, result: 'The squad holds the airlock shut until it stops trying. A thank-you note slides under the door.' },
        },
      },
      {
        id: 'theater',
        name: 'Observation Theater',
        intro: 'Rows of seats face an empty stage. Mid-performance applause is in progress.',
        danger: 1.3,
        loot: 1.3,
      },
      {
        id: 'prototype',
        name: 'Prototype Lab',
        intro: 'Something half-built is on the bench. It is finishing itself.',
        danger: 1.4,
        loot: 1.7,
        vote: {
          prompt: 'The prototype stands up. It has opinions about being observed.',
          a: { word: 'FIGHT', label: 'Put it down', dangerMod: 2.0, lootMod: 2.4, result: 'The squad strikes first. The prototype comes apart into components science has no names for. Yet.' },
          b: { word: 'FLEE', label: 'Evacuate the lab', dangerMod: 0.7, lootMod: 0.8, result: 'The squad evacuates. Behind them, the prototype completes itself and begins to clap.' },
        },
      },
    ],
  },

  // ════════════════════════════════════════════════════ CONTAINMENT HALLS
  {
    id: 'containment',
    name: 'Containment Halls',
    tag: 'Hazard pay applies. Hazard collects.',
    danger: 1.45,
    loot: 1.7,
    weight: 12,
    entities: [
      {
        name: 'the Warden',
        lines: ['has been detained indefinitely', 'broke a rule nobody had written yet', 'is in solitary now. The Warden insists it is for their own good.'],
      },
      {
        name: 'Inmate Zero',
        lines: ['traded places with Inmate Zero. The paperwork went through instantly.', 'is serving someone else’s sentence', 'was recruited'],
      },
    ],
    rooms: [
      {
        id: 'cellblock',
        name: 'Cell Block C',
        intro: 'Every cell is locked from the inside. Every occupant is gone. Every bed is made.',
        danger: 1.4,
        loot: 1.6,
        vote: {
          prompt: 'A brass plate by the last cell reads: DO NOT READ THIS ALOUD. Someone is already sounding it out.',
          a: { word: 'READ', label: 'Read it aloud', dangerMod: 1.9, lootMod: 2.2, result: 'The words are read. The hall holds its breath, then pays up — coins from the dark, applauding.' },
          b: { word: 'COVER', label: 'Cover the plate', dangerMod: 0.7, lootMod: 1.0, result: 'A jacket goes over the plate. The plate mumbles through the fabric, defeated.' },
        },
      },
      {
        id: 'vaultante',
        name: 'Vault Antechamber',
        intro: 'The vault door is a meter of steel. It is ajar. The dust says: from the inside.',
        danger: 1.5,
        loot: 1.9,
        vote: {
          prompt: 'Past the gap: shelves. On the shelves: everything anyone ever lost here.',
          a: { word: 'CRACK', label: 'Go in', dangerMod: 1.9, lootMod: 2.4, result: 'The squad slips inside. The vault was a mouth once, but it has retired. Pockets are filled.' },
          b: { word: 'RESPECT', label: 'Leave it ajar', dangerMod: 0.8, lootMod: 1.0, result: 'The squad nods to the vault and moves on. The vault, disarmed by manners, leaves a tip by the door.' },
        },
      },
      {
        id: 'softrooms',
        name: 'The Soft Rooms',
        intro: 'Padded floor to ceiling. Recent dents in the padding. Tall ones.',
        danger: 1.5,
        loot: 1.5,
      },
      {
        id: 'inventory',
        name: 'Inventory of Anomalies',
        intro: 'Numbered shelves. Half the numbers are missing. So are half the shelves. The items remain, floating politely.',
        danger: 1.4,
        loot: 2.0,
      },
      {
        id: 'wardenoffice',
        name: 'Warden’s Office',
        intro: 'The desk faces the wall. The chair faces the desk. Someone is sitting in neither, watching both.',
        danger: 1.5,
        loot: 1.7,
      },
    ],
  },

  // ════════════════════════════════════════════════════ THE UNDERSTRUCTURE
  {
    id: 'understructure',
    name: 'The Understructure',
    tag: 'The building stops. The floors do not.',
    danger: 1.7,
    loot: 2.1,
    weight: 6,
    entities: [
      {
        name: 'the Below',
        lines: ['went down to check on a noise. The noise is satisfied.', 'is below now', 'found the bottom. The bottom found them back.'],
      },
      {
        name: 'Something Wearing a Lanyard',
        lines: ['had their badge verified. Permanently.', 'failed a credentials check', 'was escorted. Direction: unclear.'],
      },
    ],
    rooms: [
      {
        id: 'stairwell',
        name: 'Stairwell Zero',
        intro: 'The stairs go down further than the building does.',
        danger: 1.4,
        loot: 1.7,
      },
      {
        id: 'deeplobby',
        name: 'The Deep Lobby',
        intro: 'An exact copy of the front lobby, four hundred meters down. The visitor log is full. Every name is crossed out.',
        danger: 1.6,
        loot: 1.8,
      },
      {
        id: 'filingpit',
        name: 'Pit of Filing',
        intro: 'A shaft lined with cabinets, descending past the light. Somewhere far below, a drawer closes.',
        danger: 1.5,
        loot: 2.0,
      },
      {
        id: 'doorisnt',
        name: 'The Door That Isn’t',
        intro: 'A door stands free in the middle of the corridor. No wall. It is locked anyway.',
        danger: 1.6,
        loot: 1.9,
        vote: {
          prompt: 'Knocking is an option. The door has been waiting so long.',
          a: { word: 'KNOCK', label: 'Knock twice', dangerMod: 2.0, lootMod: 2.5, result: 'Two knocks. The door opens onto a room that has been saving things for whoever finally knocked.' },
          b: { word: 'WALK', label: 'Walk around it', dangerMod: 0.9, lootMod: 1.0, result: 'The squad walks around. Through the keyhole, something watches them go, and starts waiting again.' },
        },
      },
      {
        id: 'gallery',
        name: 'Lights-Out Gallery',
        intro: 'A long hall of display cases. The lights die one by one ahead of the squad, like a courtesy.',
        danger: 1.7,
        loot: 2.0,
        vote: {
          prompt: 'Something is pacing the squad behind the cases. It is carrying a flashlight. Yours.',
          a: { word: 'FIGHT', label: 'Rush it', dangerMod: 2.1, lootMod: 2.5, result: 'The squad rushes the dark. The dark, outnumbered for once, drops everything it was carrying. Everything.' },
          b: { word: 'FLEE', label: 'Run for the far door', dangerMod: 1.0, lootMod: 0.9, result: 'The squad runs. The thing behind the cases keeps pace the whole way, politely, then waves the flashlight goodbye.' },
        },
      },
    ],
  },
];

/** Weighted wing pick; avoids assigning the same wing twice in a row. */
export function pickWing(rng: () => number, lastId?: string): WingDef {
  const pool = WINGS.filter((w) => w.id !== lastId || WINGS.length === 1);
  const total = pool.reduce((a, w) => a + w.weight, 0);
  let r = rng() * total;
  for (const w of pool) {
    r -= w.weight;
    if (r <= 0) return w;
  }
  return pool[0];
}
