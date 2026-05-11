# 🎲 Open Dice DnD

A 3D physics-based dice rolling engine built with Three.js and Cannon-es. Designed for tabletop tools, RPG apps, and game UIs.

## ✨ Features

- 🎯 Physics-based rolling with authoritative pre-determined results (server-friendly)
- 🎨 All standard RPG dice — d4, d6, d8, d10, d12, d20, d100
- 🎬 Smooth animations + shadow rendering
- 🎭 Mid-roll dice additions, multi-batch concurrent rolls
- 🖼️ Custom SVG face decals (per face value, with scale/offset/rotation)
- 🔊 Collision sound effects with impact-based volume
- 🎆 9 spell-school damage-type effects: fire, frost, electric, acid, psychic, necrotic, radiant, thunder, slashing (plus blood splat)
- 🌟 7 settled-state effects: glow, scale pulse, halo ring, screen shake, slow-mo zoom, particle burst, confetti
- 🧠 Declarative rule-based effect composition (match by type/value, play combos)
- 🔒 Secret roll mode
- 🌈 Per-die colors (body, text, background)
- 📦 Lightweight, modular, no UI framework lock-in

---

## 📦 Installation

```bash
npm install open-dice-dnd
```

`three` and `cannon-es` are peer dependencies — install them too if you don't already have them.

```bash
npm install three cannon-es
```

---

## 🚀 Quick Start

```js
import { DiceRoller } from 'open-dice-dnd';

const diceRoller = new DiceRoller({
    container: document.getElementById('dice-container'),
    onRollComplete: (total) => console.log('Total:', total),
});

await diceRoller.roll([
    { dice: 'd20', rolled: 15 },
    { dice: 'd6',  rolled: 4 },
]);
```

---

## 📖 API

### Constructor

```js
new DiceRoller({
    container,           // HTMLElement (required)
    width,               // number, defaults to container width
    height,              // number, defaults to container height
    throwSpeed,          // number, default 15
    throwSpin,           // number, default 20
    onRollComplete,      // (total, result) => void
    onBatchSettled,      // (batch, result, roller) => void
    sounds,              // string[] of audio URLs (collision sfx)
    soundVolume,         // number 0..1, default 1
    effects,             // rule list — see "Settled Effects"
})
```

### Roll methods

| Method | Returns | Behavior |
|---|---|---|
| `roll(diceConfig)` | `Promise<number>` (total) | Clear scene, roll fresh batch |
| `addDice(diceConfig)` | `Promise<{total, variances, results}>` | Add dice to active or settled scene, independent batch |
| `reset()` | `Promise<void>` | Fade out and clear all dice |
| `getCurrentResults()` | `{total, variances, results}` | Re-evaluate every die in the scene |
| `isRolling()` | `boolean` | True if any batch is still unresolved |
| `setEffectRules(rules)` | `void` | Replace settled-effect rules at runtime |
| `preloadDecals(srcs)` | `Promise` | Cache decal images before first roll |
| `setThrowSpeed(n)` | `void` | |
| `setThrowSpin(n)` | `void` | |
| `destroy()` | `void` | Tear down WebGL, listeners, physics |

### Dice config

Each entry in the `diceConfig` array passed to `roll()` / `addDice()`:

```js
{
    dice: 'd20',                 // 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100'
    rolled: 18,                  // optional target value (authoritative)
    diceColor: 0xff6b6b,         // optional numeric hex — body color
    textColor: '#ffffff',        // optional hex string — face text color
    backgroundColor: '#4ecdc4',  // optional hex string — face background color
    isSecret: false,             // optional — replace numbers with '?'
    decals: {                    // optional — see Decals section
        '1': { src: '/sword.svg', scale: 0.7 },
    },
    effects: [                   // optional — roll-time effects (fire, frost, etc.)
        effects.fire(),
    ],
}
```

### Result shape

`onRollComplete(total, result)` and `addDice()`/`getCurrentResults()` return:

```js
{
    total: 47,           // authoritative sum (predetermined target values)
    variances: [         // dice whose visible face differs from authoritative
        { type: 'd6', expected: 6, visible: 4 },
    ],
    results: [           // per-die details
        { type: 'd6', value: 6, visible: 4, target: 6 },
        ...
    ],
}
```

