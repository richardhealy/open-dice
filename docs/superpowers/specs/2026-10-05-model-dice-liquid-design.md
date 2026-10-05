# Model dice: liquid inside a glass flask

**Date:** 2026-10-05
**Status:** owner-directed. Owner's words: "can we make the potion of healing liquid act as liquid?" On 2026-10-05 the owner chose a real liquid body inside clear glass over a surface-only recolour, with a gentle slosh.
**Builds on:** model dice (1.7.0, PR #11) and model dice decals (1.8.0, PR #13). Branch `feat/model-dice-liquid` off main (1.9.0).
**Target version:** 1.10.0 (additive)

## 1. Purpose

RollQuest's Potion of Healing d4 is a Meshy-painted tetrahedral flask: one opaque mesh whose draught is paint in the colour texture, drawn with the flask standing on its base. A d4 lands on any of its four faces. On three of them the cork points sideways and the painted fill line tilts with the flask. Nothing in the renderer knows there is liquid inside.

This spec adds a `liquid` block to a design's `models` entry. With it the library renders the model as a clear glass shell with a liquid body inside. The liquid's surface stays level with the table whichever way the die lies, holds the same volume in every pose, swings as the die tumbles and settles flat after it lands. The model's own meshes and paint stay above a `neck` height, so a cork keeps its look. Designs without the block render exactly as before.

### Non-goals

- Refraction. three r130's transmission pass is immature; the glass is opacity, clearcoat and the scene's reflections.
- Liquids on the procedural dice.
- Bubbles, foam or particles.
- Controls in RollQuest's dice studio. The block is hand-authored in the catalogue JSON, as textured looks are.
- Changing the model file. The GLB stays as it is; its paint below the neck is simply not drawn.

## 2. Decisions

1. **A real liquid body, not a surface tint.** The owner's choice. The shell is see-through, the draught is a solid inside it, and the cut at the surface shows the liquid's top.
2. **Everything is data** in the `models` entry, validated by `registerDiceSet`, which names the failing field.
3. **The liquid updates itself before each render.** The liquid mesh's `onBeforeRender` reads its own world matrix, so still renders (RollQuest's preview, the admin cover render, the studio) show the right level with no host change. The roller feeds velocities for the slosh from its animation loop; a still die never sloshes.
4. **Glass by opacity**, drawn as an inner and an outer shell with a fixed draw order, so the far side's numbers stay hidden behind the near glass.
5. **The split is by height.** Triangles whose centroid lies above `neck` (die frame, like `hull` and `labels`) keep their mesh and material; the rest become the shell. Done once per template, cloned per die.
6. **The liquid body comes from the physics hull**, pulled inward by `thickness`. No second model is needed and it fits any shape the hull fits.
7. **Constant volume** by a quantile over a seeded cloud of points inside the liquid body, so a tetrahedron holds the same draught on its base and on its side.
8. **The liquid material is built per die**, never cloned: `Material.clone()` drops `onBeforeCompile`, and each die needs its own uniforms.
9. **The reset fade scales each material's own opacity** instead of overwriting it, so the glass fades from its own opacity rather than popping opaque. Opaque materials fade exactly as before.

## 3. The `liquid` block

```js
models: {
  d4: {
    src, transform, hull, faces, labels, numeral,       // as before
    liquid: {
      color: '#B3122A',                                 // the draught
      surfaceColor: '#FF8A96',                          // its top; default: color lightened towards white
      glow: { color: '#FF3B4E', intensity: 0.3 },       // optional emissive on the draught
      level: 0.6,                                       // share of the liquid body's volume that is filled
      thickness: 0.06,                                  // glass wall, as a share of the hull's inradius
      glass: { color: '#FFE9EC', opacity: 0.35, roughness: 0.08 },
      neck: 0.83,                                       // die-frame height; the model keeps its own meshes above it
      slosh: 1,                                         // swing strength; 0 keeps the surface level
    },
  },
}
```

| Field | Default | Accepts | Meaning |
|---|---|---|---|
| `color` | required | `#rrggbb` | The draught. |
| `surfaceColor` | `color` mixed 35% towards white | `#rrggbb` | The liquid's top face, seen through the cut. |
| `glow` | none | `{ color, intensity }`, intensity 0 to 2 | Emissive on the draught. |
| `level` | `0.6` | 0.05 to 0.95 | Filled share of the liquid body's volume. |
| `thickness` | `0.06` | 0 to 0.3 | The gap between the hull and the liquid body, as a share of the hull's inradius. |
| `glass` | `{ color: '#FFFFFF', opacity: 0.35, roughness: 0.08 }` | opacity 0.05 to 0.95, roughness 0 to 1 | The shell's material. Each field may be given alone. |
| `neck` | none | a number within 5 units | Die-frame height. Triangles whose centroid lies above it keep the model's own mesh and material. Without it the whole model becomes the shell. |
| `slosh` | `1` | 0 to 2 | How far the surface swings with the throw. `0` never tilts. |

