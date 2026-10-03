# Dice Patterns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Richer dice-set looks as data: three new pattern generators, a glowing body layer, decoration layers (generated arts, flat colour, glow, images, custom paths), face emblems, image textures, a second numeral font, and five new built-in sets.

**Architecture:** Pure pixel generators in `src/sets/patterns.js` feed the existing canvas painter; decoration becomes an ordered list of layers painted through the existing unit-frame pipeline; emblems reuse the decal "replace the numeral" path with path art; images load through the roller's `DecalRegistry` with the pending-repaint mechanism already used for decals. The validator normalises every new shape so the painter sees one canonical form.

**Tech Stack:** three r130, canvas 2D, vitest, Playwright render harness (all pre-existing on `feat/dice-sets`).

**Spec:** `docs/superpowers/specs/2026-10-03-dice-patterns-design.md`. Read it first; the algorithms, field tables and recipes live there and are not repeated in full here.

**How this plan specifies work:** each task gives exact files, exported signatures, behaviour, and the test cases by name and assertion. Implementers write the code to make those tests pass. A task is done when its listed tests exist, were seen failing, pass, the whole unit suite passes, and the commit is made. Where a step needs judgment (tuning), the step says what to look at.

## Global Constraints

- Branch `feat/dice-patterns` in `/Users/richardfernandez/Code/open-dice`, stacked on `feat/dice-sets` (PR #8). Never touch `main` or `feat/dice-sets`.
- `three` stays `^0.130.0`; no `three/examples/jsm` imports; no new runtime dependencies.
- Texture size stays 256 px. Classic output stays pixel-identical: `npm run test:render` must keep every `classic-*` baseline at 0.000 %; never run `--update-baseline`.
- Existing sets keep their look: Ruby, Emerald, Sapphire, Obsidian and Ember renders change only if a task says so (none does).
- Set definitions stay backward compatible: a 1.4.0 definition validates and paints identically.
- Set ids kebab-case. No emoji in new user-facing strings. Owner naming rule: no "Cyber" in any set name or id.
- Unknown ids (sets, arts, emblems) never throw at roll time: warn once, paint without.
- Commits: `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "<type>(scope): …\n\nCo-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`. Conventional types: feat, fix, test, docs.
- TDD: write the failing test, run it and read the failure, implement, run again, then the whole suite (`npm test`).
- Unit tests live in `test/unit/*.test.js` and use the recording canvas stub (`test/unit/helpers/canvas-stub.js`) via `setCanvasFactories`; set fixtures in `test/unit/helpers/sets.js`.

## Review Focus

Inputs the spec implies that tests might not exercise; each task named owns the pin.

1. **A 1.4.0 definition with `decor: { art, metal, relief }` (object, not array)** must validate and paint exactly as before. Task 2 and Task 5.
2. **A face with a decal AND an emblem for the same value**: the decal wins in every map (albedo, MR, emissive, height). Task 5.
3. **A set with images and no `decalRegistry`** (direct `createDie` without a roller) must paint its fallback and not throw. Task 6.
4. **`perFace: true` on a d4** must seed by the corner values, so the three faces differ but a repaint of the same face is stable. Task 5.
5. **Glowing decor plus glowing numerals plus a glowing body**: all three visible, none clipped to black, the brightest at full intensity. Task 6.

---

### Task 1: Pattern generators

**Files:** Create `src/sets/patterns.js`; Test `test/unit/patterns.test.js`.

**Interfaces (exports):**
- `ramp(palette: string[], t: number) → [r, g, b]` linear through hex stops.
- `smoothstep(a, b, x) → number`.
- `pourPixels({ seed, size, palette, warp = 4, scale = 3, lacing = null }) → { rgb: Uint8ClampedArray(size*size*3), value: Float32Array(size*size) }` per spec 2.1.
- `circuitMask({ seed, size, grid = 12, density = 40 }) → Uint8ClampedArray(size*size)` 0/255 mask of traces and pads per spec 2.1; must be deterministic for a seed; walks use the lattice hash from `noise.js` (no `Math.random`).
- `feltPixels({ seed, size, color, color2, contrast = 0.3 }) → { rgb, value }` per spec 2.1.
- `PATTERN_KINDS` in `noise.js` extended to `['noise', 'marble', 'veins', 'scales', 'pour', 'circuit', 'felt']`.

**Tests (write first, see them fail):**
- `ramp` returns the first stop at 0, the last at 1, the midpoint of a two-stop palette at 0.5.
- `pourPixels` is deterministic (two calls equal), rgb values in range, and with a 4-colour palette at least 3 of the 4 stops are the nearest stop for ≥ 5 % of pixels each (palette coverage).
- `pourPixels` with `lacing` produces more pixels within 40 of the lacing colour than without.
- `circuitMask` deterministic; between 4 % and 40 % of pixels set at defaults; contains at least `density / 2` pad discs (count connected components of radius ≥ 2 % is acceptable, or count pads by the generator returning `pads: number` alongside the mask — add `pads` to the return value and assert it equals `density * 2`).
- `feltPixels` deterministic; mean colour within 25 of `color` blended toward `color2` by `contrast/2`; per-pixel standard deviation > 2 (grain present).
- `PATTERN_KINDS` lists the seven kinds in that order.

**Commit:** `feat(sets): pour, circuit and felt pattern generators`

---

### Task 2: Validator for the new definition shape

**Files:** Modify `src/sets/validate.js`; Test `test/unit/validate.test.js` (extend).

**Behaviour (spec 2):**
- `body.texture.kind` accepts the seven kinds. `pour` requires `palette` (2..6 hex), accepts `warp` 0..8 (default 4), `scale`, optional `lacing { color hex, width 0.005..0.1 default 0.02 }`; `color2`/`contrast` optional for pour. `circuit` requires `color2`, accepts `density` 5..120 (40), `grid` 6..24 (12), `contrast` (0.6). `felt` accepts `color2` (default `shade(body.color, -0.35)` — import `shade` from a new tiny `src/sets/color.js` that `face-painter.js` re-exports to avoid a cycle), `contrast` (0.3). All kinds accept `perFace` boolean (false).
- `body.emissive` optional `{ color hex, intensity 0..4 }`.
- `body.vignette` 0..1; default 0.85 for gem/glass, 0 otherwise.
- `body.image` optional `{ src string, fit 'cover'|'tile' (cover), scale 0.25..8 (1) }`; `body.normalImage` optional `{ src }`.
- `decor`: null, an object, or an array of 1..6 layers; normalised to an array. Layer forms: `{ art, metal, relief 0..1 (0.6), scale 0.5..2 (1) }`, `{ art, color hex, relief, glow 0..4 (0) }`, `{ image: { src }, metal | color, relief }`. Exactly one of `metal`/`color`; `art` must be built-in or registered (`hasDecor` now consults the registry from Task 4; until Task 4 lands, built-ins only).
- `emblems`: optional object mapping value strings to `{ art, metal | color (default numeral colour), scale 0.3..1.2 (0.8), relief 0..1 (0.5) }` or an art id string; art must exist in the emblem library/registry (Task 4; until then accept the four built-in names as a constant list in validate.js).
- `numeral.font`: any non-empty string; the painter resolves fallbacks (Task 3).
- Error messages keep the `open-dice-dnd: invalid dice set — <field>:` form.

**Tests:** one `it` per bullet above with a valid case and the key invalid cases (`pour` without palette, palette of 1 or 7, `circuit` without color2, decor with both metal and color, decor layer with neither, 7 layers, emblem with unknown art, image without src, vignette 2, perFace non-boolean). Plus Review Focus 1: a 1.4.0-shaped definition (object decor) normalises to a one-element array with the same fields.

**Commit:** `feat(sets): validate pattern, emissive, image, decor-layer and emblem fields`

---

### Task 3: Second numeral font

**Files:** Modify `scripts/subset-font.sh` (take `FAMILY GOOGLE_NAME ALIAS`, write all families into `numerals-data.js` as a map), `src/sets/fonts/numerals-data.js` (regenerate), `src/sets/fonts/numerals.js`, add `src/sets/fonts/OFL-share-tech-mono.txt`; Test `test/unit/fonts.test.js` (extend).

**Interfaces:** `NUMERAL_FONTS = { OpenDiceNumerals: { fallback: 'Georgia, "Times New Roman", serif' }, OpenDiceMono: { fallback: '"Courier New", monospace' } }`; `fontStack(family) → string` (family + fallback when embedded, else the family verbatim); `ensureNumeralFont()` loads every embedded family (Promise of boolean: all loaded); `isNumeralFontReady()` true once every embedded family has loaded or failed. `NUMERAL_FONT_FAMILY` and `NUMERAL_FONT_FALLBACK` stay exported (serif values) for compatibility.

**Tests:** both families present in `numerals-data.js` with woff2 magic bytes and sizes 1000..8000; `fontStack('OpenDiceMono')` ends with `monospace`; `fontStack('Papyrus')` is `'Papyrus'`; `ensureNumeralFont()` in Node resolves false and is memoised. Painter font strings (Task 5) use `fontStack`.

**Commit:** `feat(sets): embedded monospace numeral font (OpenDiceMono)`

---

### Task 4: Decor arts, emblems and the art registry

**Files:** Create `src/sets/decor/frame.js`, `corners.js`, `knotwork.js`, `vines.js`, `emblems.js`, `src/sets/art-registry.js`; Modify `src/sets/decor/index.js`; Test `test/unit/decor.test.js` (extend), `test/unit/art-registry.test.js`.

**Interfaces:**
- Each art module exports `build<Name>(sides, { corners }) → paths` in the unit frame (`[{ d, stroke, fill, rule? }]`), generated deterministically (a seeded LCG from `noise.js`'s hash for vines, no `Math.random`).
- `DECOR` gains `frame`, `corners`, `knotwork`, `vines`; kite entries are `[]`.
- `EMBLEMS = { sunburst, star, crown, skull }` path lists in a unit circle (radius 1, centred); `getEmblem(id)`.
- `art-registry.js`: `registerDecorArt(id, shapes)`, `registerEmblemArt(id, paths)`, `hasDecorArt(id)`, `hasEmblemArt(id)`, `getRegisteredDecor(id, shape)`, `getRegisteredEmblem(id)`, `validatePathList(paths)` (throws on a `d` with characters outside `MLHVCSQTAZmlhvcsqtaz0-9 .,-eE` or a non-positive stroke on a stroke path), `_resetArtRegistryForTests()`.
- `decor/index.js`: `hasDecor(id)` = built-in or registered; `getDecor(id, shape)` = built-in else registered else `[]` for a registered art missing that shape; throws only for unknown ids.

**Tests:** per art: path counts per shape (frame = sides × 2; corners = sides × 4; knotwork = sides × 3 (two strands + knot); vines ≥ sides × 3), all `d` valid per `validatePathList`, `fill` paths have stroke 0, vines never enter radius 0.3 (check every coordinate pair's distance), knotwork strands cross: for each edge the two strand `d` strings differ in sign of their first offset term. Emblems: four ids, every path valid, `skull` uses `rule: 'evenodd'` on at least one path. Registry: register, lookup, duplicate refused, bad path refused, `getDecor('house', 'kite')` → `[]`, `getDecor('nope', 'tri')` throws.

**Commit:** `feat(sets): frame, corners, knotwork and vines arts; emblems; custom art registry`

---

### Task 5: Painter layers, emblems, images

**Files:** Modify `src/sets/face-painter.js`; create `src/sets/color.js` (move `hexToRgb`, `rgbToHex`, `shade`, `mrColor` there; `face-painter.js` re-exports them); Test `test/unit/face-painter.test.js` (extend).

**Behaviour (spec 2.1–2.5):**
- Body base, in order: image (`cover`: `drawImage` scaled to the canvas; `tile`: `createPattern` with the image drawn at `size/scale`) else pattern (the new kinds via Task 1 generators, cached per `(set, type[, faceKey])` when `perFace`); vignette (radial, `body.vignette`, colour `depthColor`) replacing the old fixed gem/glass gradient (default 0.85 keeps gem/glass identical); sheen unchanged.
- Decor layers in order; metal layers as today; colour layers fill/stroke `color` in albedo only; `glow` layers also paint in emissive mode at `glow / materialIntensity`; image layers draw the image (albedo), its alpha filled with the metal MR colour (MR), its alpha as white (height) using a scratch canvas and `destination-in`.
- Emblems: `faceEmblem(set, value)` returns the normalised emblem or null; when present and no decal image is loaded for that value, paint the emblem instead of the numeral in every mode: albedo (metal colour or `color`), MR (metal MR when metal), emissive (only if `glow`), height (white) through a transform of `translate(centre) · scale(R · scale · 0.5)`. A loaded decal wins.
- Emissive mode: start black; body emissive mask (circuit mask or pattern value > 0.5) in `body.emissive.color × (intensity / materialIntensity)`; glow decor layers; glow numerals as before. `materialEmissiveIntensity(set)` exported: `max(numeral.glow?.intensity ?? 0, body.emissive?.intensity ?? 0, max decor glow) || 1`.
- `paintFace` returns `{ canvas, pendingImages: string[] }` (renamed from `pendingDecals`; includes body image, normal image is handled by the builder, decoration images, decal sources).
- Font string uses `fontStack(set.numeral.font)`.

**Tests:** albedo order for a `pour` set (pattern drawn via `drawImage` of the cached pattern canvas, then vignette gradient, then decor, then numeral); `perFace` seeds: two faces produce two pattern canvases, the same face twice produces one (Review Focus 4 with d4 corner values); colour decor paints no MR glyph; glow decor paints in emissive mode; emblem replaces the numeral in albedo, MR, emissive and height and a loaded decal wins over it (Review Focus 2); `cover` image: `drawImage` with the canvas size; `tile`: `createPattern` called and a fill; pending images include an unloaded body image; emissive mask painted for `circuit` in the body emissive colour scaled by `intensity / materialIntensity`; `materialEmissiveIntensity` picks the max; a 1.4.0 GEM fixture paints the same call sequence as before (compare the recorded call names to a snapshot captured before the change, Review Focus 1).

**Commit:** `feat(sets): painter layers, emblems, body emissive and image textures`

---

### Task 6: Builder, materials, preload

**Files:** Modify `src/sets/face-materials.js`, `src/sets/materials.js`, `src/DiceRoller.js` (`preloadSets`), `src/sets/prepare.js`; Test `test/unit/face-materials.test.js`, `test/unit/materials.test.js`, `test/unit/roller-sets.test.js` (extend).

**Behaviour:**
- `createFaceMaterial(set, maps)` uses `materialEmissiveIntensity(set)` when an emissive map is present.
- Face texture modes: `mr` when inlay numerals, metal decor layer, image decor layer with metal, or metal emblem; `emissive` when glow numerals, `body.emissive`, glow decor or glow emblem.
- Normal map: `body.normalImage` when loaded is the base (drawn into the canvas), the generated relief composited over it with `lighter`; otherwise generated as today. Cached per `(set, type, imagesLoaded)`.
- Cache keys include `img:<n>` where `n` = number of the set's image sources currently loaded in the registry, so faces painted before images arrive are not reused after.
- Pending images: `faceTextures` loads them through `decalRegistry` and repaints all maps on arrival (existing mechanism, generalised). Without a registry (Review Focus 3) the face paints its fallback and nothing is scheduled; no throw.
- `collectSetImages(set) → string[]` exported (body image, normal image, decor image layers).
- `DiceRoller.preloadSets(ids)` preloads `collectSetImages` through `this.decalRegistry` before painting; `prepareDiceSets({ renderer, scene, images?: string[] | registry? })` — keep simple: `prepareDiceSets({ renderer, scene, decalRegistry, sets })` preloads images of `sets` when a registry is given.
- Review Focus 5: a set with glow numerals (1.6), body emissive (0.35) and a glow decor (0.6) gets `emissiveIntensity` 1.6 and the emissive canvas receives three paint groups at relative brightness 1, 0.22, 0.375 (assert the fill styles' scaled colours).

**Tests:** as listed; plus `collectSetImages` returns deduplicated sources; a set with a body image and a fake registry that resolves later repaints and the second build after loading yields a different texture object than the first.

**Commit:** `feat(sets): emissive intensity, image preload and normal-image support in the builder`

---

### Task 7: Exports and README

**Files:** Modify `src/index.js`, `readme.md`; Test `test/unit/roller-sets.test.js` (exports list).

**Behaviour:** export `registerDecorArt`, `registerEmblemArt`; README: a "Patterns" subsection (kinds table with fields), "Decoration layers", "Face emblems", "Image textures" (CORS note, fallback, preload), "Custom art" (unit frame explanation, path commands), "Fonts" (two families). Keep the existing Dice sets section's examples valid.

**Tests:** exports present. (Docs are reviewed, not tested.)

**Commit:** `docs: patterns, decor layers, emblems, image textures and custom art`

---

### Task 8: Five built-in sets and the tuning pass

**Files:** Create `src/sets/builtin/tidepool-pour.js`, `witchlight-vines.js`, `mainframe.js`, `rosewood-knotwork.js`, `rose-felt.js`; Modify `src/sets/builtin/index.js`; Test `test/unit/builtin-sets.test.js` (extend: ids in order after the first five; each validates; spec-recipe spot checks: tidepool `perFace`, witchlight glow decor, mainframe `OpenDiceMono` + body emissive, rosewood emblem on 20, rose-felt edge none and vignette 0.45), `test/unit/numeral-contrast.test.js` keeps passing for all ten sets (inlay numerals count their metal colour, emblems are ignored).

**Steps:** write recipes from spec section 3 → unit suite → `npm run test:render` (the harness lists sets automatically; all must PASS) → view every new set's PNGs in `test/render/out/` (d20, d6, d10, d100-tens) and tune against this list, re-rendering after each change: pour palette shows at least three colours on every die; vines visibly cross from face to face at the edge midpoints and glow; mainframe traces glow softly with the digits brighter; rosewood knotwork reads as a braid, the sunburst sits on 20; felt reads matte with a soft edge; all numerals legible (contrast test holds); none of the five original sets changed (their PNGs byte-identical to the previous run — `cmp` them before and after this task).

**Commit:** `feat(sets): Tidepool Pour, Witchlight Vines, Mainframe, Rosewood Knotwork, Rose Felt`

---

### Task 9: Harness coverage for images

**Files:** Modify `test/render/fixture.js`, `test/render/run.mjs`.

**Behaviour:** the fixture registers, at load, a test-only set `fixture-image` (via `registerDiceSet`) whose `body.image.src` is a 64×64 data-URL PNG painted in the fixture (a checkerboard) and whose decor has an image layer with alpha (a ring); `run.mjs` renders `fixture-image` d20 after `preloadSets(['fixture-image'])` and asserts it differs from Classic by ≥ 5 % and differs from the same set rendered without preload by ≥ 1 % (proving the repaint path) — or simpler and deterministic: assert the preloaded render differs from classic and that `window.__renders` for a non-preloaded first paint exists; keep to one PASS line: `PASS fixture-image (image textures) renders`. `fixture-image` is excluded from `--previews`.

**Commit:** `test: render coverage for image-textured sets`

---

### Task 10: Version, changelog, previews

**Files:** `package.json` (1.5.0), `readme.md` (changelog `[1.5.0]`, features line), `docs/sets/*.png` (`node test/render/run.mjs --previews`).

**Steps:** final `npm test`, `npm run test:render`, `npm run build:lib`; commit `docs: 1.5.0 changelog and previews`. The orchestrator opens the PR (base `feat/dice-sets`).

---

## Self-review notes

- Spec coverage: §2.1 → T1, T2, T5; §2.2 → T5, T6; §2.3 → T2, T4, T5; §2.4 → T2, T4, T5; §2.5 → T2, T5, T6, T9; §2.6 → T3, T5; §2.7 → T2, T5; §3 → T8; §4 layout → T1–T7; §5 tests → every task; docs → T7, T10.
- Review Focus pins: 1 → T2 + T5; 2 → T5; 3 → T6; 4 → T5; 5 → T6.
- Names used across tasks: `pourPixels/circuitMask/feltPixels/ramp/smoothstep` (T1→T5), `PATTERN_KINDS` (T1→T2), `shade/hexToRgb/mrColor` from `color.js` (T5; T2 imports `shade`), `fontStack/NUMERAL_FONTS/isNumeralFontReady` (T3→T5,T6), `getDecor/hasDecor/getEmblem/registerDecorArt/registerEmblemArt/validatePathList` (T4→T2,T5,T7), `paintFace → { canvas, pendingImages }`, `materialEmissiveIntensity`, `faceEmblem` (T5→T6), `collectSetImages` (T6→DiceRoller, prepare).