**Authoritative vs. visible**: the engine pre-simulates each roll in an isolated physics world to determine which face will land up, then paints the target value onto that face. The `total` is always the predetermined sum. If a die gets bumped (e.g. by `addDice()`) and lands on a different face, that's reported as a *variance* but the total is unchanged. This keeps results consistent across clients with different screen aspect ratios.

---

## 🖼️ Decals

Replace number text on specific face values with SVG images.

```js
// Optional preload — eliminates "text first, decal swap" on first roll
await diceRoller.preloadDecals([
    '/icons/sword.svg',
    '/icons/shield.svg',
]);

await diceRoller.roll([{
    dice: 'd6',
    rolled: 4,
    decals: {
        '1': { src: '/icons/sword.svg', scale: 0.7, offsetX: 0, offsetY: 0, rotation: 0 },
        '2': { src: '/icons/shield.svg', scale: 0.9 },
    },
}]);
```

Keys are face *values* (as strings), not face indices. Decals follow the target-rolled face-swap automatically. For d4, the lookup is per-corner (a face shows three corner values); for every other die, it's per-face.

---

## 🔊 Sounds

Pass an array of audio URLs and the engine plays a random one per dice collision, with volume scaled to impact velocity. WAV and OGG both work.

```js
new DiceRoller({
    container,
    sounds: ['/sfx/click.ogg', '/sfx/clack.ogg', '/sfx/clock.ogg'],
    soundVolume: 0.6,
});
```

Browser autoplay restrictions mean the *first* roll on page load may be silent until the user clicks once.

---

## 🎆 Animation Effects

Two kinds of effect:

1. **Roll-time effects** — attached via `dice.effects: [...]` per-die config. Run while the die is in motion (fire, frost, etc.), terminate cleanly after settle.
2. **Settled-state effects** — declared via `effects: [...]` constructor option as a rules list. Played when a die settles, based on its result (crit-hit glow, variance amber, etc.).

### Roll-time damage-type effects

All ten are roll-time effects with `scope: 'die'`. Drop into any die's `effects: [...]`.

```js
import { effects } from 'open-dice-dnd';

diceRoller.roll([
    { dice: 'd20', effects: [effects.fire()] },
    { dice: 'd6',  effects: [effects.frost(), effects.bloodSplat()] },
    { dice: 'd8',  effects: [effects.electric()] },
    { dice: 'd10', effects: [effects.psychic()] },
    { dice: 'd12', effects: [effects.necrotic()] },
]);
```

| Effect | Description |
|---|---|
| `fire(options)` | Flickering flame puff particles rising from die, color shifts white-hot → yellow → orange → red ember |
| `frost(options)` | Snowflake crystals + cold mist + 3D ice shards flying outward; leaves dendrite frost patches on floor |
| `electric(options)` | Forked lightning bolts arcing outward during roll; **post-settle, arcs between nearby settled electric dice for ~2-3 s** |
| `acidSplat(options)` | Bright green drips → puddle decals on floor → fizzing smoke wisps |
| `bloodSplat(options)` | Deep red drips → irregular splat decals that linger then fade |
| `psychic(options)` | Multi-color drifting glow orbs + expanding concentric ring "thought waves" |
| `necrotic(options)` | Sine-curving dark purple waveforms + glowing soul motes pulled INWARD into the die |
| `radiant(options)` | Golden god-rays radiating outward + 4-point star sparkles + pulsing floor halo |
| `thunder(options)` | Heavy concussive shockwave rings + warm dust drift |
| `slashing(options)` | Zoro-style sword strikes — single / X / Z patterns, tapered red blade silhouettes |

### Settled-state effects

Use the `effects: [...]` constructor option with match-rules:

```js
import { DiceRoller, effects, presets } from 'open-dice-dnd';

new DiceRoller({
    container,
    effects: [
        { match: { type: 'd20', visible: 20 }, play: [
            effects.glow({ color: 0xfacc15 }),
            effects.haloRing(),
            effects.confetti(),
            effects.slowMoZoom(),
        ]},
        { match: { type: 'd20', visible: 1 }, play: [
            effects.glow({ color: 0xef4444 }),
            effects.screenShake({ intensity: 0.6 }),
        ]},
        { match: 'clean',    play: effects.glow({ color: 0x4ade80 }) },
        { match: 'variance', play: effects.glow({ color: 0xfb923c }) },
    ],
});
```

**`match` clause** accepts:
- `'any'` (or omitted) — always match
- `'clean'` — visible face === authoritative value
- `'variance'` — divergence
- `{ type, visible, value, target }` — partial object match
- `(perDieResult, die) => boolean` — custom predicate

