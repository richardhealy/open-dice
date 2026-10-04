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
- 💎 Dice designs — data-defined premium looks your app registers (the library ships none; ten examples in `examples/designs`): procedural patterns, decoration layers, decals, emblems and image textures, with numerals fitted to every face
- 🧊 Model dice — a design can roll a 3D model (a GLB from any modelling tool or text-to-3D service) whose shape decides the result; a studio turns any model into a die and reports how fairly it rolls
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
    set,                 // default design id for every die (see Dice designs); omit for classic
    pixelRatio,          // number, default min(devicePixelRatio, 2); pass 1 to opt out
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
| `preloadSets(ids)` | `Promise<void>` | Load fonts, reflections, images, decals and models of these designs and paint their faces ahead of the first roll |
| `setDefaultSet(id)` | `void` | Default design for later rolls; `null` returns to classic |
| `setThrowSpeed(n)` | `void` | |
| `setThrowSpin(n)` | `void` | |
| `destroy()` | `void` | Tear down WebGL, listeners, physics |

### Dice config

Each entry in the `diceConfig` array passed to `roll()` / `addDice()`:

```js
{
    dice: 'd20',                 // 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100'
    rolled: 18,                  // optional target value (authoritative); omit it and the face that lands decides
    diceColor: 0xff6b6b,         // optional numeric hex — body color
    textColor: '#ffffff',        // optional hex string — face text color
    backgroundColor: '#4ecdc4',  // optional hex string — face background color
    isSecret: false,             // optional — replace numbers with '?'
    set: 'ruby-jewel',           // optional — a registered design id (overrides the roller's default)
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

**Authoritative vs. visible**: the engine pre-simulates each roll in the live physics world, with the seeds the visible dice then reuse, to determine which face will land up, then paints the target value onto that face. The `total` is always the predetermined sum. If a die gets bumped (e.g. by `addDice()`) and lands on a different face, that's reported as a *variance* but the total is unchanged. This keeps results consistent across clients with different screen aspect ratios.

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

## 💎 Dice designs

A dice design is a named look: body finish, edge metal, numeral style, face decoration and decals, described as plain JSON and rendered with physically based materials and reflections. **The library ships no designs.** It renders `classic`, the original flat-colour dice, plus whatever designs your application registers. Your app owns its catalogue: keep designs wherever suits it (a database, a CMS, a static file), fetch them, and register them before rolling. RollQuest, for example, sells designs in its marketplace and registers the ones a table needs.

```js
import { DiceRoller, registerDiceSet, unregisterDiceSet, listDiceSets } from 'open-dice-dnd';

// Your catalogue: plain JSON from your own API.
const designs = await fetch('/api/dice-designs').then((r) => r.json());
for (const design of designs) registerDiceSet(design);

const roller = new DiceRoller({ container, set: 'ruby-jewel' });   // default design for every die
await roller.preloadSets(['ruby-jewel']);                           // optional: paint ahead of the first roll

await roller.roll([
    { dice: 'd20', rolled: 18, set: 'emerald-jewel' },               // per-die design
    { dice: 'd6',  rolled: 4 },                                      // the roller default
    { dice: 'd8',  rolled: 2, set: 'classic', diceColor: 0x4ade80 }, // classic honours colours
]);