`liquid: null` or absent means no liquid. The validator lives in `models/spec.js` beside `numeralSpec`, and the resolved entry is frozen with the rest of the set.

For the potion: the cork starts at GLB height 0.62; with the entry's transform (scale 0.859, y offset 0.298) that is die-frame height 0.83.

## 4. Geometry

Built in `modelTemplate(model)` when the entry has `liquid`, cached per entry like the template itself.

- **Split.** Every mesh under the placed scene is read with its world matrix (the die frame) applied. Triangles with centroid height above `neck` go to a "kept" geometry that keeps that mesh's material; the others go to the shell. A mesh wholly on one side keeps its own geometry object. Non-indexed copies carry position, normal and uv.
- **Shell.** The shell geometry is drawn twice: an inner mesh (`BackSide`, no depth write, renderOrder 0) and an outer mesh (`FrontSide`, depth write, renderOrder 1). Both carry the glass material.
- **Liquid body.** The hull's points scaled towards the origin by `1 - thickness`, as a `ConvexGeometry`. The nearest face moves inward by `thickness` times the inradius; farther faces and the corners a little more, which rounds the draught at the corners. `DoubleSide`, opaque.
- **Sample cloud.** 1024 points inside the liquid body: rejection sampling in its bounding box against its face planes with a seeded generator, so a model gives the same cloud every time.
- **Labels** render at renderOrder 2 on every model die (nothing else sits at 1 on a die without liquid, so their look is unchanged) and are cut from the kept meshes and the outer shell only. The liquid body and the inner shell are skipped: a decal box is deeper than the wall and would print a second number on the draught.
- Meshes are named `liquid-body`, `liquid-shell-inner`, `liquid-shell-outer`, with `userData.liquid` set, so tests and hosts can find them.

## 5. Materials and draw order

- **Liquid:** `MeshPhysicalMaterial` with `color`, roughness 0.25, clearcoat 1, clearcoat roughness 0.1, the scene's environment, `emissive` from `glow`, `DoubleSide`. Opaque; the shader's discard makes the cut.
- **Glass:** `MeshPhysicalMaterial` with `glass.color`, `glass.roughness`, metalness 0, clearcoat 1, clearcoat roughness 0.04, `transparent`, `opacity: glass.opacity`. The inner shell has `depthWrite: false`, the outer `depthWrite: true`.
- **Kept meshes:** their loaded materials, colour textures read as linear, as today.
- **Order:** the liquid draws in the opaque pass; then the inner shell (hidden wherever the liquid is in front of it); then the outer shell, which writes depth; then the labels, which the outer shell's depth hides on the far side.
- `dieMaterials(die)` lists the liquid, the glass and the kept materials, so `glow` pulses the draught and `reset()` fades the whole die. Each die clones the glass and kept materials as today and builds its own liquid material (decision 8).

## 6. The surface and the shader

Per die, `createModelDie` returns `liquid: { mesh, tick(body, dt) }` beside `mesh` and `body`. The state holds the cloud, the wobble `{ x, z, vx, vz }`, the last velocity, and the uniform objects.

**Each render**, in the liquid mesh's `onBeforeRender`:

1. World up turned into the die frame by the inverse of the die's world rotation (the die group carries no scale).
2. Heights of the cloud points along that axis; the surface height `h` is the `level` quantile (a selection, not a sort).
3. The world surface normal `n` is world up tilted by the wobble: `normalize(up + x * X + z * Z)`. The surface passes through the point on the die's axis at height `h`: `uSurfaceHeight = dot(diePosition + up * h, n)`, `uSurfaceNormal = n`.
4. Ripple: amplitude `|wobble| * 0.04 * slosh`, phase advancing with time, written to `uRipple`.

**Slosh**, in `tick(body, dt)` called by the roller after the mesh sync: the change in the body's velocity over the frame is an acceleration; its horizontal part pushes the wobble velocity the opposite way, scaled by `slosh`; a spring pulls the wobble back and damping bleeds it (stiffness about 40, damping about 6, tuned in the render harness so it settles within a second of landing); the tilt is capped at tan 20° times `slosh`. Without ticks (a still die, a preview, the cover) the wobble is zero and the surface is level.

**The shader patch** on the liquid material, through `onBeforeCompile`. Every liquid material installs the same function text, so three r130 (which keys programs on that text) compiles one program; the uniforms are wired from `material.userData.liquid` so each die drives its own.

- Vertex: `varying vec3 vLiquidWorld`, set after `#include <project_vertex>` from `modelMatrix * vec4(transformed, 1.0)`.
- Fragment, after `#include <clipping_planes_fragment>`: `ripple = uRipple.x * sin(dot(vLiquidWorld.xz, vec2(uRipple.z)) + uRipple.y)`; discard when `dot(vLiquidWorld, uSurfaceNormal) - uSurfaceHeight - ripple > 0`.
- Back faces are the liquid's top: after `#include <normal_fragment_begin>` a back face takes the surface normal (view space), and after `#include <color_fragment>` its diffuse colour becomes `surfaceColor`. The clearcoat normal follows the same rule. The hole the cut opens then shades as a flat, lit top.
- The shadow depth material is not patched: the full body casts a shadow, as the opaque model did.