**Each effect spec** has `scope: 'die'` (per-die) or `scope: 'once'` (one per batch, e.g. screen-shake / slow-mo zoom).

#### Settled-state primitives

| Effect | Description |
|---|---|
| `glow({ color, duration, intensity })` | Per-face emissive pulse |
| `scalePulse({ peak, duration })` | Mesh scale bounce |
| `haloRing({ color, duration, startRadius, endRadius })` | Expanding torus on the floor |
| `screenShake({ intensity, duration })` | Camera offset decay (scope: 'once') |
| `slowMoZoom({ duration, zoomLevel })` | Camera focus + zoom hold (scope: 'once') |
| `particleBurst({ color, count })` | Gradient-sprite spark burst |
| `confetti({ colors, count })` | Rotating multicolor rectangles |

#### Presets

```js
import { presets } from 'open-dice-dnd';

new DiceRoller({ effects: presets.classicCrit });  // RPG style with crit/fail
new DiceRoller({ effects: presets.subtle });       // gentle color confirmation only
new DiceRoller({ effects: presets.festive });      // confetti on every clean roll
```

### Imperative effect API

For ad-hoc effect triggering outside the rule system:

```js
diceRoller.glow(die, { color: 0xff0000 });
diceRoller.scalePulse(die);
diceRoller.haloRing(die);
diceRoller.playEffect(effects.confetti(), die);
```

### Writing your own effect

An effect is a factory that returns `{ scope, create(ctx) → { update(), cleanup() } }`:

```js
function myFlash({ color = 0xffffff } = {}) {
    return {
        scope: 'die',
        create({ die, roller }) {
            // Build whatever Three.js objects you need.
            const startTime = performance.now();
            return {
                update() {
                    if (performance.now() - startTime > 500) return true;  // done
                    // mutate scene per frame
                    return false;
                },
                cleanup() { /* called if the dice are cleared mid-effect */ },
            };
        }
    };
}

// Use it in a rule or directly in a die config.
new DiceRoller({
    effects: [{ match: 'clean', play: myFlash({ color: 0xff00ff }) }],
});
```

---

## 🎲 Dice types

| Type | Range |
|---|---|
| `d4` | 1–4 |
| `d6` | 1–6 |
| `d8` | 1–8 |
| `d10` | 0–9 |
| `d12` | 1–12 |
| `d20` | 1–20 |
| `d100` | 0–99 (two d10s) |

---

## 🔄 Migrating from 1.1.x to 1.2.0

**No breaking changes.** Every 1.1.x call still works. The 1.2.0 upgrade is purely additive.

### Existing code keeps working

```js
// 1.1.x — still works in 1.2.0
const total = await diceRoller.roll([{ dice: 'd20' }]);

// onRollComplete still receives total as the first arg
new DiceRoller({
    onRollComplete: (total) => { ... }
});
```

### New things you can opt into

**Richer result info** — `onRollComplete` now receives a second argument:
```js
new DiceRoller({
    onRollComplete: (total, result) => {
        console.log(result.variances);   // dice that diverged from target
        console.log(result.results);     // per-die details
    }
});
```

**Add dice mid-roll** — `addDice()` returns an independent promise with full result:
```js
await diceRoller.roll([{ dice: 'd20', rolled: 20 }]);
// before the d20 settles:
const { total, variances } = await diceRoller.addDice([{ dice: 'd6', rolled: 4 }]);
```

**Sounds + effects** — new constructor options:
```js
import { DiceRoller, effects, presets } from 'open-dice-dnd';

new DiceRoller({
    container,
    sounds: ['/sfx/click.ogg'],     // NEW
    soundVolume: 0.6,                // NEW
    effects: presets.classicCrit,    // NEW
});
```

**Per-die effects** — slot into the dice config:
```js
await diceRoller.roll([
    { dice: 'd20', rolled: 20, effects: [effects.fire()] },  // NEW
]);
```

**Decals** — slot into the dice config:
```js
await diceRoller.roll([
    { dice: 'd6', rolled: 6, decals: {                       // NEW
        '6': { src: '/icons/skull.svg', scale: 0.75 },
    }},
]);
```

### Bug fixes worth knowing

- **d12 face 12 reporting fix** — `getDieValue` used to return `NaN` when a d12 settled on its "12" face without a target value. Now returns `12` correctly.
- **Defensive callback wrapping** — a buggy `onRollComplete` callback that throws no longer brings down the animate loop.