registerDiceSet(updatedDesign, { replace: true });                  // swap a definition; the next roll paints it
unregisterDiceSet('ruby-jewel');                                     // withdraw one
listDiceSets();                                                      // [{ id, name, family, swatch }] for a picker
roller.setDefaultSet(null);                                          // back to classic for later rolls
```

Rules:

- Designs ignore `diceColor`, `textColor` and `backgroundColor`: the palette is the design. `classic` honours them, so "standard dice in my colours" is `set: 'classic'` on the die (or no set at all when the roller has no default design: a die without `set` takes the roller's default).
- An unknown design id logs one warning and renders `classic`, so a spectator without that design registered, or a stale id, can never break a roll.
- `registerDiceSet` validates the definition and throws naming the failing field. `classic` is reserved, and an id already registered throws unless you pass `{ replace: true }`.
- Per-die `decals` and `isSecret` work with every die, model dice included: a model die's own labels show `?`, though numbers painted into a model's texture stay visible.
- The first roll with a design waits a few milliseconds for the numeral fonts and the reflection map; `preloadSets()` moves that cost to page load.
- To draw a design without a roller (a picker preview, say), prepare it, then pass the same `DecalRegistry` to `createDie` so the design's decals and images paint:

  ```js
  const registry = new DecalRegistry();
  await prepareDiceSets({ renderer, scene, decalRegistry: registry, sets: ['ruby-jewel'] });
  // createDie(type, visible, isFirst, rolled, faceIndex, physicsMaterial, scene, world,
  //           diceColor, textColor, backgroundColor, isSecret, decals, decalRegistry, options)
  const die = createDie('d20', true, true, 20, upFaceIndex, null, scene, null, null, null, null, false, null, registry, { set: 'ruby-jewel' });
  ```
- **Numerals fit their faces, one size per die.** A design's numerals shrink, never below half their size, until the widest value of that die clears the face edge and any decoration band; every face of the die then uses that size, as on real dice. Two-digit faces (the d100 tens, a d12's 10 to 12, a d20's 10 to 20) and wide serif digits therefore stay inside their faces. A design whose numerals cannot fit even at half size logs one warning. Classic dice are unchanged.

### A minimal design

```js
registerDiceSet({
    id: 'house-brass',
    name: 'House Brass',
    family: 'metal',                                   // gem | glass | metal | textured
    body: { color: '#8C6A2F' },
    edge: { metal: 'bronze' },                         // gold | silver | bronze | iron | none
    numeral: { color: '#1A1208', style: 'engraved' },  // flat | engraved | inlay | glow
    decor: { art: 'filigree', metal: 'bronze', relief: 0.5 },
    decals: { d20: { '20': { src: '/art/house-crest.svg', scale: 0.8 } } },
    swatch: ['#8C6A2F', '#B07A3A'],
});
```

`src/sets/validate.js` lists every field and its accepted range. Textures are 256 px canvases painted once per design, die type and face value, then cached; `clearDiceSetCaches()` frees them all and `unregisterDiceSet()` frees one design's.

### Example designs

Ten complete designs live in [`examples/designs/`](examples/designs/). The demo and the tests register them the way an app would; they are not part of the published package. Copy them as a starting point.

| id | look |
|---|---|
| `ruby-jewel` | Translucent ruby, gold filigree, engraved cream numerals, a jewelled crown on the 20. |
| `emerald-jewel`, `sapphire-jewel` | Emerald and sapphire variants of Ruby Jewel. |
| `obsidian-gold` | Black glass, gilded numerals, gold edges, a gold compass star on the 20. |
| `ember-dragonhide` | Dark scaled hide, iron edges, glowing ember numerals. |
| `tidepool-pour` | Poured marble in navy, cream, gold and rust, every face different; outlined gold numerals, gold frame, a scallop shell on the 20. |
| `witchlight-vines` | Deep teal with glowing pale-mint vines, mint glow numerals, silver edges. |
| `mainframe` | Near-black green with softly glowing circuit traces, monospace glow numerals, iron edges. |
| `rosewood-knotwork` | Rosewood pour, gold knotwork border, engraved cream numerals, a gold sunburst on the 20. |
| `rose-felt` | Dusty pink felt, matte, darker rose corner florets, engraved plum numerals, a rose on the 20. |

![Ruby Jewel d20](docs/sets/ruby-jewel-d20.png) ![Obsidian & Gold d20](docs/sets/obsidian-gold-d20.png) ![Ember Dragonhide d20](docs/sets/ember-dragonhide-d20.png)

![Tidepool Pour d20](docs/sets/tidepool-pour-d20.png) ![Witchlight Vines d20](docs/sets/witchlight-vines-d20.png) ![Mainframe d20](docs/sets/mainframe-d20.png) ![Rosewood Knotwork d20](docs/sets/rosewood-knotwork-d20.png) ![Rose Felt d20](docs/sets/rose-felt-d20.png)

### Design decals

A design can mark chosen faces with images, using exactly the library's decal options `{ src, scale, offsetX, offsetY, rotation }` (see [Decals](#️-decals)). They are keyed by die type, then by face value:

```js
decals: {
    d20: { '20': { src: 'data:image/svg+xml,…', scale: 0.79 } },   // a crown on the natural 20
}
```

Design decals are validated when the design is registered: `src` is required, `scale` is 0.1 to 2, `offsetX` and `offsetY` are -0.5 to 0.5, `rotation` is -360 to 360 degrees, and the face value must exist on that die (a d20 has no "21"); an empty `decals` is treated as none. They travel through the same pipeline as per-die decals. The roller's `DecalRegistry` loads them, and `preloadSets()` includes them. They replace the numeral on that face (on a model die, that value's label), and secret rolls hide them. Keying by die type keeps a d20's "20" mark off the d100's tens face. A die's own `decals` option overrides the design's decal for the same value, and `null` switches it off:

```js
await roller.roll([{ dice: 'd20', rolled: 20, set: 'ruby-jewel', decals: { '20': null } }]);   // the numeral, not the crown
```

A decal draws into a square 0.7 of the face texture wide, times `scale`, centred on the face. A d20 face is a triangle, so keep the art compact. The examples use 0.78 to 0.86 for art that fills its view box, and more for small art. A data URL keeps a design self-contained; SVG data URLs draw into the canvas without tainting it in Chromium, WebKit and Firefox.

### Patterns

`body.texture` paints a procedural pattern under everything else. Seven kinds are available.

| kind | fields | look |
|---|---|---|
| `noise`, `marble`, `veins`, `scales` | `color2` (required), `contrast` 0..1 (0.3), `scale` 1..12 (3) | The body colour blended toward `color2` by a noise, marble, vein or scale field. |
| `pour` | `palette` of 2 to 6 hex colours, `warp` 0..8 (4), `scale` 1..12 (3), optional `lacing: { color, width 0.005..0.1 (0.02) }` | Acrylic-pour swirls that run through the whole palette. `lacing` adds thin bright veins between the colours. |
| `circuit` | `color2` (trace colour, required), `density` 5..120 (40), `grid` 6..24 (12), `contrast` 0..1 (0.6) | Printed-circuit traces with pads at their ends on a lattice. The traces are also the glow mask for `body.emissive`. |
| `felt` | `color2` (grain colour, default: the body colour shaded 35 % darker), `contrast` 0..1 (0.3) | Fine matte grain. Pair it with `vignette` around 0.45 and `roughness: 1` for cloth. |

Every kind accepts `perFace: true`, which seeds the pattern by face value so no two faces of a die match (the first paint then costs one pattern per face instead of one per die type). Patterns are deterministic: a definition paints the same pixels on every machine, every time.

Two body fields finish the look:

- `body.emissive: { color, intensity 0..4 }` lights the pattern's glow mask: the traces of `circuit`, or wherever another kind's pattern value is above 0.5. It stacks with `glow` numerals and glowing decoration layers; the brightest of the three sets the material's emissive intensity and the others are painted relative to it, so nothing clips.
- `body.vignette` 0..1 darkens the face toward its edge in `depthColor`. Gem and glass default to 0.85 (their existing look); every other family defaults to 0.

### Decoration layers

`decor` is one layer or an array of up to six, painted in order. A layer takes one of three forms:

```js
decor: [
    { art: 'frame', metal: 'silver', relief: 0.5 },                       // metal art
    { art: 'vines', color: '#CDEFEB', relief: 0.3, glow: 0.6 },           // flat colour; glow adds it to the emissive map
    { image: { src: '/art/filigree.png' }, metal: 'gold', relief: 0.6 },  // a PNG with alpha, painted as metal (or with color)
]
```

Each layer has exactly one of `metal` (gold | silver | bronze | iron) or `color`. `relief` 0..1 (0.6) raises the art in the normal map, `scale` 0.5..2 (1) resizes it, and `glow` 0..4 (0) is for colour layers only: a metal layer cannot glow. Metal layers paint into the metalness-roughness map; colour layers are dielectric and paint into the albedo (and the emissive map when they glow); image layers draw the image as supplied, or its alpha filled with `color`, and use the alpha as the metal and relief mask. Built-in arts:

| art | shapes | content |
|---|---|---|
| `filigree` | all but kite | Edge bands, corner knots, vines and berries. |
| `frame` | all but kite | The filigree's edge bands and corner knots alone, for a plain border or to stack another art inside. |
| `corners` | all but kite | A floret at each corner: three petal discs and a centre dot. |
| `knotwork` | tri, square, pent | A two-strand braid along each edge, the strands crossing, with corner knots. |
| `vines` | all but kite | A vine from each edge midpoint toward the centre with two levels of branches and leaf tips, seeded per shape. |

Kites (d10 and d100) get no built-in decoration: their textured face is only the upper triangle of the kite. `decor` may also be a single layer object.

### Face emblems

`emblems` replaces the numeral on chosen face values with path art, painted with metal and relief like a decoration layer:

```js
emblems: {
    '20': { art: 'sunburst', metal: 'gold', scale: 0.9, relief: 0.5 },
    '1': 'skull',                                    // shorthand: numeral colour, scale 0.8
}
```

Keys are face values as strings, looked up per corner on the d4. The d100 pair never carries an emblem: a percentile roll is read from two faces, and an emblem on either would hide a digit (a decal can still replace a face there, per roll). Built-in emblems: `sunburst`, `star`, `crown`, `skull`. An emblem takes `metal` or `color` (default: the numeral colour), `scale` 0.3..1.2 (0.8) and `relief` 0..1 (0.5), and is painted into every map the numeral would have used; a face that carries an emblem gets its own normal map, so `relief` raises it like a decoration layer. A decal on the same value wins over the emblem. For a single mark on a face, a design decal is usually simpler: it is just an image.

### Image textures

Any look you can paint can be a design:

```js
registerDiceSet({
    id: 'walnut',
    name: 'Walnut',
    family: 'textured',
    body: {
        color: '#5A4634',
        texture: { kind: 'noise', color2: '#3A2A1C' },                                // painted until the image arrives
        image: { src: 'https://cdn.example.com/dice/walnut.jpg', fit: 'cover' },   // or fit: 'tile', scale: 2
        normalImage: { src: 'https://cdn.example.com/dice/walnut-normal.png' },
    },
    edge: { metal: 'bronze' },
    numeral: { color: '#F3E7CF', style: 'engraved' },
    decor: [{ image: { src: '/art/sigil.png' }, metal: 'bronze', relief: 0.5 }],
    swatch: ['#5A4634', '#8A6A4A'],
});
```

- `body.image` replaces the pattern as the albedo base. `cover` scales the image to fill the face texture; `tile` repeats it `scale` (0.25..8) times across the face. Vignette, decoration and numerals paint on top as usual. The `textured` family still requires a `body.texture`; it is what the face shows until the image loads.
- `body.normalImage` is a tangent-space normal map used in place of the generated relief; decoration relief is still composited over it.
- Decoration image layers are PNGs with alpha, painted as metal or colour (see Decoration layers).

Images load through the roller's `DecalRegistry` with `crossOrigin = 'anonymous'`, so a cross-origin host must answer with `Access-Control-Allow-Origin`; without that header the browser refuses to let the canvas read the image and it counts as failed. A face whose images have not arrived paints without them (its pattern or plain body colour) and repaints when they land; a failed image logs one warning per `src` and the fallback stays. To avoid the swap, preload: `await roller.preloadSets(['walnut'])` loads every image the set references before painting, and `prepareDiceSets({ renderer, scene, decalRegistry, sets: ['walnut'] })` does the same for `createDie` used without a roller (pass the roller's `decalRegistry` or your own `DecalRegistry`; without one, faces paint their fallback and nothing is scheduled).

### Custom art

Register your own decoration arts and emblems as SVG path data, before the sets that use them:

```js
import { registerDecorArt, registerEmblemArt, registerDiceSet } from 'open-dice-dnd';

