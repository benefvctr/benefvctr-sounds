# Self-Generating Lo-Fi & Ambient Music — Design Doc

> Status: **design / exploration**. No engine code yet. This document lays out
> the approach, a phased build plan (simple POC → SuperCollider), and the
> musical rules that make generative lo-fi work.

---

## 0. Motivation & reference point

Inspired by **65daysofstatic's _Wreckage Systems_** — a 24/7 generative music
stream. The single most important thing to understand about it:

> **It is not synthesizing cinematic post-rock from pure math in real time.**
> The band recorded a large library of stems, loops, textures, and one-shots,
> then built a **system that arranges, recombines, and processes that material**
> using rules + probability + randomness. The "algorithm" is mostly
> **arrangement logic**, not sound synthesis.

This reframes the problem. We are not trying to invent a composer from scratch.
We are building:

1. A **curated pool of musical material** (chords, drum patterns, textures,
   one-shots — synthesized and/or sampled).
2. A **rules engine** that selects, sequences, and layers that material.
3. A **lo-fi processing chain** that glues randomly-combined material together
   and gives it character.

Lo-fi is an ideal first genre because the form is forgiving (see §2).

---

## 1. Goals & non-goals

### Goals
- Music that **self-generates indefinitely** without looping audibly.
- **Pleasant as background** for a game/app (this repo already holds game SFX:
  `Health.wav`, `Shield_Charge.wav`, `bomb_dropped.wav`).
- An architecture that **scales from a trivial POC to a SuperCollider engine**
  without throwing away the core design (the rules engine is portable; only the
  audio backend changes).
- **Controllable mood / intensity** so the music can react to app state later
  (calm menu vs. tense gameplay).

### Non-goals (for now)
- Real-time DSP research or novel synthesis.
- Beat-matching to user input / adaptive scoring (possible later, not v1).
- Shipping a polished album. We want a *system*, not *tracks*.

---

## 2. Why lo-fi is easy to generate (the musical rules)

The genre is built on forgiving, repetitive structures. These are the rules the
engine encodes:

| Element | Rule of thumb | Why it works generatively |
|---|---|---|
| **Harmony** | Pick from a small pool of jazzy progressions: `ii–V–I`, `I–vi–ii–V`, maj7 / min9 / dom9 voicings, often in a flat key (Eb, Ab, Db). | Almost any random selection from a curated pool sounds "intentional." |
| **Tempo** | 70–90 BPM, with **swing** (~54–62% on offbeats). | Slow + swung = relaxed pocket; tolerant of timing slop. |
| **Drums** | Boom-bap loop: kick on 1 (& syncopated), snare/clap on 2 & 4, swung hats. Slightly **off-grid** and **velocity-randomized**. | Imperfection *is* the aesthetic. |
| **Bass** | Root or root-fifth following the chord, simple rhythm. | One note per chord already sounds good. |
| **Melody** | Sparse. Notes drawn from the chord/scale (pentatonic or Dorian/Mixolydian). Lots of rests. | Sparseness hides "wrong" notes; rests feel deliberate. |
| **Texture** | Pads, Rhodes/EP, vinyl crackle, field recordings, tape hiss. | Continuous texture masks transitions between sections. |
| **Form** | Loop-based. "Composition" = **muting/unmuting layers** and swapping the chord pool over time. | No need to model song structure — just probabilistic arrangement. |

### The "lo-fi" character is mostly *effects*, not notes
This is where the magic hides imperfection:
- **Low-pass filter** (roll off highs, ~ 2–8 kHz, slowly modulated).
- **Tape wobble**: slow pitch LFO (wow & flutter), ~0.3–6 Hz, tiny depth.
- **Vinyl crackle / hiss** layer underneath everything.
- **Bitcrush / sample-rate reduction** (subtle).
- **Sidechain pump**: duck pads/bass on the kick.
- **Saturation / soft clip** for warmth.
- **Reverb + short delay** to blur everything together.

> Design principle: **a mediocre note choice through a great lo-fi chain sounds
> good; a perfect note choice dry sounds sterile.** Invest in the FX chain.

---

## 3. Architecture (backend-agnostic)

The core insight for our phased plan: **separate the _decision layer_ from the
_audio layer_.** The decision layer is portable across every backend.

```
            ┌─────────────────────────────────────────────┐
            │            DECISION LAYER (portable)          │
            │                                               │
            │  - Clock / transport (BPM, bar counter)       │
            │  - Mood/intensity state machine               │
            │  - Harmony generator (chord pool → progression)│
            │  - Pattern generators (drums, bass, melody)   │
            │    using probability + Markov + Euclidean     │
            │  - Arrangement scheduler (layer on/off, fills) │
            └───────────────────────┬───────────────────────┘
                                    │  events: "play note X
                                    │  on instrument Y at time T
                                    │  with velocity V"
                                    ▼
            ┌─────────────────────────────────────────────┐
            │              AUDIO LAYER (swappable)          │
            │                                               │
            │  POC:  Tone.js / Strudel  (Web Audio)         │
            │  v2:   SuperCollider (SynthDefs + samples)    │
            │                                               │
            │  - Instruments / samplers                     │
            │  - The lo-fi FX chain (§2)                     │
            │  - Master bus, limiter                        │
            └───────────────────────────────────────────────┘
```

### Core generative techniques worth using
- **Weighted random selection** — the workhorse. Pick the next chord/pattern
  from a pool with tuned probabilities.
- **Markov chains** — chord-to-chord and pattern-to-pattern transition tables so
  progressions feel coherent, not random.
- **Euclidean rhythms** — distribute N hits over M steps evenly; great for hats
  and percussion variety (`E(3,8)`, `E(5,16)`, etc.).
