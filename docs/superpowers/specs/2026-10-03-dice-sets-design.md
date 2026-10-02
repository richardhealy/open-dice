# Dice Sets: premium, data-defined looks for open-dice-dnd

**Date:** 2026-10-03
**Status:** approved design (owner approved the approach and the five-set launch catalogue on 2026-10-03)
**Target version:** 1.4.0 (additive, no breaking changes)

## 1. Purpose

RollQuest wants to offer premium cosmetic dice sets of the kind VTT players buy: Let's Role sells seven-piece sets (d4 to d100) for a one-off price, themed as gem-and-gold "Jewel" sets, vampire, pirate, werewolf and galaxy looks. Today open-dice-dnd renders chamfered polyhedra with flat-colour canvas faces, Arial numerals, a Phong material, one ambient and one directional light, and no reflections. This spec adds a **dice set** system: a named, data-only definition of how a die looks, rendered with physically based materials, environment reflections, metal bevels, styled numerals and painted face decoration, on the existing geometry and physics.

Success looks like: a `set: 'ruby-jewel'` die reads as a translucent ruby with a gold frame and engraved dark serif numerals at normal dice size on screen; five built-in sets ship; existing callers see no change; new sets can be added as data without a 3D artist.

### Decisions already taken

- **Procedural PBR, not loaded models.** Keep the geometry. Add materials, lighting and painted detail. The owner chose this over artist-made GLB models.
- **No refraction / transmission.** Three's transmission samples what the renderer drew behind the object. On a transparent overlay canvas that is nothing, so a refractive gem renders dark. Gems use clearcoat over a saturated colour, a baked inner-depth gradient and a faint emissive glow instead. This works on every device.
- **Premium sets have a fixed palette.** `diceColor`, `backgroundColor` and `textColor` are ignored for any set other than `classic`. The palette is the product (Ruby and Sapphire are separate sets, as on Let's Role).
- **Classic stays pixel-identical.** `set: 'classic'` (or no set) runs the existing material path with the existing lights. Phong ignores `scene.environment`, so installing an environment map does not alter Classic dice.
- **three.js stays at r130.** Everything used here (MeshPhysicalMaterial clearcoat, metalness/roughness/normal/emissive maps, PMREMGenerator, `scene.environment`, flat shading) exists in r130. No upgrade.
- **No dependency on `three/examples/jsm`.** The library's build externalises `three` and maps it to a UMD global; the examples modules have no global. The environment scene is a small in-library equivalent of RoomEnvironment (a handful of emissive boxes), fed to core `PMREMGenerator`.
- **Launch catalogue:** Classic (unchanged) plus `ruby-jewel`, `emerald-jewel`, `sapphire-jewel`, `obsidian-gold`, `ember-dragonhide`. Three recipes (gem, glass, textured) prove the format before more sets are added.

### Non-goals

- Loaded GLB models, new geometry (rounded dice, sculpted bands). The design leaves room: visuals are already separate from physics bodies.
- Tinting premium sets with user colours.
- Quality tiers. Shared maps keep the cost low enough; a tier can be added later if profiling demands it.
- RollQuest integration (picker, relay to spectators, ownership, commerce). That is sub-project 2 with its own spec. Section 11 lists what it will need from this library.

## 2. Public API

All additions. Existing signatures keep working.

```js
import { DiceRoller, registerDiceSet, listDiceSets, getDiceSet, diceSets } from 'open-dice-dnd';

// Roller-level default set (applies to every die that does not name its own).
const roller = new DiceRoller({ container, set: 'ruby-jewel' });

// Optional. Loads the embedded numeral font, installs the environment map and
// pre-paints every face of every die type for the listed sets, so the first
// roll does not pay for painting. Resolves when done. Safe to call repeatedly.
await roller.preloadSets(['ruby-jewel', 'obsidian-gold']);

// Per-die override. Precedence: die.set > roller option > 'classic'.
await roller.roll([
  { dice: 'd20', rolled: 18, set: 'emerald-jewel' },
  { dice: 'd6',  rolled: 4 },                          // uses the roller default
]);

roller.setDefaultSet('obsidian-gold');                   // runtime change, like setEffectRules

listDiceSets();        // [{ id, name, family, swatch }] for pickers; built-ins + registered
getDiceSet('ruby-jewel'); // frozen full definition, or undefined
registerDiceSet({ id: 'house-brass', name: 'House Brass', family: 'metal', ... }); // validates, returns id
diceSets.CLASSIC;      // 'classic'
```

Behaviour rules:

- **Unknown set id** at roll time: `console.warn` once per id, render Classic. Never throw mid-roll; a spectator may receive an id this build does not know.
- **Invalid definition** at `registerDiceSet`: throw `Error` with the failing field. Registering an id that already exists (including built-ins and `classic`) throws.
- **`isSecret`** paints `?` in the set's numeral style.
- **Decals** paint into the set's face in place of the numeral, as today. A decal face has no inlay or glow numeral in the metalness or emissive maps.
- **Effects** keep working. `glow()` writes `emissive`/`emissiveIntensity` and restores them; sets with an emissive map glow only in the mapped regions, which is the intended look.
- **`preloadSets` is optional.** A roll of a non-classic set first awaits the font and installs the environment (both once per roller, milliseconds after the first time), then spawns.

## 3. Set definition schema

A set is a plain object. `family` selects a body recipe whose defaults every field may override.

```js
{
  id: 'ruby-jewel',                 // required; /^[a-z0-9]+(-[a-z0-9]+)*$/; unique
  name: 'Ruby Jewel',               // required; shown in pickers
  family: 'gem',                    // required; 'gem' | 'glass' | 'metal' | 'textured'
  body: {
    color: '#B5173A',               // base albedo (hex string)
    depthColor: '#5A0A1C',          // gem/glass: radial gradient toward face edges
    roughness: 0.16,
    metalness: 0,
    clearcoat: 1, clearcoatRoughness: 0.06,
    glow: { color: '#FF2D55', intensity: 0.18 },    // optional emissive body glow
    texture: {                                      // optional procedural pattern
      kind: 'veins',                // 'noise' | 'marble' | 'veins' | 'scales'
      color2: '#E84A6F',            // second colour blended by `contrast`
      scale: 3,                     // pattern repeats across a face
      contrast: 0.25,               // 0..1 blend strength
    },
    normalStrength: 0,              // 0..1 relief from the texture (textured family)
    envMapIntensity: 1,
  },
  edge: { metal: 'gold' },          // 'gold' | 'silver' | 'bronze' | 'iron' | 'none'
  numeral: {
    font: 'OpenDiceNumerals',       // family name; see section 7
    weight: 700,
    color: '#2A0912',
    style: 'engraved',              // 'flat' | 'engraved' | 'inlay' | 'glow'
    metal: null,                    // inlay metal when style === 'inlay'
    glow: null,                     // { color, intensity } when style === 'glow'
    scale: 1,                       // multiplier on today's numeral size
  },
  decor: {                          // or null
    art: 'filigree',                // id in the decor library (section 6)
    metal: 'gold',
    relief: 0.6,                    // normal-map strength 0..1
  },
  swatch: ['#B5173A', '#D4AF37'],   // required; 1..3 hex colours for pickers
}
```

Family defaults:

| family | roughness | metalness | clearcoat | depth gradient | texture |
|---|---|---|---|---|---|
| gem | 0.16 | 0 | 1 / 0.06 | yes | optional |
| glass | 0.12 | 0 | 1 / 0.04 | yes | optional |
| metal | 0.30 | 1 | 0 | no | optional |
| textured | 0.55 | 0 | 0 | no | required |

Metal presets (used by edges, decor and inlay numerals):

| metal | color | roughness | metalness | envMapIntensity |
|---|---|---|---|---|
| gold | #D4AF37 | 0.28 | 1 | 1.2 |
| silver | #C9CDD3 | 0.22 | 1 | 1.2 |
| bronze | #B07A3A | 0.35 | 1 | 1.1 |
| iron | #5C5F66 | 0.50 | 1 | 1.0 |

Validation (`src/sets/validate.js`): required fields present and typed; hex colours match `#rrggbb`; enums in range; numbers within 0..1 where stated (`scale` 0.5..2, `texture.scale` 1..12, glow intensity 0..4); `numeral.metal` required when style is `inlay`; `numeral.glow` required when style is `glow`; `body.texture` required for `textured`; `decor.art` must exist in the decor library. The validator returns the fully resolved definition (defaults applied, frozen).

## 4. Rendering model

### 4.1 Where materials are built

Every die model today ends with the same loop: for each material index, paint a face texture and push a `MeshPhongMaterial`. That loop moves into one shared builder, `src/sets/face-materials.js`:

```js
buildFaceMaterials({
  type,                 // 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100'
  geometry,             // to read the max material index
  faces,                // array indexed by materialIndex: { text } | { values: [a, b, c] } | null (blank)
  colors,               // { diceColor, textColor, backgroundColor } — classic only
  isSecret, decals, decalRegistry,
  textOffsetY,          // d100 passes 16
  faceFrame,            // { sides, tab, af } — see 4.4
  textureTuning,        // d20 passes { flipY: true, generateMipmaps: false, linearFilter: true, clamp: true }
  set,                  // resolved set definition; classic when absent
  visible,              // false → one shared MeshBasicMaterial per slot, nothing painted
})
```

The models keep their face-value swap logic (the predetermined-result trick) untouched and only delegate material creation. `createDie` and each `createXxxMesh` gain a trailing `options` object (`{ set, visible }`) rather than more positional parameters, so RollQuest's preview component, which calls `createDie` positionally with eleven arguments, keeps working.

For `visible: false` (the prediction dice spawned by `_preSimulateInLiveWorld`) the builder returns an array filled with one shared `MeshBasicMaterial`. Those dice are never rendered; today they paint a full set of textures for nothing. This applies to Classic too and is a free speedup.

### 4.2 Classic path

`set === 'classic'` reproduces today's output exactly: `createFaceTexture` / `createD4FaceTexture` as now, `MeshPhongMaterial({ specular: 0x172022, color: diceColor, shininess: 40, flatShading: true, map })`, with the d20's texture flags applied only when the model passes them. The render smoke test (section 9) holds a Classic baseline to prove this.

### 4.3 Set path

Per material index the builder returns a `MeshPhysicalMaterial` with `flatShading: true`:

- **Index 0 (chamfer bevels, and the d10/d100 belt triangles):** the **edge material**. The metal preset's colour, roughness, metalness and `envMapIntensity`, no maps. `edge.metal === 'none'` uses the body recipe with a blank face albedo instead. Every die gets a metal frame with no new geometry.
- **Indexes ≥ 1 (faces):** body recipe values plus:
  - `map`: the face albedo (per face, section 5).
  - `roughnessMap` and `metalnessMap`: the same packed "MR" texture (G = roughness, B = metalness, three's channel convention). Present only when the face needs per-face metal regions: `numeral.style === 'inlay'`, or `decor` present. When present, scalar `roughness` and `metalness` are set to 1 so the map carries the values. When absent, the scalars carry the body values.
  - `normalMap`: shared per `(set, type)` (section 5.3), `normalScale` from `decor.relief` and `body.normalStrength`. Absent when both are 0.
  - `emissiveMap` + `emissive = #ffffff`, `emissiveIntensity = numeral.glow.intensity` when `numeral.style === 'glow'`. Otherwise `body.glow` sets `emissive = glow.color`, `emissiveIntensity = glow.intensity` with no map.
  - `clearcoat`, `clearcoatRoughness`, `envMapIntensity` from the recipe.

Blank faces (index with `faces[i] === null`, e.g. d4 index 1) get the body albedo without numeral.

### 4.4 Face frame and UV mapping

`makeGeometry` maps every face as a regular polygon inscribed in a circle, scaled by `(1 + tab)` and rotated by `af`: UV of vertex `j` is `((cos θ + 1 + tab) / 2 / (1 + tab), (sin θ + 1 + tab) / 2 / (1 + tab))` with `θ = 2π j / sides + af`. Canvas textures default to `flipY = true`, so canvas pixel `(x, y) = (u · ts, (1 − v) · ts)`. Therefore on a canvas of size `ts`, face vertex `j` sits at

```
cx = cy = ts / 2
R  = ts / (2 (1 + tab))
x_j = cx + R cos θ_j
y_j = cy − R sin θ_j
```

Per die type:

| type | sides | tab | af | shape key |
|---|---|---|---|---|
| d4 | 3 | -0.1 | 7π/6 | tri |
| d6 | 4 | 0.1 | π/4 | square |
| d8 | 3 | 0 | -π/8 | tri |
| d10 | 4 | 0 | 6π/5 | kite |
| d12 | 5 | 0.2 | -π/8 | pent |
| d20 | 3 | -0.2 | -π/8 | tri |
| d100 | 4 | 0 | 6π/5 | kite |

The d10/d100 kite is UV-mapped as a square, so square-frame decoration stretches onto the kite exactly as the numerals already do. Decoration art is authored in a unit frame (circumradius 1, centre at origin, vertex 0 at angle 0, y up) and drawn through the transform `translate(cx, cy) · scale(R, −R) · rotate(af)`, so it lands on the face polygon for every type. Numerals keep today's transform (centre of canvas, canvas-up), so decoration must be rotationally symmetric for its face shape (3-fold for tri, 4-fold for square and kite, 5-fold for pent).

### 4.5 Environment lighting

`src/sets/environment.js` exports `installEnvironment(renderer, scene)`: if `scene.environment` is unset, build a small emissive-box room scene (in-library, about 30 lines), run `new PMREMGenerator(renderer).fromScene(room, 0.04)`, assign `.texture` to `scene.environment`, dispose the generator, and remember the result on the scene so repeated calls are no-ops. `DiceRoller` calls it from `preloadSets` and before spawning the first non-classic die. Failure (for example a lost context) is caught and logged with `console.warn`; dice still render, flatter.

Lights, renderer encoding (`LinearEncoding`) and tone mapping (`NoToneMapping`) stay as they are so Classic is unchanged. Set brightness is tuned through `envMapIntensity` and recipe values, judged against the render smoke test's PNGs.

## 5. Face painting

`src/sets/face-painter.js` paints canvases. It takes a `createCanvas(size)` factory (default `document.createElement('canvas')`) so unit tests can inject a recording stub. Texture size stays 256 px (today's `calculateTextureSize` result).

### 5.1 Albedo (per face)

Painted in this order:

1. Fill `body.color`.
2. Body texture, if any: a seeded value-noise function (`src/sets/noise.js`, pure, deterministic from `(set.id, type)`) produces `kind`: `noise` (fBm), `marble` (sine-warped fBm), `veins` (thin high-contrast fBm ridges), `scales` (overlapping arcs on a hex lattice, shaded). Blended toward `color2` by `contrast`. Seeded by set and type only, never by face, so the shared normal map lines up with every face.
3. Depth gradient (gem and glass): radial gradient from transparent at the centre to `depthColor` at the face circumradius, plus a faint lighter ellipse offset up-left to suggest a polished dome.
4. Decoration: the shape's path list stroked and filled in the decor metal colour with a 1 px darker inner stroke, through the 4.4 transform.
5. Numeral in the set style (5.4), or the decal image if one is set for this value, or `?` when secret. The d4 corners layout rotates three numerals by 120° exactly as `createD4FaceTexture` does today.

### 5.2 MR map (per face, when needed)

Fill G = body roughness, B = body metalness (R = 0). Paint decoration regions with the metal preset (G = metal roughness, B = 255). For `inlay` numerals paint the glyph with the inlay metal values. Decal faces skip the glyph.

### 5.3 Normal map (shared per set and type)

Height canvas: decoration alpha blurred by 1.5 px, scaled by `decor.relief`, plus the body texture's luminance scaled by `body.normalStrength`. `src/sets/normal-map.js` turns a height buffer (`Uint8ClampedArray`, width, height) into a tangent-space RGB normal map with a Sobel filter. Pure function, tested on pixels in node. Flat-shaded faces have no tangent attribute; three derives tangents from UV derivatives for `TangentSpaceNormalMap`, which is sufficient here.

### 5.4 Numeral styles

- `flat`: fill only (Classic uses this with Arial).
- `engraved`: numeral filled with `numeral.color`; a lighter stroke offset 1 px down-right and a darker stroke offset 1 px up-left fake a bevel that reads under the directional light at any rotation; a subtle inner vertical gradient (darker at the top) suggests depth.
- `inlay`: numeral filled with the metal colour and a thin darker edge; the glyph is also painted into the MR map so it reflects like metal.
- `glow`: numeral filled with `glow.color`; the glyph is painted into a black emissive map.

Underlines for 6/9/60/90 are kept in every style, in the numeral colour.

### 5.5 Texture cache

`src/sets/texture-cache.js`: a module-level `Map` from key to `THREE.Texture`. Key = `set.id | type | kind | faceKey`, where kind is `albedo`, `mr`, `emissive` or `normal` and `faceKey` is `text | secret | decal src | textOffsetY | values` (plus the three colours for Classic). Hits return the same texture object, which is safe to share across meshes and renderers. Decal async patches update the shared canvas and flag `needsUpdate` as today. No eviction in 1.4.0; `clearDiceSetCaches()` is exported and disposes every cached texture. Rough budget: a fully painted set across all seven types is about 70 albedo textures (18 MB at 256² RGBA) plus up to 70 MR or emissive textures when a style needs them, plus seven normal maps. Faces are painted lazily, so only die types actually rolled are resident.

## 6. Decoration library

`src/sets/decor/index.js` maps `art` id → `{ tri, square, kite, pent }`, each an array of `{ d, stroke, fill }` where `d` is SVG path data (fed to `new Path2D(d)`, drawn synchronously, no image loading), `stroke` a width in unit-frame units, `fill` a boolean. Launch content: one art id, `filigree`, with petal-and-vine bands that follow each face's edges and meet in a small central knot, authored with the symmetry 4.4 requires. Paths are hand-authored in `src/sets/decor/filigree.js`.

## 7. Numeral font

Cinzel Bold (SIL Open Font License 1.1, The Cinzel Project Authors) subset to the digits `0-9` and `?`, as woff2: 1.8 KB. Embedded as a base64 data URL in `src/sets/fonts/numerals.js` and registered through the FontFace API under the family name `OpenDiceNumerals` (a neutral name, so the subset is not distributed under the original font name). `src/sets/fonts/OFL.txt` carries the licence text; the README's Credits section names the font and licence. Loading: `ensureNumeralFont()` returns a memoised promise that adds the face to `document.fonts` and awaits `load()`; on any failure it warns once and resolves anyway, and canvas falls back through `Georgia, "Times New Roman", serif`. The subset is produced locally with `pyftsubset` from the Google Fonts release and the exact command is recorded in `scripts/subset-font.sh`.

## 8. Code layout

```
src/sets/
  index.js            registry: registerDiceSet, listDiceSets, getDiceSet, resolveSet, CLASSIC
  validate.js         schema validation + defaults → frozen definition
  builtin/
    index.js          registers the five launch sets
    ruby-jewel.js  emerald-jewel.js  sapphire-jewel.js  obsidian-gold.js  ember-dragonhide.js
  materials.js        metal presets, family defaults, createEdgeMaterial, createFaceMaterial
  face-materials.js   buildFaceMaterials (shared by every die model; classic + set paths)
  face-painter.js     albedo / MR / emissive / height canvases, numeral styles, decor drawing
  noise.js            seeded value noise + pattern kinds
  normal-map.js       height buffer → normal map pixels (pure)
  texture-cache.js    keyed THREE.Texture cache + clearDiceSetCaches
  environment.js      installEnvironment(renderer, scene)
  face-frame.js       FACE_FRAMES table + polygon helpers (shared with tests)
  decor/
    index.js  filigree.js
  fonts/
    numerals.js  OFL.txt
scripts/subset-font.sh
```

Changes to existing files:

- `src/dice-models/*.js`: replace each inline material loop with `buildFaceMaterials(...)`; add trailing `options`; export each model's `faceFrame`.
- `src/dice.js`: `createDie(..., options = {})` passes `set`/`visible` through.
- `src/DiceRoller.js`: `set` option, `setDefaultSet`, `preloadSets`, `_ensureSetAssets` (font + environment) awaited in `roll()` and `addDice()` before prediction, `_spawnBatch` resolves each die's set, `_preSimulateInLiveWorld` passes `visible: false` so prediction dice get placeholder materials.
- `src/face-texture.js`: `drawText`, `drawDecalImage`, the underline rule and the d4 corner helpers become exports reused by the painter. Behaviour unchanged.
- `src/index.js`: new exports.
- `demo/`: a set `<select>` populated from `listDiceSets()` applied to every die of the next roll, and a "set per die" JSON note.
- `README.md`: "Dice sets" section, changelog entry `[1.4.0]`, Credits for the font.
- `package.json`: version 1.4.0, `test` scripts, dev dependencies (section 9).
- `.gitignore`: `!docs/**/*.md` so specs and plans can be committed (the repo ignores `*.md`).

## 9. Testing

The repository has no tests today. Two layers are added.

**Unit (vitest, node environment), `npm test`:**

1. Registry: built-ins listed; `getDiceSet` returns frozen copies; `registerDiceSet` validates (missing id, bad hex, bad enum, inlay without metal, textured without texture, duplicate id, `classic` reserved) and throws with the field name.
2. `resolveSet` precedence: die > roller > classic; unknown id warns once and yields classic.
3. `buildFaceMaterials`: classic → `MeshPhongMaterial` with exactly today's parameters and the d20 texture flags only when passed; set → `MeshPhysicalMaterial`, index 0 carries the edge metal preset, faces carry recipe values; `inlay` faces have `metalnessMap === roughnessMap`; `glow` faces have `emissiveMap` and white emissive; decal faces have no glyph in MR/emissive; `visible: false` returns one shared `MeshBasicMaterial`. Canvases come from an injected stub that records draw calls, so assertions like "numeral drawn with the set font and colour" and "decor paths drawn through the frame transform" are checkable.
4. `face-frame`: polygon vertices computed from the table equal the UV formula in `makeGeometry` for every type (both computed in the test).
5. `normal-map`: flat height → `(128, 128, 255)`; a vertical step → x-gradient of the expected sign, y unchanged.
6. `noise`: deterministic for a seed; different seeds differ; values within 0..1.
7. `texture-cache`: same inputs share one texture; differing text, secret flag, decal or classic colours produce different keys.
8. `environment`: `installEnvironment` is a no-op when `scene.environment` is set; with an injected fake generator it assigns the texture once and disposes the generator.

**Render smoke (Playwright, real Chromium with SwiftShader), `npm run test:render`:** a Vite fixture page creates a roller, calls `preloadSets`, and for each set renders a d20 (and a d6) via `createDie` with no physics world at a fixed quaternion, returning PNG data URLs. The node script asserts no page errors and no WebGL errors in the console, that each set's image differs from Classic by more than 5 % of pixels, and that Classic matches `test/render/baseline/classic-d20.png` within a 0.5 % pixel tolerance (baseline captured from `main` before any change; `--update-baseline` rewrites it). PNGs for every set are written to `test/render/out/` (gitignored) for eyeballing, and the final set previews are committed under `docs/sets/` for the README and the PR.

The browsers already installed under `~/Library/Caches/ms-playwright` are used; `@playwright/test` is a dev dependency.

## 10. Error handling summary

| situation | behaviour |
|---|---|
| unknown set id in a die or roller option | warn once per id, render classic |
| invalid definition passed to `registerDiceSet` | throw with field name |
| font fails to load | warn once, serif fallback, roll proceeds |
| environment map generation fails | warn, dice render without reflections |
| decal image fails | unchanged: text (or set numeral) stays |
| `createDie` outside a browser | unchanged: canvas creation fails as today |

## 11. What sub-project 2 (RollQuest) will need

Listed so the API above covers it; nothing here is built in this project.

- Pass `set` per die in `DiceRoller.svelte`'s config builder and in `DicePreview.svelte` (fifteenth `createDie` argument).
- Add `set` to the `diceRoll` socket payload (client emit; server `diceHandlers.js`, `battleHandlers.js`, `rollableTables.js` relays).
- A set picker beside the colour pickers in Game Settings using `listDiceSets()` and the live preview; a saved per-user preference.
- Ownership and commerce: plan gate, one-off purchase, or achievement grant. Decided in that spec.

## 12. Risks

- **Look tuning is iterative.** Recipe numbers in section 3 and 13 are starting points; the render smoke PNGs are the judge. Budget time for two or three tuning passes.
- **Decor orientation vs numerals.** Mitigated by requiring symmetric art per face shape.
- **GPU memory on mobile** if many sets are resident. Mitigated by lazy painting and the exported cache clear; eviction can follow later.
- **MeshPhysicalMaterial cost** with many dice on low-end devices. Measured in the demo; a quality tier is the fallback plan, not in scope now.

## 13. Launch set recipes (starting values)

| id | family | body colour / depth | texture | edge | numeral | decor |
|---|---|---|---|---|---|---|
| ruby-jewel | gem | #B5173A / #5A0A1C, glow #FF2D55 @0.18 | veins #E84A6F, scale 3, contrast 0.25 | gold | engraved #2A0912 | filigree gold 0.6 |
| emerald-jewel | gem | #0F8A4A / #063B22, glow #2AE38A @0.16 | veins #4FD08A | gold | engraved #06261A | filigree gold 0.6 |
| sapphire-jewel | gem | #1C4FD6 / #0A1F5C, glow #3B7BFF @0.16 | veins #5B8CFF | gold | engraved #08123A | filigree gold 0.6 |
| obsidian-gold | glass | #0B0B10 / #000000 | marble #2A2A33, scale 2, contrast 0.35 | gold | inlay gold, scale 1.05 | none |
| ember-dragonhide | textured | #2A1410, color2 #120807 | scales, scale 4, contrast 0.7, normalStrength 0.8 | iron | glow #FF7A1A @1.6 | none |

Swatches: the body colour plus the edge metal colour (Ember: body plus glow colour).
