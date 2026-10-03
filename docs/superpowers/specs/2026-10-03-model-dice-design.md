# Model dice: shapes supplied by the host

**Date:** 2026-10-03
**Status:** owner-directed. The owner asked for "more advanced shapes" made with Meshy in RollQuest, where "the shape SHOULD affect the outcome ... no number is sent through ... get the result from the physics engine and send it back", and added: "I want them driven by the calling app, not baked into the library."
**Builds on:** PR #10 (designs are registered by the host, 1.6.0).

## 1. Goal

A dice design can give any of d4, d6, d8, d10, d12 and d20 a 3D model instead of the procedural polyhedron. The model's convex hull is the physics body, so the shape decides how the die lands. With no target number the result is the face the shape comes to rest on, and the library reports it. The library ships no models and no designs: the host registers designs whose `models` entries point at model files, and installs the loader that fetches them. A studio helper turns any loaded model into a `models` entry (physics hull, face map, number placement) and measures how fair the shape rolls.

## 2. The `models` entry

```js
models: {
  d4: {
    src: '/dice-models/potion-of-healing-d4.glb',     // handed to the host's loader as-is
    transform: { scale: 0.42, position: [0, -0.31, 0], rotation: [0, 0, 0, 1] }, // optional
    hull: [[x, y, z], ...],                          // 4 to 128 points, die frame
    faces: [{ value: 1, up: [x, y, z] }, ...],       // one per value
    labels: [{ value: 1, position: [x, y, z], normal: [x, y, z], up: [x, y, z], size: 0.3 }, ...],
    numeral: { color: '#FFFFFF', outline: { color: '#4A0A0A', width: 0.1 } },     // optional
  },
}
```

- **Die frame.** The body's local frame. `transform` places the loaded scene in it: `p = rotation * (scale * p_model) + position`.
- **hull.** The physics shape is the convex hull of these points (QuickHull at load, exactly coplanar triangles merged), with mass 1 and the classic damping. The die frame's origin is the centre of mass, so the studio centres the hull on its volume centroid.
- **faces.** The die reads `value` when `up` (die frame) points up. The value sets match the classic dice: d4 1-4, d6 1-6, d8 1-8, d10 0-9, d12 1-12, d20 1-20. A d4 is read at its top corner, so its `up` vectors point at corners; every other die is read on its top face. d100 keeps its procedural dice.
- **labels.** Numbers the library draws onto the model, each a decal projected onto the surface at `position` along `-normal`, upright towards `up`, `size` die units square. Optional: a model whose texture carries its own numbers can omit them, but then a replayed roll (section 3) cannot show the replayed value.
- **numeral.** Overrides the design's numeral colour and outline for the labels. Font and weight come from the design.

`validateSet` checks every field with its path in the message: known die type, `src` a non-empty string, 4-128 finite hull points within 5 units of the origin, one face per value of the die and no other values, finite non-zero vectors (normalised), labels naming values of the die, sizes 0.05-2, hex colours.

## 3. Runtime