- **L-systems / generative grammars** — optional, for evolving melodic motifs.
- **LFOs & slow random walks** — drive filter cutoff, wobble, layer density so
  the piece *breathes* over minutes, not bars.
- **Probabilistic events** — "20% chance of a fill at the end of a 4-bar phrase",
  "5% chance to drop the drums for one bar".

---

## 4. Phased build plan

### Phase 0 — POC (target: a weekend) ✅ *recommended starting point*
**Goal:** prove the loop is endless and pleasant. Smallest thing that makes sound.

- **Stack:** browser, **Tone.js** (or Strudel for terser pattern code).
  - Rationale: zero install, instant audible feedback, runs forever in a tab,
    trivially embeddable next to a web/game build later. Fastest path to *hearing*
    the algorithm so we can tune by ear.
- **Scope:**
  - Fixed BPM (~80) + swing.
  - One chord pool (e.g. 4 maj7/min9 progressions), weighted-random selection.
  - One drum pattern with velocity randomization + Euclidean hats.
  - A Rhodes-ish pad/EP voice for chords, simple root bass.
  - Lo-fi chain: low-pass + vinyl-crackle loop + a touch of bitcrush + reverb.
  - Layer scheduler: mute/unmute melody & drums on 4/8-bar boundaries.
- **Deliverable:** a single `index.html` you open and it plays forever.
- **Success criteria:** can listen for 10+ minutes without an obvious loop point
  or anything jarring.

### Phase 1 — "Decent" (1–2 weeks)
Build out the decision layer properly (still Tone.js, or already porting to SC):
- Markov chord/pattern transitions.
- Multiple chord pools tied to a **mood state machine** (calm / warm / melancholy).
- Probabilistic drum fills, bar drops, ghost notes.
- Proper FX: tape wobble (pitch LFO), sidechain pump, saturation, slow filter
  automation, send reverb + delay.
- Bass/melody constrained to scale degrees of the current chord.
- Slow macro evolution (density/brightness random-walk over minutes).

### Phase 2 — SuperCollider engine (the versatile long-term home)
**Why SuperCollider:** maximum DSP power, real synthesis (not just samples),
sample-accurate scheduling, runs headless as a long-lived audio server, and the
language (`sclang`) is purpose-built for exactly this kind of pattern/algorithmic
composition. It's the right "forever" engine; we just don't *start* there because
the feedback loop is slower than the browser.

Structure:
- **SynthDefs** for each voice: EP/Rhodes, pad, sub bass, drum synths (or sampled
  one-shots via `PlayBuf`), plus the lo-fi FX as SynthDefs on busses.
- **Patterns (`Pbind` / `Pdef` / `Pseq` / `Pwrand`)** express the decision layer
  natively — weighted random, Markov (via `Pfsm`), Euclidean (`Bjorklund`).
- **`Tdef`/routines** for the macro arrangement clock and mood transitions.
- Headless via `sclang script.scd` so it can run as a service / be recorded.
- Port the *rules* designed in Phase 0/1 — the chord pools, weights, and
  transition tables carry over directly; only the syntax changes.

> Optional bridge: prototype patterns in **Strudel/TidalCycles** first — its
> pattern algebra is the most expressive of all and concepts map cleanly to SC.

### Phase 3 — Integration & reactivity (later)
- Expose mood/intensity as a parameter the host app can set (OSC into SC, or
  JS calls into Tone.js) so gameplay state drives the music.
- Optional: offline-render long stems for platforms where a live engine is
  overkill.

---

## 5. Difficulty assessment (honest)

| Level | What you get | Effort |
|---|---|---|
| **Toy / Phase 0** | Random maj7 chords + drum loop + vinyl noise, endless | A weekend |
| **Decent / Phase 1** | Curated progressions, swing, fills, arrangement, full FX — genuinely pleasant background | 1–2 weeks |
| **SuperCollider / Phase 2** | Versatile, synthesized, headless, parameterizable engine | +2–4 weeks porting & polish |
| **_Wreckage_-tier** | Curated recorded stem library, sophisticated transitions, mood states, pro mixing | Months + lots of source material |

The jump from **Toy → Decent** captures ~90% of the perceived quality and is very
achievable. SuperCollider is the long-term payoff, not the place to learn the
musical rules.

---

## 6. Source-material strategy

Two ways to feed the engine; we'll likely mix both:
- **Synthesized** — generate EP/pad/bass/drums from oscillators (pure
  SuperCollider). Most flexible, no licensing concerns, infinite variation.
- **Sampled** — curated one-shots and loops (drum hits, vinyl crackle, field
  recordings, instrument samples). Fastest route to authentic lo-fi timbre.
  - The existing game SFX in this repo are *not* musical material, but the same
    pipeline (load `.wav`, trigger via the audio layer) applies.
  - Vinyl crackle / tape hiss textures are the highest-leverage samples to source
    first — they do enormous work gluing everything together.

---

## 7. Open questions / decisions to revisit
- **Distribution:** does this run live in the app, or do we bake long stems?
  (Live = Tone.js in-page or SC service; baked = render once.)
- **Sample sourcing:** record our own crackle/textures vs. license a pack?
- **Mood taxonomy:** what moods does the host app actually need to request?
- **Strudel detour:** worth prototyping patterns in Strudel before SC, or go
  straight from Tone.js POC → SC?

---

## 8. Recommended next step
Build the **Phase 0 Tone.js POC** (single `index.html`) so we can hear the
algorithm and tune the musical rules by ear. Everything we learn — chord pools,
weights, swing amount, FX settings — transfers directly into the SuperCollider
engine in Phase 2.