registerDecorArt('house-sigil', {
    tri:    [{ d: 'M -0.5 -0.3 L 0.5 -0.3 L 0 0.6 Z', stroke: 0, fill: true }],
    square: [{ d: 'M -0.6 -0.6 L 0.6 -0.6 L 0.6 0.6 L -0.6 0.6 Z', stroke: 0.05, fill: false }],
    // triCorners (d4) and pent (d12) left out: those faces paint nothing from this art
});

registerEmblemArt('house-mark', [
    { d: 'M 0 1 L 0.95 -0.3 L -0.95 -0.3 Z M 0 0.4 L 0.3 -0.1 L -0.3 -0.1 Z', stroke: 0, fill: true, rule: 'evenodd' },
]);

registerDiceSet({
    // ...body, edge, numeral, swatch...
    decor: [{ art: 'house-sigil', metal: 'bronze' }],
    emblems: { '20': 'house-mark' },
});
```

Decoration art is drawn in the **unit frame**: the face polygon's vertices lie on the unit circle, vertex 0 at (1, 0), y up, and the painter maps that frame onto the face of each die type. The shapes are `tri` (d8, d20), `triCorners` (the d4, whose three numerals sit at the corners), `square` (d6), `pent` (d12) and `kite` (d10, d100). Emblem art is drawn in a unit circle (radius 1, centred, y up) and scaled by the emblem's `scale`.

Each path is `{ d, stroke, fill, rule? }`. `d` may use only the SVG commands `M L H V C S Q T A Z` (uppercase or lowercase) and numbers. A fill path has `fill: true` and stroke 0; a stroke path has `fill: false` and a positive `stroke` width in frame units (the built-ins use 0.02 to 0.06). `rule: 'evenodd'` cuts holes. Ids are kebab-case, a built-in id cannot be replaced, and registration throws on the first invalid path without storing anything, so an art never half-registers. `registerDiceSet` checks that every `art` a set names exists.

### Fonts

Two numeral families are embedded, subset to the digits and `?` under the SIL Open Font License: `OpenDiceNumerals`, an engraved serif (the default), and `OpenDiceMono`, a monospace for circuit and console looks. `numeral.font` takes either name, or any other family name verbatim for the browser to resolve (loading that font is up to you). `ensureNumeralFont()` loads both embedded families; faces painted before they load use the system fallback and are cached separately.

---

## 🧊 Model dice

A design can give any of `d4`, `d6`, `d8`, `d10`, `d12` and `d20` a 3D model in place of the procedural polyhedron: a potion flask, a mimic chest, a crystal. The model's convex hull is the physics body, so **the shape decides how the die lands**. Roll it without `rolled` and the result is the face it comes to rest on. As with designs, the library ships no models: your app stores the files, installs the loader and registers designs whose `models` entries point at them. The other die types of that design keep its procedural look.

```js
import { DiceRoller, setModelLoader, analyzeModelDie, registerDiceSet } from 'open-dice-dnd';
import { createGltfModelLoader } from 'open-dice-dnd/gltf';