- **Loader.** `setModelLoader(fn, { timeoutMs })` installs `fn(src) => Promise<Object3D | { scene }>`. Models are cached per `src`. With no loader, or when a load fails or takes longer than `timeoutMs` (20 s), that die type renders as the design's procedural die and a warning is logged once per `src`.
- **Waiting.** A roll waits for the models its dice need, as a first set roll already waits for the font. `preloadSets(ids)` and `prepareDiceSets({ sets })` load models too.
- **Physics-determined results.** The roll prediction already runs in the live world with the seeds the visible dice reuse. It now builds the same model bodies the visible dice use, so a model die without `rolled` reports the face its shape really lands on: `results[i].value` is that face's value and `total` sums them.
- **Replays.** With `rolled`, a model die behaves like a classic one: the labels are permuted so the predicted landing face shows the target (values L and T swap on every label). A host replays a roll for other viewers by passing the reported value as `rolled`.
- **Labels** are decals (three's DecalGeometry, vendored, computed once per model and label) textured with the numeral in the design's font; `isSecret` labels show "?". Six and nine are underlined on d10, d12 and d20.
- **Materials.** Each die clones the model with its own materials (textures stay shared), so a glow or fade touches one die. Effects and `reset()` reach every material of a model die through a new `dieMaterials(die)` helper; classic dice behave exactly as before.
- **Colour.** The roller renders in linear space (three r130's default), as the procedural canvas textures assume. GLTFLoader tags colour textures sRGB, which would decode them darker, so a model's `map` and `emissiveMap` are read as they are, and a model looks as its preview did.
- **Settling.** A model die counts as settled only after resting ten physics steps in a row (`body.restSteps`, kept by a postStep listener). Measured on the Meshy models: with the single-step rule 7 to 15 per cent of throws froze tilted 3 to 24 degrees mid-rock; with ten steps none did, for about 14 extra steps; thirty steps left a jittery shape unsettled. Classic dice keep the single-step rule. The roller and the studio share the rule and every other physics constant through `physics-config.js`.

## 4. Studio: `analyzeModelDie(object, options)`

Input: a loaded `Object3D` and `{ type, throws = 300, seed = 1, maxHullPoints = 48, onProgress }`.

1. Collect the vertices of every mesh, in the object's frame.
2. Build the convex hull, centre it on its volume centroid and scale it so its volume equals the classic die's of that type (so the model die sits beside classic dice at the same size).
3. Simplify the hull to at most `maxHullPoints` points (4 to 128): the support points over the densest direction set, up to 256 directions, that stays within the cap. The simplified hull is inscribed in the model's own, so the model may dip slightly into the table where the hull cuts a curve.
4. Throw the hull `throws` times in a world configured like the roller's (gravity, materials, damping, throw ranges, walls), with a seeded PRNG so a run is reproducible. Record each resting up vector.
5. Cluster the resting up vectors (12 degrees). The `sides` largest clusters become the faces; fewer clusters than sides returns `ok: false` with a reason.
6. Assign values. The face whose `up` is nearest the model's own +Y (its upright top) takes the highest value; on every die but the d4, opposite faces pair to sum like a real die (7 on a d6, 9 on a d8 and the 0-9 d10, 13 on a d12, 21 on a d20) and pairs follow by azimuth; anything left is filled in order.
7. Place labels by raycasting onto the model surface: one at the centre of each top face (size from the face's inradius), or, for a d4, three per face near its corners, upright towards the corner.
8. Report: the share of throws per value, the share that landed in unused clusters, chi-square against a fair die, the largest deviation, and warnings (a value off by more than 5 points, unused share above 3 per cent).

Output: `{ ok, reason?, model: { transform, hull, faces, labels }, report }`. The host adds `src` and stores the entry in its design. `remapModelValues(model, { from: to })` swaps values on faces and labels together, for a host that wants a different layout.

## 5. Exact die shapes

Text-to-3D services drift towards familiar objects: asked twice for a tetrahedral potion flask, Meshy built a square pyramid both times. When the geometry must stay a fair polyhedron, the host starts from `dieShape(type, { rounding, stopper })` (the classic polyhedron at the classic size, edges rounded, a d4 standing on its base with a corner up, an optional cylinder on top for flasks), writes it with `shapeToGlb(object)` (geometry-only GLB), has the service paint it, and analyses the painted file like any other model. The studio recovers all six classic dice from their exact shapes.

## 6. GLTF helper

`open-dice-dnd/gltf` exports `createGltfModelLoader({ fetchOptions, loader })`. It imports three's GLTFLoader from the library's own `three`, so loaded objects come from the same three instance the roller renders with. ES build only; a UMD host passes its own loader to `setModelLoader`.

## 7. Compatibility

Designs without `models` and classic dice are unchanged; the eight classic render baselines stay pixel-identical. Version 1.7.0.

## 8. Testing

Unit: validation errors and normalisation; hull building (cube gives six quads, degenerate input throws); loader cache, failure fallback and warn-once; model die creation (body matches the hull, one label mesh per label, materials per die, secret labels); value reading by orientation; label remapping; roller integration (waits for models, the prediction builds the model body, the reported value is the predicted face, glow and reset reach model materials); studio on synthetic meshes (a tetrahedron gives four faces near 25 per cent each and twelve corner labels, a cube pairs opposite faces to seven, a flask with a cork reports its bias, a sphere is rejected); the GLTF helper loads a GLB.

Render (Chromium and WebKit): a model die through a stub loader, rolled without a target, settles with the reported value's label on top; the same die replayed with `rolled` shows the target; a glow restores the materials.