## 7. Roller changes

- `_animate`: after the mesh sync, `if (d.liquid) d.liquid.tick(d.body, dt)`.
- `reset()`: each material's own opacity is recorded once (`userData.baseOpacity`) and the fade sets `opacity = base * fade`.
- `_clearDice` and `dieMaterials` need no change: the liquid meshes live under the die group.
- Nothing changes for classic dice, for model dice without the block, or for invisible prediction dice (no mesh, no liquid).

## 8. Error handling

| situation | behaviour |
|---|---|
| a `liquid` field out of range or of the wrong shape | `registerDiceSet` throws naming the field, as for every model field |
| `neck` above every triangle | the whole model becomes the shell; the design still registers |
| `neck` below every triangle | nothing becomes the shell: the model keeps its own meshes and the liquid body draws inside them (a hidden liquid); the design still registers, and a warning is logged once per entry |
| the model file fails or times out | the die rolls as the design's procedural die, with no liquid, as today |
| WebGL compiles the patched shader and fails | three logs the error; the die renders black. The render test guards against this |

## 9. Testing

Unit, with vitest in Node (no WebGL):

1. **Schema:** defaults filled in; `level: 0.96` fails naming `models.d4.liquid.level`; `neck: 9` fails; `glass: { opacity: 0.5 }` keeps the other glass defaults; `slosh: 0` kept; `liquid: null` resolves to null; the frozen entry carries the block.
2. **Split:** a box scene with a stopper cylinder above `neck`: the kept geometry holds the stopper's triangles only and its material object; the shell holds the box's; `neck` absent puts everything in the shell; a mesh wholly above `neck` keeps its geometry object.
3. **Liquid body:** every point of the inset body lies inside each hull plane by at least `thickness` times the inradius, within 1%.
4. **Level solver:** the helpers' cube at level 0.5 gives a surface at mid-height for the identity and for quarter turns about each axis (within 0.02); at level 0.25 it gives a quarter of the height; the fixture flask on its base and on a side both put `round(level * N)` cloud points under the surface, and the two surface heights differ.
5. **Slosh:** one impulse tilts the surface; with no further acceleration the wobble falls below 1e-3 within 90 ticks at 1/60 s; the tilt never exceeds the cap; `slosh: 0` never tilts; a die that is never ticked stays level.
6. **Shader patch:** on a fake shader object the patch inserts the discard and the back-face lines and wires the uniform objects of the die's state; two liquid materials give the same `customProgramCacheKey()`.
7. **Materials:** `dieMaterials(die)` lists the liquid, the glass and the kept materials; the liquid material is not the template's; `glow` restores the draught's emissive (existing model-die test extended).
8. **Fade:** a die whose glass has opacity 0.35 starts the fade at 0.35 and ends at 0; an opaque material starts at 1.
9. **Labels:** `labelGeometry` cuts nothing from the liquid body or the inner shell.

Render, through the existing playwright and SwiftShader harness (`npm run test:render`):

10. `__liquidCheck` registers the fixture flask (`shape:flask-d4` with its stopper, `neck` at the stopper's base in the die frame) with a `liquid` block, places it still on its base and on a side, and renders each: `liquid-flask-base.png` and `liquid-flask-side.png` become baselines (first run with `--update-baseline`, reviewed by eye in the PR). The two renders must differ, the shader must compile (no WebGL error in the console), and a `glow` must restore the materials.

RollQuest, after the publish: the catalogue tests (`packages/server/lib/diceDesigns`, the admin studio tests that read `potion-of-healing.json`), the client catalogue tests, the Potion in `DicePreview`, a QuickHUD roll on staging, and a replay on a second screen.

## 10. Runbook

1. **Library.** Implement on `feat/model-dice-liquid`. `npm test`, `npm run test:render`. README: a `liquid` row in "The `models` entry", a "Liquid" paragraph under rendering notes, a changelog entry. Version 1.10.0. PR to main, merge, `npm publish`.
2. **RollQuest** (one PR to staging). Bump `open-dice-dnd` to 1.10.0 in client-svelte and admin-panel. In `packages/server/data/dice-designs/potion-of-healing.json`: add the block above under `models.d4`, set `revision: 4`, and reword the description ("the draught inside levels and sloshes as it rolls"). Re-render the cover with the glass flask (the admin studio's cover renderer, or the library's `.scratch/covers.mjs` route) into `client-svelte/public/dice-designs/potion-of-healing.png`. The boot seed updates the catalogue row; the cover's `?v=4` busts the cache.
3. **Check on staging:** the Potion in the drawer's preview, a live d4 roll, a replay on another screen, and the marketplace cover.