const loadGltf = createGltfModelLoader();
setModelLoader(loadGltf);                          // the library fetches nothing itself
const roller = new DiceRoller({ container });

// Once per model, in your authoring tool: analyse the file and store the result with the design.
const scene = await loadGltf('/dice-models/potion-of-healing-d4.glb');
const { ok, reason, model, report } = await analyzeModelDie(scene, { type: 'd4' });
if (!ok) throw new Error(reason);                  // e.g. "the shape comes to rest in only 3 distinct ways"
console.log(report.distribution);                  // { 1: 0.25, 2: 0.24, 3: 0.27, 4: 0.24 }

registerDiceSet({
    ...potionLook,                                 // id, name, family, body, numeral, swatch: the other dice
    models: { d4: { src: '/dice-models/potion-of-healing-d4.glb', ...model, numeral: { color: '#FFFFFF' } } },
});

// No `rolled`: the shape decides. results[i].value is the face the flask landed on.
const total = await roller.roll([{ dice: 'd4', set: 'potion-of-healing' }]);
```

### Results come from the physics

The roll prediction runs in the live world with the very body the visible die uses, so a model die without `rolled` lands on the face the prediction found and reports it: `results[i].value`, `visible` and the `total` all agree. To show the same roll on other screens, send the reported values and roll them there with `rolled`: as with classic dice, the labels are permuted so the face that lands shows the value (the motion differs per screen; the numbers never do). A model d10 reads 0 to 9 like the classic d10, and takes `rolled: 10` as its 0 face, read back as 10. The roller's report is the authority; a spectator's screen never decides.

A model die settles only after it has stayed at rest for ten physics steps in a row: an irregular shape rocking on an edge passes through rest at the top of every rock, and settling there would freeze it tilted. Classic dice settle as before.

### The `models` entry

| Field | Meaning |
|---|---|
| `src` | The model file, handed to your loader as is. |
| `transform` | Optional `{ scale, position, rotation: [x, y, z, w] }` placing the loaded scene in the die frame: `rotation * (scale * point) + position`. |
| `hull` | 4 to 128 points (die frame, within 5 units). The physics body is their convex hull, with its centre of mass at the origin. |
| `faces` | One `{ value, up }` per value of the die: the die reads `value` when `up` (die frame) points up. Values match the classic dice: d4 1-4, d6 1-6, d8 1-8, d10 0-9, d12 1-12, d20 1-20. |
| `labels` | Optional numbers the library draws: `{ value, position, normal, up, size }`, a square decal `size` wide projected onto the surface along `-normal`, upright towards `up`. Without labels a replayed roll cannot show its value. |
| `numeral` | Optional `{ color, outline: { color, width } }` for the labels; font and weight come from the design. |

`registerDiceSet` validates every field and names the failing one. d100 keeps its procedural dice.

### The studio: `analyzeModelDie(object, options)`

Turns any loaded model into a `models` entry: it centres the model's hull on its centre of mass, scales it to the volume of the classic die of that type, simplifies it to at most `maxHullPoints` points, throws it `throws` times with the roller's own physics (gravity, materials, damping, throw ranges, table walls), clusters where it comes to rest, assigns values like a real die (the face nearest the model's own top takes the highest value; opposite faces sum like a real die's, 7 on a d6) and places the labels by raycasting onto the model's surface (one per top face; three per face near the corners on a d4).

| Option | Default | |
|---|---|---|
| `type` | required | `'d4'` to `'d20'` |
| `throws` | `300` | More throws, steadier odds; a few hundred take about a second. |
| `seed` | `1` | Same model, same seed, same result. |
| `maxHullPoints` | `48` | 4 to 128. Physics cost grows with hull points; the simplified hull sits just inside the model's own. |
| `onProgress` | none | Called with a fraction from 0 to 1. |

It resolves `{ ok: true, model, report }`, or `{ ok: false, reason }` when the shape rests in fewer ways than the die has sides, has no clear resting faces (a ball), or comes out as an entry `registerDiceSet` would refuse. `report` holds `distribution` (share per value), `chiSquare`, `maxDeviation`, `unusedShare` (throws that rested off the chosen faces and read as the nearest one), `restingFaces`, `coverage` and readable `warnings`. `remapModelValues(model, { 4: 1, 1: 4 })` swaps values on faces and labels together.

### Exact die shapes

### How a saved die rolls: `testModelDie(model, options)`

`analyzeModelDie` reports the odds of the throws it analysed, a few hundred by default. To say how fairly a die rolls, throw it many more times: `testModelDie(model, { type, throws = 5000, seed = 1, onProgress })` takes a saved `models` entry (its `hull` and `faces`; labels are ignored), throws it with the same physics and reads each throw as a roll does, as the face whose `up` lies nearest the resting up. It reads the faces as saved, swaps included, so it measures the die players roll even when a longer run would cluster differently. It resolves to the same report as the analysis: `{ throws, distribution, chiSquare, maxDeviation, unusedShare, warnings }`.

```js
const { distribution, chiSquare } = await testModelDie(design.models.d20, { type: 'd20', throws: 5000 });
// distribution: { 1: 0.09, 2: 0.08, …, 13: 0.003, … } against a fair 0.05 each
```

When the geometry must stay a true polyhedron (a texturing service paints it, the art comes later), start from the library's shape: `dieShape(type, { rounding, stopper })` builds the classic polyhedron at the classic size with rounded edges (a d4 stands on its base, a corner up) and, with `stopper: { radius, height }`, a short cylinder on top for flasks. `shapeToGlb(object)` writes any object's geometry as a GLB to hand over. Load the painted file, analyse it and register it like any other model.

### Rendering notes

- Each die clones the model with its own materials, so effects (`glow`) and `reset()` fades touch one die. `dieMaterials(die)` returns every material of any die for your own effects.
- The labels use the design's numeral font, one glyph size per die; `isSecret` labels show `?`.
- A decal for a value, the design's or the die's own, replaces that value's label with its image. It is drawn into the label's square as a classic face draws it (0.7 of the square times `scale`, with the same offsets and rotation), so the label's `size` sets how big it is. It follows its value through a replay, secret rolls hide it, and the number shows until the image has loaded (for good if it fails).
- Colour textures are read as they are, like the procedural dice (the roller renders in linear space), so a model looks as its preview did. This switches the loaded scene's colour textures to linear in place: load a separate copy for anything rendered in sRGB.
- A roll waits for the models it needs; `preloadSets()` and `prepareDiceSets({ sets })` load them ahead. Without a loader, or when a file fails or takes longer than the loader's `timeoutMs` (`setModelLoader(fn, { timeoutMs })`, 20 s by default), that die rolls as the design's procedural die and one warning is logged; `clearModelCache()` retries.
- `open-dice-dnd/gltf` parses with three's GLTFLoader bundled against the library's own `three`, so loaded scenes share the roller's three instance. It is ES only; pass `{ loader }` for a GLTFLoader with Draco or meshopt decoders, `{ fetchOptions }` for credentials. UMD users pass their own loader to `setModelLoader`.

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

### [1.9.0] - 2026-10-04

- 🧊 `testModelDie(model, { type, throws })` throws a saved model die thousands of times and reports how fairly it rolls, reading each throw from the faces as saved: the odds players get, for a fairness label.

### [1.8.0] - 2026-10-03

- 🧊 Model dice draw decals. A design's `decals` (and a die's own) now put an image in place of a value's label on a model die, as they already did on the procedural dice: the same options, the same loading, the same secret-roll hiding, and the image follows its value through a replay.
- Replacing a design (`registerDiceSet(…, { replace: true })`) no longer keeps the old design's model templates alive, so an editor that re-registers a design on every change does not grow memory.

### [1.7.0] - 2026-10-03

- 🧊 Model dice: a design's `models` entry gives d4 to d20 a host-supplied 3D model whose convex hull is the physics body, so the shape decides the roll. Without `rolled` the result is the face it lands on; with `rolled` (a replay) its labels are permuted to show the value. The library ships no models: `setModelLoader(fn)` installs the host's loader, and `open-dice-dnd/gltf` offers `createGltfModelLoader()` bound to the library's own three.
- The studio `analyzeModelDie(object, { type })` turns any loaded model into a `models` entry (hull, face map, numbered labels) by throwing it with the roller's physics, and reports how fairly it rolls; `remapModelValues()` relabels it.
- `dieShape(type, { rounding, stopper })` and `shapeToGlb(object)` export exact die shapes for texturing elsewhere.
- `dieMaterials(die)` reaches every material of any die; `glow` and `reset()` use it.
- Model dice settle after ten still physics steps in a row, so an irregular shape never freezes mid-rock. A model d10 takes a replayed 10 on its 0 face, as the classic d10 does. A model file that takes longer than 20 s falls back to the procedural die. Classic dice and designs without models are unchanged.
- The built files now ship THIRD_PARTY_NOTICES.txt for the bundled three.js example code.

### [1.6.0] - 2026-10-03

The first published release with dice designs. 1.4.0 and 1.5.0 below were never published; their entries describe the steps along the way.

- The library ships no designs. Apps register their own with `registerDiceSet(definition, { replace })`; `unregisterDiceSet(id)` withdraws one and frees its textures. The ten example designs moved to `examples/designs/` for the demo and tests.
- Design decals: `decals: { [dieType]: { [faceValue]: { src, scale, offsetX, offsetY, rotation } } }`, the library's existing decal options, merged under each die's own `decals` (the die's entry wins, `null` switches one off).
- Numerals fit their faces: two-digit faces and serif digits shrink as needed, never below half size, to stay inside the face and clear any decoration band. Checked for every numeral of every example design on every die type in Chromium and WebKit.
- Draws at the device pixel ratio (capped at 2, `pixelRatio` option) so numerals are crisp on Retina screens; the animation loop idles when nothing moves.
- Classic dice are unchanged.

### [1.5.0] - 2026-10-03

- Three new procedural patterns: `pour` (marbled pour with optional lacing), `circuit` (seeded traces and pads, also the emissive mask) and `felt`; every pattern accepts `perFace` for a different seed on each face
- Glowing bodies: `body.emissive` lights the pattern itself; `body.vignette` is now a tunable field
- Decoration becomes a list of up to six layers: metal arts, flat-colour arts with optional glow, and image layers; new built-in arts `frame`, `corners`, `knotwork` and `vines`
- `emblems` replace the numeral on chosen face values with path art (built-in `sunburst`, `skull`, `star`, `crown`), painted with metal or colour and relief; the d100 pair never carries one, so percentile rolls stay readable
- Image textures: `body.image` and `body.normalImage` paint a set from PNGs, preloaded with `preloadSets()` and repainted when they arrive; a set without a roller paints its fallback and never throws
- Second embedded numeral font `OpenDiceMono`; `numeral.font` takes either embedded family or any name for the browser to resolve
- `registerDecorArt()` and `registerEmblemArt()` accept SVG path data for your own borders and emblems
- Five new built-in sets: Tidepool Pour, Witchlight Vines, Mainframe, Rosewood Knotwork, Rose Felt
- 1.4.0 set definitions validate and paint unchanged; Classic stays pixel-identical and the five 1.4.0 sets keep their look

### [1.4.0] - 2026-10-03

- 💎 Dice sets: `set` option on the roller and per die, `preloadSets()`, `setDefaultSet()`, `listDiceSets()`, `registerDiceSet()`
- Five built-in sets: Ruby, Emerald and Sapphire Jewel, Obsidian & Gold, Ember Dragonhide
- Physically based materials with a procedural reflection environment; the chamfer bevels become a metal frame on set dice
- Face textures are cached across rolls (classic included); prediction dice no longer paint textures
- Classic dice are unchanged

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
- [Cinzel](https://github.com/NDISCOVER/Cinzel) by The Cinzel Project Authors (SIL Open Font License 1.1) — numeral font, embedded as a digits-only subset under the family name `OpenDiceNumerals`; licence in `src/sets/fonts/OFL.txt`

---

Made with ❤️ for tabletop gaming.