### Effect API stability

The effect factories and rule system are new in 1.2.0 and not finalized for stability. Future versions may iterate on options/defaults. The core `DiceRoller` class API (`roll`, `addDice`, `reset`, etc.) is stable.

---

## 🛠️ Development

```bash
# Run the demo
npm run dev
# Then open http://localhost:5173/demo/

# Build the library
npm run build:lib

# Build the demo for deployment
npm run build
```

---

## 📝 Changelog

### [1.2.0] - 2026

#### ✨ New Features

**Mid-roll dice management:**
- `addDice(config)` — throw new dice into an active or settled scene as an independent batch with its own promise
- `getCurrentResults()` — re-evaluate every die in the scene at any time
- `isRolling()` — check if any batch is still unresolved
- `onBatchSettled` constructor callback

**Result reporting:**
- `onRollComplete(total, result)` now passes the full result object as a second argument
- `result.variances` exposes dice whose visible face diverged from the authoritative target
- `result.results` per-die breakdown of authoritative vs. visible values

**Decals:**
- SVG face decals via `dice.decals: { '1': { src, scale, offsetX, offsetY, rotation } }`
- `preloadDecals(srcs)` to cache images before first roll
- All dice supported including d4 (per-corner decal placement)

**Sounds:**
- `sounds: string[]` constructor option for collision audio
- Random pick per collision, volume scaled to impact velocity
- Per-die throttling so settling doesn't buzz

**Effects system:**
- 10 damage-type roll-time effects: `fire`, `frost`, `electric`, `acid` + `bloodSplat` + `acidSplat`, `psychic`, `necrotic`, `radiant`, `thunder`, `slashing`
- 7 settled-state primitives: `glow`, `scalePulse`, `haloRing`, `screenShake`, `slowMoZoom`, `particleBurst`, `confetti`
- 3 built-in presets: `classicCrit`, `subtle`, `festive`
- Declarative rule system: `effects: [{ match, play }]`
- Imperative API: `diceRoller.glow(die, opts)`, `diceRoller.playEffect(spec, die)`
- Extensible: write your own effect by exporting a factory with `scope` + `create()`

**Highlights of individual effects:**
- `electric` arcs jagged forked bolts during roll; **post-settle, settled electric dice within 6 units arc to each other for ~2.5 s**
- `frost` emits real 3D tapered octahedron ice shards alongside snowflake sprites
- `necrotic` pulls sine-curving dark waveforms INWARD into the die (inverse of every other effect)
- `slashing` draws Zoro-style single / X / Z patterns with custom-tapered tube geometry (blade silhouettes)
- `radiant` orients god-rays correctly under the top-down ortho camera

#### 🐛 Bug Fixes

- **d12 face 12 reporting** — `getDieValue` returned `NaN` when a d12 settled on its "12" face without a target. Now correctly returns `12`. Pre-existing bug since v1.0.0.
- **onRollComplete crashes** — a throwing callback no longer kills the animate loop.

#### 🔧 Internal Architecture

- Pre-simulation moved from the live physics world to an isolated `CANNON.World` per roll — `addDice()` mid-flight doesn't perturb the in-progress simulation
- Single-phase animation loop with per-batch settlement tracking
- Per-die `collide` listener for impact-scaled audio
- Effects subsystem with cleanup hooks for scene-attached helpers (geometry/material disposal)
- Module-level settled-electric registry powers cross-die arcing without engine coupling

### [1.1.2] - 2025-10-25

- Fix: Add `isSecret` parameter support to DiceRoller API

### [1.1.1] - 2025-10-23

- Bump version

### [1.1.0] - 2025-10-19

- 🌈 Custom dice colors (`diceColor`, `textColor`, `backgroundColor`)
- 🔒 Secret roll mode (`isSecret`)

### [1.0.0] - 2025-10-03

- 🎉 Initial release
- Physics-based d4/d6/d8/d10/d12/d20/d100
- Promise-based `roll()` API
- Three.js + Cannon.js / Cannon-es

---

## 📄 License

MIT. See [LICENSE](./LICENSE).

## 🙏 Credits

- [Three.js](https://threejs.org/) — 3D rendering
- [Cannon-es](https://pmndrs.github.io/cannon-es/) — physics
- [Vite](https://vitejs.dev/) — build tool

---

Made with ❤️ for tabletop gaming.
