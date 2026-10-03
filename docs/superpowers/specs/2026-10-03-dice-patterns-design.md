# Dice Patterns: richer generators, data-defined art and image textures

**Date:** 2026-10-03
**Status:** approved direction (owner chose "the full follow-up as recommended" on 2026-10-03); design decisions below are the implementer's, recorded here
**Builds on:** `2026-10-03-dice-sets-design.md` (dice sets, PR #8). Branch `feat/dice-patterns` stacks on `feat/dice-sets`.
**Target version:** 1.5.0 (additive)

## 1. Purpose

The dice-set system paints one body pattern (noise, marble, veins, scales) and one decoration (filigree) per set. The owner's references show what sells: multi-colour pour marbling, vines that run across faces, circuit traces that glow, felt, Celtic borders, corner ornaments, face emblems, metal bands. Seven of the nine references are reachable with the existing painter once it has richer generators and takes art and images as data. This spec adds:

1. Three pattern kinds (`pour`, `circuit`, `felt`) and per-face seeding.
2. A body emissive layer, so patterns can glow, not only numerals.
3. Decoration as layers: new generated arts (`frame`, `corners`, `knotwork`, `vines`), flat-colour and glowing decoration, face emblems keyed by value, and custom path art supplied in a set definition.
4. Image textures: body albedo, body normal map and decoration from PNG/JPG URLs the host supplies.
5. A second embedded numeral font (monospace) for technical looks.
6. Five new built-in sets that exercise all of the above.

### Non-goals

- Sculpted geometry (cage dice, medallions): still the artist-model path, a later project.
- Changing any existing set's look, Classic included. Existing baselines and set renders stay as they are except where a tuning task says otherwise.
- RollQuest integration (sub-project 2) is unchanged by this work; it gains nothing to pass except more set ids.

### Decisions

- **Everything new is data.** Every feature below is expressed in the set definition and validated by `validateSet`; no set needs code.
- **Backward compatible definitions.** `decor` still accepts a single object; `body.texture` kinds and fields keep their meaning. The validator normalises the new shapes.
- **Images are host-supplied URLs.** The library ships no image assets; `preloadSets` and the roller's `DecalRegistry` load them with the decal machinery. A set with images paints its fallback (flat body colour, no decoration) until they load and then repaints, exactly as decals do.
- **Generators are pure where they can be.** `pour`, `circuit` and `felt` produce pixel buffers from a seed with no canvas, so they are tested on pixels in Node. Path arts are generated into the unit frame of `face-frame.js` and reuse the existing decor pipeline (paint, metal-roughness, relief).

## 2. Set definition additions

```js
{
  // ...existing fields...
  body: {
    color: '#1B2B4A',
    texture: {
      kind: 'pour',                         // + 'circuit' | 'felt'  (existing: noise | marble | veins | scales)
      palette: ['#2F5BA8', '#EEE4D2', '#D9A441', '#B23A2E'],   // pour: 2..6 colours
      warp: 4,                              // pour: domain warp strength 0..8 (default 4)
      lacing: { color: '#FFF4E0', width: 0.02 },               // pour: optional thin bright veins
      color2: '#3CFF78', density: 40, grid: 12,                // circuit: trace colour, traces per face, cells across
      contrast: 0.35,                       // felt / circuit / existing kinds: blend strength
      scale: 3,
      perFace: true,                        // seed per face value so faces differ (default false)
    },
    emissive: { color: '#3CFF78', intensity: 0.35 },           // optional: the pattern's glow mask lights up
    vignette: 0.85,                         // optional radial darkening toward the edge (gem/glass default 0.85, others 0)
    image: { src: 'https://…/marble.jpg', fit: 'cover' | 'tile', scale: 1 },   // optional albedo image
    normalImage: { src: 'https://…/marble-normal.png' },                       // optional tangent-space normal map
  },
  decor: [                                   // array of layers, or one object as before
    { art: 'frame', metal: 'silver', relief: 0.5 },
    { art: 'knotwork', metal: 'gold', relief: 0.6, scale: 1 },
    { art: 'vines', color: '#CDEFEB', glow: 0.6, relief: 0.3 },          // flat colour instead of metal; glow adds it to the emissive map
    { image: { src: 'https://…/filigree.png' }, metal: 'gold', relief: 0.6 }, // alpha PNG painted as metal
    { art: 'house-sigil', metal: 'bronze' },                              // custom art registered with registerDecorArt
  ],
  emblems: {                                 // optional: replaces the numeral on that face value
    '20': { art: 'sunburst', metal: 'gold', scale: 0.9 },
    '1': 'skull',                            // shorthand: numeral colour, scale 0.8
  },
  numeral: { font: 'OpenDiceMono', ... },    // new built-in family alongside OpenDiceNumerals
}
```

### 2.1 Pattern kinds

| kind | fields | algorithm (pure, `src/sets/noise.js` → `src/sets/patterns.js`) |
|---|---|---|
| `pour` | `palette` (2..6), `warp` 0..8 = 4, `scale` 1..12 = 3, `lacing?` | q = fbm(s, u, v); r = fbm(s+7, u + warp·q, v + warp·q); w = fbm(s+13, u + 1.25·warp·r, v + 1.25·warp·r); w′ = smoothstep(0.25, 0.75, w); colour = ramp(palette, w′). Lacing: where \|fbm(s+21, 2u + 3r, 2v + 3r) − 0.5\| < width, blend 70 % toward lacing.color. Output is RGB per pixel plus the value w′ for relief. |
| `circuit` | `color2`, `density` 5..120 = 40, `grid` 6..24 = 12, `contrast` 0..1 = 0.6 | A mask: `density` seeded Manhattan walks on a `grid`×`grid` lattice (3..8 segments of 1..4 cells, 50 % turn chance), rasterised 1.5 % of the texture wide, with pads (discs, 2.5 %) at both ends. Albedo = body colour blended toward color2 by contrast where the mask is set. The mask is also the emissive mask. |
| `felt` | `color2` (grain, default = body shade −0.35), `contrast` 0..1 = 0.3 | g = 0.5·valueNoise(s, 0.9x, 0.9y) + 0.5·fbm(s+3, x/40, y/40, 3); colour = body blended toward color2 by (1 − g)·contrast. Combine with `vignette` and roughness 1 for the felt look. |

Existing kinds are untouched. `perFace: true` adds the face key (text or corner values) to the pattern seed, so every face differs; the pattern cache is keyed per face in that case and the first paint costs one pattern per face (about 4 ms each at 256 px). Default stays per type.

### 2.2 Body emissive layer

`body.emissive: { color, intensity }` lights the pattern's glow mask: for `circuit` the traces, for every other kind the pattern value above 0.5. The painter's emissive mode paints the mask in `color`; numerals with `style: 'glow'` paint on top as before. One material has one `emissiveIntensity`, so layers are painted relative to the material's intensity: `materialIntensity = max(numeral.glow?.intensity ?? 0, body.emissive?.intensity ?? 0, decorGlowMax) || 1`, and each layer is painted at `colour × (layerIntensity / materialIntensity)`. `createFaceMaterial` takes the intensity from the set rather than from `numeral.glow` alone.

### 2.3 Decoration layers

`decor` is an array of layers painted in order (a single object is wrapped). A layer is one of:

- `{ art, metal, relief, scale }` as today, `art` from the built-in library or a registered custom art.
- `{ art, color, relief, glow? }` flat colour (dielectric: painted into albedo only, MR untouched), optional `glow` 0..4 adds it to the emissive map at that intensity.
- `{ image: { src }, metal | color, relief }` a PNG with alpha. Albedo: the image drawn as supplied (colour) or its alpha filled with `color`; MR: alpha filled with the metal; height: alpha.

Built-in arts, all generated per face shape in the unit frame (`src/sets/decor/*.js`):

| art | shapes | content |
|---|---|---|
| `filigree` | all but kite | existing |
| `frame` | all but kite | edge bands and corner knots only (filigree without vines) |
| `corners` | all but kite | a floret at each corner: three petal discs and a centre dot, 0.16 wide |
| `knotwork` | tri, square, pent | a two-strand braid along each edge: strands offset ±0.035 from the inset edge following sin(kπt), k = 3 (tri), 4 (square), 4 (pent), crossing each other; corner knots |
| `vines` | all but kite | from each edge midpoint a main vine toward the centre stopping at 0.35 of the apothem, two levels of branches (seeded, deterministic per shape), leaf ellipses at tips; stroke widths 0.05 / 0.03 / 0.02 |

Kites (d10/d100) get no built-in decoration, as before.

`registerDecorArt(id, shapes)` adds a custom art: `shapes` maps face shapes to path lists `[{ d, stroke, fill, rule? }]` in the unit frame (SVG path data; `rule: 'evenodd'` for holes). Missing shapes paint nothing. Validation: id kebab-case, each `d` limited to the commands `M L H V C S Q T A Z` and numbers.

### 2.4 Face emblems

`emblems` maps a face value to an emblem: `{ art, metal | color, scale (0.3..1.2 = 0.8), relief }` or an art id string (numeral colour, scale 0.8). The emblem replaces the numeral on that value's face in every map (albedo, MR, emissive, height), exactly as a decal replaces the numeral, but it is painted from path data with metal and relief. d4 corners and d100 tens faces follow the same value lookup as decals. Built-in emblem arts (`src/sets/decor/emblems.js`, unit radius 1, centred): `sunburst` (16 rays and a disc), `star` (five-point), `crown` (three-point crown with ball tips), `skull` (head disc, jaw, two eye holes and a nasal notch using the even-odd rule). `registerEmblemArt(id, paths)` adds custom emblems. A decal on the same value wins over an emblem (the host's explicit icon beats the set's).

### 2.5 Image textures

- `body.image: { src, fit: 'cover' | 'tile', scale }` replaces the pattern as the albedo base: `cover` scales the image to fill the 256 px canvas; `tile` repeats it with `createPattern` at `scale` repeats across the face. The depth gradient/vignette, decoration and numerals paint on top as usual.
- `body.normalImage: { src }` is used as the per-type normal map instead of the generated relief (decoration relief is still added on top by compositing the generated relief with `lighter` blend).
- Decoration image layers as in 2.3.
- Loading: `faceTextures` collects every image `src` the set needs and loads them through the roller's `DecalRegistry` (passed in as today); until loaded, the face paints without that layer and repaints when the image arrives (the pending-decal mechanism, renamed to pending images). `preloadSets` and `prepareDiceSets({ images: true })` preload every image of the listed sets before painting. A failed image logs one warning per src and the fallback stays.
- Cache keys include an `img:<n>` token counting loaded images at paint time, so a face painted before its images arrived is never served after they did.

### 2.6 Fonts

A second embedded family, `OpenDiceMono` (Share Tech Mono, SIL OFL 1.1, digits and `?`, about 2 KB, registered under the neutral name because the font declares a reserved name), with fallback `"Courier New", monospace`. `numerals-data.js` becomes a map of family → base64; `ensureNumeralFont()` loads all embedded families; `isNumeralFontReady()` is true when every embedded family loaded (or failed). The subset script takes the family as an argument.

### 2.7 Vignette

`body.vignette` 0..1 is the radial darkening toward the face edge that gem and glass already paint (their default stays 0.85 with `depthColor`); other families default to 0 and may set it (felt uses 0.45).

## 3. New built-in sets

| id | look |
|---|---|
| `tidepool-pour` | pour marble, palette navy / cream / gold / rust, perFace, lacing cream; gold inlay numerals; gold edges; `frame` decor in gold |
| `witchlight-vines` | deep teal body (noise, low contrast), `vines` decor in pale mint with glow 0.6, glow numerals mint, silver edges, vignette 0.6 |
| `mainframe` | near-black green body, `circuit` texture with emissive traces (0.35), glow numerals green in `OpenDiceMono`, iron edges, no decoration |
| `rosewood-knotwork` | pour with a rosewood palette (dark brown / red-brown / amber) low warp, `knotwork` gold decor, engraved cream numerals, gold edges, emblem `sunburst` gold on 20 |
| `rose-felt` | felt in dusty pink, vignette 0.45, roughness 1, no clearcoat, `corners` decor in a darker rose colour (flat), engraved plum numerals, edge `none` |

Recipes are starting points; the tuning task judges them in the render harness and the demo.

## 4. Code layout (additions and changes)

```
src/sets/
  patterns.js            pure generators: pourPixels, circuitMask, feltPixels (+ ramp, smoothstep)   [new]
  noise.js               unchanged (used by patterns.js)
  face-painter.js        layers: body image/pattern/vignette, decor layers (art/colour/image), emblems, emissive mask
  face-materials.js      emissive intensity from set; image collection + pending images; per-face pattern keys
  validate.js            new fields, decor array normalisation, emblems, images, fonts
  art-registry.js        registerDecorArt / registerEmblemArt + path validation                       [new]
  decor/
    index.js             built-ins + registry lookup; getDecor(art, shape) falls back to registry
    filigree.js  frame.js  corners.js  knotwork.js  vines.js  emblems.js                           [new except filigree]
  fonts/
    numerals.js          multi-family; numerals-data.js map; ensureNumeralFont loads all
  builtin/
    tidepool-pour.js  witchlight-vines.js  mainframe.js  rosewood-knotwork.js  rose-felt.js
scripts/subset-font.sh   takes FAMILY NAME ALIAS; writes both families
```

`src/index.js` exports `registerDecorArt`, `registerEmblemArt`. README gains sections for patterns, decor layers, emblems, images, custom art and the second font.

## 5. Testing

Unit (vitest): generators on pixels (determinism, range, palette coverage for pour, trace/pad presence and density for circuit, felt grain variance); validator (every new field, decor normalisation, emblem shorthand, image fields, bad path data rejected, unknown art rejected); painter (layer order, flat vs metal decor in MR, glow decor in emissive, emblem replaces numeral in every map, decal beats emblem, image layers draw with cover/tile, pending images reported); materials (emissive intensity from body/decor/numeral); registry (custom arts resolve, duplicates refused); fonts (two families embedded, both woff2).

Render harness: the five new sets render for d20/d6/d10/d100/d100-tens and differ from Classic and from one another; Classic baselines unchanged (eight at 0.000 %). A fixture page variant exercises an image set with a data-URL PNG so the image path is covered without network.

## 6. Risks

- **Pour palette coverage** depends on the noise distribution; the smoothstep remap and the tuning task address it.
- **Per-face patterns** cost one pattern per face on first paint; only the pour set opts in, and preload hides it.
- **Image CORS**: hosts must serve images with CORS headers (RollQuest's S3 does); `DecalRegistry` already sets `crossOrigin`.
- **Emissive intensity sharing**: with both glowing numerals and a glowing body, the dimmer layer is painted darker to share one intensity; precision is 8 bit, fine for ratios up to about 10:1.
