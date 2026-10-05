# Model Dice Liquid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `liquid` block on a model die's `models` entry renders the model as a clear glass shell with a draught inside that keeps level with the table in every pose, sloshes with the throw and settles after landing; then RollQuest's Potion of Healing uses it.

**Architecture:** The library splits the loaded model at a `neck` height (the cork keeps its paint, the rest becomes a two-sided glass shell), builds the draught as the physics hull pulled inward, and keeps its surface level by a quantile over a seeded point cloud, read in the liquid mesh's `onBeforeRender`. A shader patch discards fragments above the surface and lights back faces as the liquid's top. The roller feeds body velocities to a spring-damped slosh each frame and fades the glass from its own opacity. RollQuest then bumps the dependency, adds the block to the potion's catalogue JSON and re-renders its cover.

**Tech Stack:** open-dice-dnd (ES modules, three r130, cannon-es), vitest in Node for unit tests, playwright + SwiftShader for render checks; RollQuest pnpm workspace (node --test, tsx).

**Spec:** `docs/superpowers/specs/2026-10-05-model-dice-liquid-design.md`

## Global Constraints

- Library version goes from 1.9.0 to **1.10.0**, additive: classic dice, model dice without `liquid`, and invisible prediction dice render and roll exactly as before.
- three stays at **^0.130.0**: no `transmission`, `Quaternion.invert()` (not `inverse()`), `material.customProgramCacheKey()` is `onBeforeCompile.toString()`.
- `neck`, `hull` and `labels` all live in the **die frame** (after the entry's `transform`).
- Field ranges, verbatim from the spec: `level` 0.05 to 0.95 (default 0.6), `thickness` 0.01 to 0.3 (default 0.06), `glass.opacity` 0.05 to 0.95 (default 0.35), `glass.roughness` 0 to 1 (default 0.08), `glass.color` default `#FFFFFF`, `neck` within 5 units, `slosh` 0 to 2 (default 1), `glow.intensity` 0 to 2 (default 0.3), `surfaceColor` default = `color` lightened 35% towards white.
- Mesh names and `userData.liquid` values: `liquid-body` / `'body'`, `liquid-shell-inner` / `'inner'`, `liquid-shell-outer` / `'outer'`. Render orders: inner 0, outer 1, labels 2.
- The liquid material is built per die, never cloned.
- No em dashes anywhere (code comments, README, changelog, commit messages, PR text). Use a comma, colon or full stop.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Commits in a RollQuest worktree also need the `Agent:` trailer that repo's hook asks for.
- Validation errors keep the library's existing prefix string (already in `spec.js`, do not retype it) followed by `<field>: <message>`.

## Review Focus

1. **A long frame** (a tab hidden then shown gives `dt` of seconds): the slosh's Euler integration must not blow up; `tick` clamps `dt` to 0.05 s. Pinned in Task 3.
2. **`thickness` at its floor (0.01)**: the draught must still build strictly inside the hull so it never z-fights the shell. Pinned in Task 2.
3. **Two liquid dice in one throw** (2d4 of the potion): each keeps its own uniforms and slosh while sharing one compiled program. Pinned in Task 4.
4. **`neck` below the whole model**: no shell, a warning once per entry, the die still renders and the draught still has a body. Pinned in Task 4.
5. **An entry whose `transform` rotates the model**: the split reads centroids in the die frame, so a model loaded upside down still keeps the part that ends up above `neck`. Pinned in Task 2.

---

### Task 1: The `liquid` block in the model schema

**Files:**
- Modify: `src/models/spec.js` (after `numeralSpec`, and the `return` of `modelSpec`)
- Test: `test/unit/model-validate.test.js`

**Interfaces:**
- Consumes: `hex`, `isObject`, `fail`, `MAX_EXTENT` already in `spec.js`; `shade(hex, amount)` from `src/sets/color.js`.
- Produces: `liquidSpec(field, l)` exported from `spec.js`; a resolved model entry gains `liquid: null | { color, surfaceColor, glow: null | { color, intensity }, level, thickness, glass: { color, opacity, roughness }, neck: null | number, slosh }`.

- [ ] **Step 1: Write the failing tests**

Append to `test/unit/model-validate.test.js` (it already imports `validateSet`, and defines `base`, `d4Model` and `failing`). Add the import at the top of the file:

```js
import { shade } from '../../src/sets/color.js';
```

and at the end of the file:

```js
describe('liquid in a model', () => {
    const liquid = (patch = {}) => ({ color: '#B3122A', ...patch });
    const withLiquid = (l) => validateSet({ ...base(), models: { d4: d4Model({ liquid: l }) } }).models.d4.liquid;

    it('is optional, fills its defaults and is frozen', () => {
        expect(validateSet({ ...base(), models: { d4: d4Model() } }).models.d4.liquid).toBeNull();
        expect(withLiquid(null)).toBeNull();
        const l = withLiquid(liquid());
        expect(l).toEqual({
            color: '#B3122A', surfaceColor: shade('#B3122A', 0.35), glow: null, level: 0.6, thickness: 0.06,
            glass: { color: '#FFFFFF', opacity: 0.35, roughness: 0.08 }, neck: null, slosh: 1,
        });
        expect(Object.isFrozen(l)).toBe(true);
        expect(Object.isFrozen(l.glass)).toBe(true);
    });

    it('keeps what is given, one glass field at a time', () => {
        const l = withLiquid(liquid({
            surfaceColor: '#FF8A96', glow: { color: '#FF3B4E', intensity: 0.3 }, level: 0.5, thickness: 0.1,
            glass: { opacity: 0.5 }, neck: 0.83, slosh: 0,
        }));
        expect(l.surfaceColor).toBe('#FF8A96');
        expect(l.glow).toEqual({ color: '#FF3B4E', intensity: 0.3 });
        expect(l.level).toBe(0.5);
        expect(l.thickness).toBe(0.1);
        expect(l.glass).toEqual({ color: '#FFFFFF', opacity: 0.5, roughness: 0.08 });
        expect(l.neck).toBe(0.83);
        expect(l.slosh).toBe(0);
        expect(withLiquid(liquid({ glow: { color: '#FF3B4E' } })).glow.intensity).toBe(0.3);
    });

    it('names the field that is wrong', () => {
        const bad = (l) => failing({ d4: d4Model({ liquid: l }) });
        expect(bad('red')).toBe('models.d4.liquid: must be { color, surfaceColor, glow, level, thickness, glass, neck, slosh }');
        expect(bad({ level: 0.5 })).toBe('models.d4.liquid.color: must be a #rrggbb colour');
        expect(bad(liquid({ level: 0.96 }))).toBe('models.d4.liquid.level: must be a number between 0.05 and 0.95');
        expect(bad(liquid({ thickness: 0 }))).toBe('models.d4.liquid.thickness: must be a number between 0.01 and 0.3');
        expect(bad(liquid({ neck: 9 }))).toBe('models.d4.liquid.neck: must be a number between -5 and 5');
        expect(bad(liquid({ slosh: 3 }))).toBe('models.d4.liquid.slosh: must be a number between 0 and 2');
        expect(bad(liquid({ glass: 'clear' }))).toBe('models.d4.liquid.glass: must be { color, opacity, roughness }');
        expect(bad(liquid({ glass: { opacity: 1 } }))).toBe('models.d4.liquid.glass.opacity: must be a number between 0.05 and 0.95');
        expect(bad(liquid({ glow: { color: 'pink' } }))).toBe('models.d4.liquid.glow.color: must be a #rrggbb colour');
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/unit/model-validate.test.js`
Expected: the three new tests FAIL (`liquid` is `undefined` on the resolved entry; the bad values do not throw).

- [ ] **Step 3: Implement `liquidSpec`**

In `src/models/spec.js`, add the import at the top:

```js
import { shade } from '../sets/color.js';
```

Add after `numeralSpec`:

```js
const LIQUID_GLASS = Object.freeze({ color: '#FFFFFF', opacity: 0.35, roughness: 0.08 });

/** A finite number within [min, max], or `fallback` when absent. */
function bounded(field, v, min, max, fallback) {
    if (v == null) return fallback;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) fail(field, `must be a number between ${min} and ${max}`);
    return v;
}

/**
 * The liquid inside a model (README "Model dice", "Liquid"): the draught's colours and glow,
 * its fill level, the glass shell, the neck above which the model keeps its own meshes, and
 * how far the surface sloshes. Null when absent.
 */
export function liquidSpec(field, l) {
    if (l == null) return null;
    if (!isObject(l)) fail(field, 'must be { color, surfaceColor, glow, level, thickness, glass, neck, slosh }');
    const color = hex(`${field}.color`, l.color);
    const surfaceColor = l.surfaceColor == null ? shade(color, 0.35) : hex(`${field}.surfaceColor`, l.surfaceColor);
    let glow = null;
    if (l.glow != null) {
        if (!isObject(l.glow)) fail(`${field}.glow`, 'must be { color, intensity }');
        glow = { color: hex(`${field}.glow.color`, l.glow.color), intensity: bounded(`${field}.glow.intensity`, l.glow.intensity, 0, 2, 0.3) };
    }
    const level = bounded(`${field}.level`, l.level, 0.05, 0.95, 0.6);
    const thickness = bounded(`${field}.thickness`, l.thickness, 0.01, 0.3, 0.06);
    let glass = { ...LIQUID_GLASS };
    if (l.glass != null) {
        if (!isObject(l.glass)) fail(`${field}.glass`, 'must be { color, opacity, roughness }');
        glass = {
            color: l.glass.color == null ? LIQUID_GLASS.color : hex(`${field}.glass.color`, l.glass.color),
            opacity: bounded(`${field}.glass.opacity`, l.glass.opacity, 0.05, 0.95, LIQUID_GLASS.opacity),
            roughness: bounded(`${field}.glass.roughness`, l.glass.roughness, 0, 1, LIQUID_GLASS.roughness),
        };
    }
    const neck = l.neck == null ? null : bounded(`${field}.neck`, l.neck, -MAX_EXTENT, MAX_EXTENT, null);
    const slosh = bounded(`${field}.slosh`, l.slosh, 0, 2, 1);
    return { color, surfaceColor, glow, level, thickness, glass, neck, slosh };
}
```

In `modelSpec`, change the final return to:

```js
    return { src: m.src, transform, hull, faces, labels, numeral: numeralSpec(`${field}.numeral`, m.numeral), liquid: liquidSpec(`${field}.liquid`, m.liquid) };
```

Update the `modelSpec` shape message so it still lists the required fields only (leave `'must be { src, hull, faces, labels }'` as it is).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/unit/model-validate.test.js`
Expected: PASS, including the file's existing tests (an entry without `liquid` now carries `liquid: null`; check no existing `toEqual` on a whole entry breaks, and if one does, add `liquid: null` to its expected object).

- [ ] **Step 5: Commit**

```bash
git add src/models/spec.js test/unit/model-validate.test.js
git commit -m "feat(models): validate a model entry's liquid block

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Liquid geometry: the split, the body, the cloud and the level

**Files:**
- Create: `src/models/prng.js`
- Modify: `src/models/analyze.js:44-54` (move `prng` out)
- Create: `src/models/liquid-geometry.js`
- Test: `test/unit/liquid-geometry.test.js`

**Interfaces:**
- Consumes: `buildHull(points)` from `src/models/hull.js` returning `{ points: Vector3[], faces: number[][], normals: Vector3[] }`; `ConvexGeometry` from `src/models/vendor.js`.
- Produces, all exported from `src/models/liquid-geometry.js`:
  - `splitAtNeck(object, neck)`: mutates `object` (an Object3D in the die frame with matrices current): meshes wholly above `neck` stay untouched; a mesh split in two keeps its upper triangles as a new mesh baked into the die frame added directly under `object`; every triangle below leaves the object. Returns the shell `BufferGeometry` (die frame, non-indexed, `position` + `normal`, `uv` when every part has one) or `null` when nothing lies below the neck. `neck == null` moves every triangle into the shell.
  - `liquidBody(hull, thickness)` returns `{ geometry: ConvexGeometry, points: Vector3[], planes: { normal: Vector3, constant: number }[], inradius: number }` (inradius of the outer hull).
  - `sampleCloud(body, count = 1024, seed = 1)` returns a `Float32Array` of `count * 3` die-frame coordinates inside the body.
  - `surfaceHeight(cloud, up, level, scratch?)` returns the height along the unit `up` (die frame) below which `round(level * count)` cloud points lie.
- `src/models/prng.js` exports `prng(seed)` returning `() => number` in [0, 1) (mulberry32, moved verbatim from `analyze.js`).

- [ ] **Step 1: Move `prng` into its own module**

Create `src/models/prng.js`:

```js
/** A small, fast, seedable PRNG (mulberry32), so a studio run or a sample cloud is reproducible. */
export function prng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
```

In `src/models/analyze.js` delete the local `prng` function (the comment line and the function, lines 44 to 54) and add to its imports:

```js
import { prng } from './prng.js';
```

Run: `npx vitest run test/unit/model-analyze.test.js`
Expected: PASS (same seeds, same numbers).

- [ ] **Step 2: Write the failing tests**

Create `test/unit/liquid-geometry.test.js`:

```js
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildHull } from '../../src/models/hull.js';
import { splitAtNeck, liquidBody, sampleCloud, surfaceHeight } from '../../src/models/liquid-geometry.js';

const H = 0.55;
const CUBE = [];
for (const x of [-H, H]) for (const y of [-H, H]) for (const z of [-H, H]) CUBE.push([x, y, z]);
const TETRA = [[1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1]];

/** A box with a small cylinder standing on top of it, as a flask with a stopper. */
function flask() {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2 * H, 2 * H, 2 * H), new THREE.MeshStandardMaterial({ color: 0x8844aa }));
    body.name = 'body';
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.2, 8), new THREE.MeshStandardMaterial({ color: 0x8b5a2b }));
    cap.name = 'stopper';
    cap.position.y = H + 0.1;
    group.add(body, cap);
    group.updateMatrixWorld(true);
    return group;
}
const meshNames = (object) => { const out = []; object.traverse((o) => { if (o.isMesh) out.push(o.name); }); return out.sort(); };
const triangles = (geometry) => geometry.getAttribute('position').count / 3;
const unit = (x, y, z) => new THREE.Vector3(x, y, z).normalize();

describe('splitAtNeck', () => {
    it('keeps what lies above the neck and turns the rest into the shell', () => {
        const object = flask();
        const stopper = object.getObjectByName('stopper');
        const stopperGeometry = stopper.geometry;
        const shell = splitAtNeck(object, H + 0.005);
        expect(meshNames(object)).toEqual(['stopper']);
        expect(stopper.geometry).toBe(stopperGeometry);                   // untouched
        expect(triangles(shell)).toBe(12);                                  // the box's triangles
        expect(shell.index).toBeNull();
        expect(shell.getAttribute('normal')).toBeDefined();
        expect(shell.getAttribute('uv')).toBeDefined();
    });

    it('splits one mesh in two at the neck, the upper part baked into the die frame', () => {
        const object = flask();
        const shell = splitAtNeck(object, 0);                               // through the box's middle
        const kept = object.getObjectByName('body');
        expect(kept).toBeDefined();
        expect(kept.parent).toBe(object);
        expect(kept.matrixWorld.equals(new THREE.Matrix4())).toBe(true);
        expect(triangles(kept.geometry)).toBeGreaterThan(0);
        expect(triangles(kept.geometry) + triangles(shell)).toBe(12 + 8 * 4 + 8 * 2 * 1 + 0 || triangles(kept.geometry) + triangles(shell));
        const pos = shell.getAttribute('position');
        for (let i = 0; i < pos.count; i += 3) expect((pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3).toBeLessThanOrEqual(0);
    });

    it('without a neck everything is shell; with a neck above everything nothing is kept and the shell is whole', () => {
        const all = flask();
        const shell = splitAtNeck(all, null);
        expect(meshNames(all)).toEqual([]);
        expect(triangles(shell)).toBe(12 + triangles(new THREE.CylinderGeometry(0.1, 0.1, 0.2, 8).toNonIndexed()));
        const high = flask();
        expect(triangles(splitAtNeck(high, 5))).toBe(triangles(shell));
    });

    it('returns null when nothing lies below the neck', () => {
        const object = flask();
        expect(splitAtNeck(object, -5)).toBeNull();
        expect(meshNames(object)).toEqual(['body', 'stopper']);
    });

    it('reads the die frame: a model placed upside down keeps the part that ends up above the neck', () => {
        const object = flask();
        const placed = new THREE.Group();
        placed.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
        placed.add(object);
        const root = new THREE.Group();
        root.add(placed);
        root.updateMatrixWorld(true);
        const shell = splitAtNeck(root, 0);
        expect(meshNames(root)).toEqual(['body']);                          // the stopper is now at the bottom
        const pos = shell.getAttribute('position');
        let lowest = Infinity;
        for (let i = 0; i < pos.count; i++) lowest = Math.min(lowest, pos.getY(i));
        expect(lowest).toBeCloseTo(-(H + 0.2), 4);                          // the stopper's far end, below
    });
});

describe('liquidBody', () => {
    it('pulls the hull inward by thickness times the inradius and sits strictly inside it', () => {
        const hull = buildHull(CUBE);
        const body = liquidBody(hull, 0.1);
        expect(body.inradius).toBeCloseTo(H, 6);
        for (const p of body.points) {
            for (let i = 0; i < hull.faces.length; i++) {
                const depth = hull.normals[i].dot(hull.points[hull.faces[i][0]]) - hull.normals[i].dot(p);
                expect(depth).toBeGreaterThanOrEqual(0.1 * H * 0.99);
            }
        }
        expect(body.planes).toHaveLength(6);
        expect(body.geometry.getAttribute('position').count).toBeGreaterThan(0);
    });

    it('at the floor thickness (0.01) the body is still inside the hull everywhere', () => {
        const hull = buildHull(TETRA);
        const body = liquidBody(hull, 0.01);
        for (const p of body.points) {
            for (let i = 0; i < hull.faces.length; i++) {
                const depth = hull.normals[i].dot(hull.points[hull.faces[i][0]]) - hull.normals[i].dot(p);
                expect(depth).toBeGreaterThan(0);
            }
        }
    });
});

describe('sampleCloud and surfaceHeight', () => {
    const cubeBody = liquidBody(buildHull(CUBE), 0.01);
    const cloud = sampleCloud(cubeBody, 2048, 1);

    it('samples the same points for the same seed, all inside the body', () => {
        expect(cloud).toHaveLength(2048 * 3);
        expect(sampleCloud(cubeBody, 2048, 1)).toEqual(cloud);
        expect(sampleCloud(cubeBody, 2048, 2)).not.toEqual(cloud);
        const p = new THREE.Vector3();
        for (let i = 0; i < 2048; i++) {
            p.set(cloud[3 * i], cloud[3 * i + 1], cloud[3 * i + 2]);
            for (const plane of cubeBody.planes) expect(plane.normal.dot(p)).toBeLessThanOrEqual(plane.constant + 1e-9);
        }
    });

    it('a half-full cube is half-high in every pose', () => {
        for (const up of [unit(0, 1, 0), unit(1, 0, 0), unit(0, 0, 1), unit(0, -1, 0), unit(1, 1, 0)]) {
            expect(Math.abs(surfaceHeight(cloud, up, 0.5))).toBeLessThan(0.02);
        }
        expect(surfaceHeight(cloud, unit(0, 1, 0), 0.25)).toBeCloseTo(-H * 0.5 * 0.98, 1);
    });

    it('a tetrahedron standing on a face holds half its draught in the lowest fifth of its height', () => {
        const body = liquidBody(buildHull(TETRA), 0.01);
        const tetra = sampleCloud(body, 4096, 1);
        // Apex up: the volume above height t of the way up is (1 - t)^3, so half the volume
        // lies below t = 1 - 0.5^(1/3) = 0.2063 of the height.
        const base = -1 / Math.sqrt(3) * 0.99, apex = Math.sqrt(3) * 0.99;
        const expected = base + (1 - Math.cbrt(0.5)) * (apex - base);
        for (const corner of TETRA) {
            expect(surfaceHeight(tetra, unit(...corner), 0.5)).toBeCloseTo(expected, 1);
        }
    });

    it('reuses a scratch buffer and leaves the cloud untouched', () => {
        const copy = Float32Array.from(cloud);
        const scratch = new Float32Array(2048);
        surfaceHeight(cloud, unit(0, 1, 0), 0.5, scratch);
        expect(cloud).toEqual(copy);
        expect(scratch.some((v) => v !== 0)).toBe(true);
    });
});
```

In the second `splitAtNeck` test, replace the odd `expect(... || ...)` line with the plain count check (the box is 12 triangles; cutting through the middle leaves 4 side faces split, so assert the total instead):

```js
        expect(triangles(kept.geometry) + triangles(shell)).toBe(12);
```

(The box's side faces are two triangles each with centroids at y = 0 ± H/3, so each whole triangle lands on one side: no triangle is cut.)

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run test/unit/liquid-geometry.test.js`
Expected: FAIL at import (`liquid-geometry.js` does not exist).

- [ ] **Step 4: Implement `liquid-geometry.js`**

Create `src/models/liquid-geometry.js`:

```js
import * as THREE from 'three';
import { ConvexGeometry } from './vendor.js';
import { buildHull } from './hull.js';
import { prng } from './prng.js';

/**
 * The geometry behind a model die's liquid (README "Model dice", "Liquid"): the model split
 * at its neck into kept meshes and a glass shell, the draught as the hull pulled inward, a
 * seeded cloud of points inside it, and the level that holds a share of its volume.
 */

const ATTRIBUTES = ['position', 'normal', 'uv'];

/** A non-indexed copy of a mesh's geometry in its world frame, with normals. */
function worldGeometry(mesh) {
    const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (!ATTRIBUTES.includes(name)) g.deleteAttribute(name);
    g.applyMatrix4(mesh.matrixWorld);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    return g;
}

/** The chosen triangles (by first vertex index) of a non-indexed geometry, as a new geometry. */
function pick(g, firsts) {
    const out = new THREE.BufferGeometry();
    for (const name of ATTRIBUTES) {
        const a = g.getAttribute(name);
        if (!a) continue;
        const array = new Float32Array(firsts.length * 3 * a.itemSize);
        let o = 0;
        for (const t of firsts) {
            for (let v = t; v < t + 3; v++) for (let k = 0; k < a.itemSize; k++) array[o++] = a.array[v * a.itemSize + k];
        }
        out.setAttribute(name, new THREE.BufferAttribute(array, a.itemSize));
    }
    return out;
}

/** One non-indexed geometry from several; `uv` only when every part has it. */
function merge(parts) {
    if (parts.length === 1) return parts[0];
    const out = new THREE.BufferGeometry();
    for (const name of ATTRIBUTES) {
        if (!parts.every((p) => p.getAttribute(name))) continue;
        const itemSize = parts[0].getAttribute(name).itemSize;
        const array = new Float32Array(parts.reduce((n, p) => n + p.getAttribute(name).array.length, 0));
        let o = 0;
        for (const p of parts) { array.set(p.getAttribute(name).array, o); o += p.getAttribute(name).array.length; }
        out.setAttribute(name, new THREE.BufferAttribute(array, itemSize));
    }
    parts.forEach((p) => p.dispose());
    return out;
}

/**
 * Split `object` (in the die frame, matrices current) at `neck`. Meshes wholly above stay as
 * they are. A mesh with triangles on both sides keeps its upper triangles as a new mesh
 * (same material) baked into the die frame directly under `object`; its lower triangles,
 * and every mesh wholly below, join the returned shell geometry (die frame, non-indexed).
 * Returns null when nothing lies below the neck. `neck == null` moves everything into the shell.
 */
export function splitAtNeck(object, neck) {
    object.updateMatrixWorld(true);
    const meshes = [];
    object.traverse((o) => { if (o.isMesh && o.geometry && o.geometry.getAttribute('position')) meshes.push(o); });
    const shellParts = [];
    for (const mesh of meshes) {
        const g = worldGeometry(mesh);
        const pos = g.getAttribute('position');
        const above = [], below = [];
        for (let t = 0; t < pos.count; t += 3) {
            const cy = (pos.getY(t) + pos.getY(t + 1) + pos.getY(t + 2)) / 3;
            (neck != null && cy > neck ? above : below).push(t);
        }
        if (below.length === 0) { g.dispose(); continue; }
        mesh.parent.remove(mesh);
        if (above.length === 0) { shellParts.push(g); continue; }
        const kept = new THREE.Mesh(pick(g, above), mesh.material);
        kept.name = mesh.name;
        kept.castShadow = mesh.castShadow;
        kept.receiveShadow = mesh.receiveShadow;
        object.add(kept);
        shellParts.push(pick(g, below));
        g.dispose();
    }
    object.updateMatrixWorld(true);
    return shellParts.length ? merge(shellParts) : null;
}

/**
 * The draught: the hull's points scaled towards the origin by `1 - thickness`. The nearest
 * face moves inward by `thickness` times the inradius, farther faces and the corners a little
 * more. Returns the geometry, its points, its face planes (`normal . p <= constant` inside)
 * and the outer hull's inradius.
 */
export function liquidBody(hull, thickness) {
    const inradius = Math.min(...hull.faces.map((f, i) => hull.normals[i].dot(hull.points[f[0]])));
    const points = hull.points.map((p) => p.clone().multiplyScalar(1 - thickness));
    const inner = buildHull(points);
    const planes = inner.faces.map((f, i) => ({ normal: inner.normals[i].clone(), constant: inner.normals[i].dot(inner.points[f[0]]) }));
    return { geometry: new ConvexGeometry(points), points, planes, inradius };
}

/** `count` points inside the body, the same for the same seed: rejection sampling in its box. */
export function sampleCloud(body, count = 1024, seed = 1) {
    const rand = prng(seed);
    const box = new THREE.Box3().setFromPoints(body.points);
    const size = new THREE.Vector3().subVectors(box.max, box.min);
    const out = new Float32Array(count * 3);
    const p = new THREE.Vector3();
    let n = 0, guard = 0;
    while (n < count && guard++ < count * 200) {
        p.set(box.min.x + rand() * size.x, box.min.y + rand() * size.y, box.min.z + rand() * size.z);
        if (body.planes.every((pl) => pl.normal.dot(p) <= pl.constant)) {
            out[3 * n] = p.x; out[3 * n + 1] = p.y; out[3 * n + 2] = p.z;
            n++;
        }
    }
    if (n < count) throw new Error('open-dice-dnd: the liquid body is too thin to sample');
    return out;
}

/** The k-th smallest of the first `n` values (quickselect, in place). */
function select(a, n, k) {
    let lo = 0, hi = n - 1;
    while (lo < hi) {
        const pivot = a[(lo + hi) >> 1];
        let i = lo, j = hi;
        while (i <= j) {
            while (a[i] < pivot) i++;
            while (a[j] > pivot) j--;
            if (i <= j) { const t = a[i]; a[i] = a[j]; a[j] = t; i++; j--; }
        }
        if (k <= j) hi = j;
        else if (k >= i) lo = i;
        else break;
    }
    return a[k];
}

/**
 * The height along the unit direction `up` (die frame) below which `round(level * count)`
 * of the cloud's points lie: the surface that holds that share of the draught's volume in
 * this pose. `scratch` (a Float32Array of `count`) avoids an allocation per frame.
 */
export function surfaceHeight(cloud, up, level, scratch = new Float32Array(cloud.length / 3)) {
    const n = cloud.length / 3;
    for (let i = 0; i < n; i++) scratch[i] = cloud[3 * i] * up.x + cloud[3 * i + 1] * up.y + cloud[3 * i + 2] * up.z;
    const k = Math.min(n - 1, Math.max(0, Math.round(level * n) - 1));
    return select(scratch, n, k);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run test/unit/liquid-geometry.test.js test/unit/model-analyze.test.js`
Expected: PASS. If the tetrahedron test is off by more than 0.05, raise the cloud to 8192 points in that test only (the quantile converges with the count; production uses 1024 for speed, which is fine for the eye).

- [ ] **Step 6: Commit**

```bash
git add src/models/prng.js src/models/analyze.js src/models/liquid-geometry.js test/unit/liquid-geometry.test.js
git commit -m "feat(models): liquid geometry, the split at the neck, the draught body, its level in any pose

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Slosh, the liquid and glass materials, the shader patch, the surface update

**Files:**
- Create: `src/models/liquid.js`
- Test: `test/unit/liquid.test.js`

**Interfaces:**
- Consumes: `surfaceHeight(cloud, up, level, scratch)` from Task 2.
- Produces, exported from `src/models/liquid.js`:
  - `SLOSH`: frozen tunables `{ stiffness: 40, damping: 6, push: 0.012, maxTilt: tan(20°), maxDt: 0.05, ripple: 0.08, rippleFrequency: 9, rippleSpeed: 14 }`.
  - `createSlosh(strength)` returns `{ strength, state: { x, z, vx, vz, phase, last }, get tilt(), tick(body, dt) }`; `body` needs only `velocity: { x, y, z }`.
  - `liquidUniforms(liquid)` returns `{ uSurfaceNormal: { value: Vector3 }, uSurfaceHeight: { value: number }, uSurfaceColor: { value: Color }, uRipple: { value: Vector3 } }` (ripple = amplitude, phase, frequency).
  - `patchLiquidShader(shader, uniforms)` edits `shader.vertexShader`, `shader.fragmentShader` and `shader.uniforms` in place.
  - `createLiquidMaterial(liquid, uniforms)` returns a `MeshPhysicalMaterial` with the patch installed and `userData.liquid = uniforms`.
  - `createGlassMaterial(glass, { inner })` returns a transparent `MeshPhysicalMaterial` (`BackSide`, no depth write when `inner`; `FrontSide`, depth write otherwise).
  - `updateSurface(mesh, state)` where `state = { cloud, heights, level, slosh, uniforms }`: reads `mesh.matrixWorld`, writes the uniforms.

- [ ] **Step 1: Write the failing tests**

Create `test/unit/liquid.test.js`:

```js
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildHull } from '../../src/models/hull.js';
import { liquidBody, sampleCloud } from '../../src/models/liquid-geometry.js';
import { SLOSH, createSlosh, liquidUniforms, patchLiquidShader, createLiquidMaterial, createGlassMaterial, updateSurface } from '../../src/models/liquid.js';

const DT = 1 / 60;
const LIQUID = { color: '#B3122A', surfaceColor: '#FF8A96', glow: { color: '#FF3B4E', intensity: 0.3 }, level: 0.5, thickness: 0.06, glass: { color: '#FFE9EC', opacity: 0.35, roughness: 0.08 }, neck: null, slosh: 1 };
const at = (x, y = 0, z = 0) => ({ velocity: { x, y, z } });

describe('createSlosh', () => {
    it('tilts after a change in velocity and settles flat again', () => {
        const s = createSlosh(1);
        s.tick(at(6), DT);
        s.tick(at(0), DT);
        expect(s.tilt).toBeGreaterThan(0);
        let settledVisibly = null, settled = null;
        for (let i = 0; i < 180; i++) {
            s.tick(at(0), DT);
            if (settledVisibly == null && s.tilt < 0.02) settledVisibly = i;
            if (settled == null && s.tilt < 1e-3) settled = i;
        }
        expect(settledVisibly).toBeLessThan(90);
        expect(settled).not.toBeNull();
    });

    it('never tilts past the cap, and strength 0 never tilts', () => {
        const s = createSlosh(1);
        for (let i = 0; i < 20; i++) s.tick(at(i % 2 ? 50 : -50), DT);
        expect(s.tilt).toBeLessThanOrEqual(SLOSH.maxTilt + 1e-9);
        const still = createSlosh(0);
        for (let i = 0; i < 20; i++) still.tick(at(i % 2 ? 50 : -50), DT);
        expect(still.tilt).toBe(0);
    });

    it('a long frame is clamped so the spring stays finite', () => {
        const s = createSlosh(1);
        s.tick(at(6), DT);
        s.tick(at(0), 5);
        for (let i = 0; i < 5; i++) s.tick(at(0), 5);
        expect(Number.isFinite(s.state.x) && Number.isFinite(s.state.vx)).toBe(true);
        expect(s.tilt).toBeLessThanOrEqual(SLOSH.maxTilt + 1e-9);
        expect(s.state.phase).toBeCloseTo(SLOSH.rippleSpeed * (DT + 6 * SLOSH.maxDt), 6);
    });
});

describe('the shader patch', () => {
    const shader = () => ({
        uniforms: {},
        vertexShader: '#include <common>\nvoid main() {\n#include <project_vertex>\n}',
        fragmentShader: '#include <common>\nvoid main() {\n#include <clipping_planes_fragment>\n#include <color_fragment>\n#include <normal_fragment_begin>\n}',
    });

    it('declares the varying and uniforms, discards above the surface and lights back faces as the top', () => {
        const uniforms = liquidUniforms(LIQUID);
        const s = shader();
        patchLiquidShader(s, uniforms);
        expect(s.uniforms.uSurfaceNormal).toBe(uniforms.uSurfaceNormal);
        expect(s.uniforms.uRipple).toBe(uniforms.uRipple);
        expect(s.vertexShader).toContain('varying vec3 vLiquidWorld;');
        expect(s.vertexShader).toContain('vLiquidWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        expect(s.fragmentShader).toContain('uniform vec3 uSurfaceNormal;');
        expect(s.fragmentShader).toContain('discard;');
        expect(s.fragmentShader.indexOf('discard;')).toBeGreaterThan(s.fragmentShader.indexOf('#include <clipping_planes_fragment>'));
        expect(s.fragmentShader).toContain('if (!gl_FrontFacing) diffuseColor.rgb = uSurfaceColor;');
        expect(s.fragmentShader).toContain('geometryNormal = normal;');
        expect(uniforms.uSurfaceColor.value.getHexString()).toBe('ff8a96');
    });

    it('every liquid material compiles to one program with its own uniforms', () => {
        const a = createLiquidMaterial(LIQUID, liquidUniforms(LIQUID));
        const b = createLiquidMaterial(LIQUID, liquidUniforms(LIQUID));
        expect(a.customProgramCacheKey()).toBe(b.customProgramCacheKey());
        expect(a.userData.liquid).not.toBe(b.userData.liquid);
        const s = shader();
        a.onBeforeCompile(s);
        expect(s.uniforms.uSurfaceHeight).toBe(a.userData.liquid.uSurfaceHeight);
        expect(a.side).toBe(THREE.DoubleSide);
        expect(a.transparent).toBe(false);
        expect(a.emissive.getHexString()).toBe('ff3b4e');
        expect(a.emissiveIntensity).toBe(0.3);
        expect(createLiquidMaterial({ ...LIQUID, glow: null }, liquidUniforms(LIQUID)).emissiveIntensity).toBe(0);
    });

    it('glass is transparent, the inner shell back-facing without depth writes, the outer front-facing with them', () => {
        const inner = createGlassMaterial(LIQUID.glass, { inner: true });
        const outer = createGlassMaterial(LIQUID.glass, { inner: false });
        for (const m of [inner, outer]) {
            expect(m.transparent).toBe(true);
            expect(m.opacity).toBe(0.35);
            expect(m.roughness).toBe(0.08);
            expect(m.color.getHexString()).toBe('ffe9ec');
        }
        expect(inner.side).toBe(THREE.BackSide);
        expect(inner.depthWrite).toBe(false);
        expect(outer.side).toBe(THREE.FrontSide);
        expect(outer.depthWrite).toBe(true);
    });
});

describe('updateSurface', () => {
    const H = 0.55;
    const CUBE = [];
    for (const x of [-H, H]) for (const y of [-H, H]) for (const z of [-H, H]) CUBE.push([x, y, z]);
    const body = liquidBody(buildHull(CUBE), 0.01);
    const cloud = sampleCloud(body, 2048, 1);
    const stateFor = (level = 0.5, slosh = createSlosh(1)) => ({ cloud, heights: new Float32Array(2048), level, slosh, uniforms: liquidUniforms(LIQUID) });

    it('puts a level surface through the die at the right world height, in any pose', () => {
        const die = new THREE.Group();
        const mesh = new THREE.Mesh(body.geometry);
        die.add(mesh);
        const state = stateFor(0.5);
        for (const [pos, axis, angle] of [[[0, 0, 0], [1, 0, 0], 0], [[0, 2, 0], [1, 0, 0], Math.PI / 2], [[1, 3, -2], [1, 1, 0], 1.1]]) {
            die.position.set(...pos);
            die.quaternion.setFromAxisAngle(new THREE.Vector3(...axis).normalize(), angle);
            die.updateMatrixWorld(true);
            updateSurface(mesh, state);
            expect(state.uniforms.uSurfaceNormal.value.y).toBeCloseTo(1, 6);
            expect(state.uniforms.uSurfaceHeight.value).toBeCloseTo(pos[1], 1);
            expect(state.uniforms.uRipple.value.x).toBe(0);
        }
        die.position.set(0, 0, 0);
        die.quaternion.identity();
        die.updateMatrixWorld(true);
        updateSurface(mesh, stateFor(0.25));
        expect(stateFor(0.25).uniforms.uSurfaceHeight.value).toBe(0);     // fresh uniforms untouched
    });

    it('tilts the surface by the slosh and ripples with it', () => {
        const die = new THREE.Group();
        const mesh = new THREE.Mesh(body.geometry);
        die.add(mesh);
        die.updateMatrixWorld(true);
        const slosh = createSlosh(1);
        slosh.tick(at(6), DT);
        slosh.tick(at(0), DT);
        const state = stateFor(0.5, slosh);
        updateSurface(mesh, state);
        const n = state.uniforms.uSurfaceNormal.value;
        expect(n.length()).toBeCloseTo(1, 6);
        expect(Math.abs(n.x) + Math.abs(n.z)).toBeGreaterThan(0);
        expect(state.uniforms.uRipple.value.x).toBeCloseTo(slosh.tilt * SLOSH.ripple, 6);
        expect(state.uniforms.uRipple.value.y).toBe(slosh.state.phase);
        expect(state.uniforms.uRipple.value.z).toBe(SLOSH.rippleFrequency);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/unit/liquid.test.js`
Expected: FAIL at import (`liquid.js` does not exist).

- [ ] **Step 3: Implement `liquid.js`**

Create `src/models/liquid.js`:

```js
import * as THREE from 'three';
import { surfaceHeight } from './liquid-geometry.js';

/**
 * The liquid inside a model die at run time: a spring-damped slosh fed by the roller, the
 * draught's material with the shader that cuts it at the surface, the glass, and the per-render
 * surface update. The geometry comes from liquid-geometry.js.
 */

export const SLOSH = Object.freeze({
    stiffness: 40,                            // spring pulling the surface flat
    damping: 6,                               // bleeds the swing; flat within about a second
    push: 0.012,                              // how hard a change in velocity pushes the draught
    maxTilt: Math.tan((20 * Math.PI) / 180),  // the surface never leans past 20 degrees
    maxDt: 0.05,                              // a long frame (a hidden tab) is clamped, not integrated
    ripple: 0.08,                             // ripple amplitude per unit of tilt
    rippleFrequency: 9,                       // ripples per world unit
    rippleSpeed: 14,                          // phase advance per second
});

/**
 * The slosh of one die: `tick(body, dt)` each frame with the body's velocity. A still die
 * (never ticked, or ticked with no change in velocity) keeps the surface level.
 */
export function createSlosh(strength) {
    const state = { x: 0, z: 0, vx: 0, vz: 0, phase: 0, last: null };
    return {
        strength,
        state,
        get tilt() { return Math.hypot(state.x, state.z); },
        tick(body, dt) {
            if (!(dt > 0) || !(strength > 0)) return;
            const step = Math.min(dt, SLOSH.maxDt);
            const v = body.velocity;
            if (state.last) {
                state.vx -= ((v.x - state.last.x) / step) * SLOSH.push * strength;
                state.vz -= ((v.z - state.last.z) / step) * SLOSH.push * strength;
            }
            state.last = { x: v.x, z: v.z };
            state.vx += (-SLOSH.stiffness * state.x - SLOSH.damping * state.vx) * step;
            state.vz += (-SLOSH.stiffness * state.z - SLOSH.damping * state.vz) * step;
            state.x += state.vx * step;
            state.z += state.vz * step;
            const cap = SLOSH.maxTilt * strength;
            const tilt = Math.hypot(state.x, state.z);
            if (tilt > cap) { state.x *= cap / tilt; state.z *= cap / tilt; state.vx = 0; state.vz = 0; }
            state.phase += step * SLOSH.rippleSpeed;
        },
    };
}

/** Fresh uniform objects for one die's liquid material. */
export function liquidUniforms(liquid) {
    return {
        uSurfaceNormal: { value: new THREE.Vector3(0, 1, 0) },
        uSurfaceHeight: { value: 0 },
        uSurfaceColor: { value: new THREE.Color(liquid.surfaceColor) },
        uRipple: { value: new THREE.Vector3(0, 0, SLOSH.rippleFrequency) },   // amplitude, phase, frequency
    };
}

/**
 * Cut the draught at its surface: a fragment above the (rippled) surface plane is discarded,
 * and a back face, seen through the hole the cut opens, shades as the flat top in the surface
 * colour. Written against three r130's meshphysical chunks.
 */
export function patchLiquidShader(shader, uniforms) {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLiquidWorld;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvLiquidWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', [
            '#include <common>',
            'varying vec3 vLiquidWorld;',
            'uniform vec3 uSurfaceNormal;',
            'uniform float uSurfaceHeight;',
            'uniform vec3 uSurfaceColor;',
            'uniform vec3 uRipple;',
        ].join('\n'))
        .replace('#include <clipping_planes_fragment>', [
            '#include <clipping_planes_fragment>',
            '{',
            '    float liquidRipple = uRipple.x * sin(dot(vLiquidWorld.xz, vec2(uRipple.z)) + uRipple.y);',
            '    if (dot(vLiquidWorld, uSurfaceNormal) - uSurfaceHeight - liquidRipple > 0.0) discard;',
            '}',
        ].join('\n'))
        .replace('#include <color_fragment>', '#include <color_fragment>\nif (!gl_FrontFacing) diffuseColor.rgb = uSurfaceColor;')
        .replace('#include <normal_fragment_begin>', [
            '#include <normal_fragment_begin>',
            'if (!gl_FrontFacing) {',
            '    normal = normalize((viewMatrix * vec4(uSurfaceNormal, 0.0)).xyz);',
            '    geometryNormal = normal;',
            '}',
        ].join('\n'));
}

/** The draught's material for one die. Every liquid material shares one program (same patch text). */
export function createLiquidMaterial(liquid, uniforms) {
    const material = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(liquid.color),
        roughness: 0.25,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.1,
        side: THREE.DoubleSide,
    });
    if (liquid.glow) {
        material.emissive = new THREE.Color(liquid.glow.color);
        material.emissiveIntensity = liquid.glow.intensity;
    } else {
        material.emissiveIntensity = 0;
    }
    material.userData.liquid = uniforms;
    material.onBeforeCompile = (shader) => patchLiquidShader(shader, uniforms);
    return material;
}

/** The glass shell's material: the inner shell faces inward without depth writes, the outer faces outward with them. */
export function createGlassMaterial(glass, { inner }) {
    return new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(glass.color),
        roughness: glass.roughness,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.04,
        transparent: true,
        opacity: glass.opacity,
        depthWrite: !inner,
        side: inner ? THREE.BackSide : THREE.FrontSide,
    });
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const position = new THREE.Vector3();
const rotation = new THREE.Quaternion();
const scale = new THREE.Vector3();
const upLocal = new THREE.Vector3();
const through = new THREE.Vector3();

/**
 * Before the draught renders: world up in the die frame, the level that holds `level` of the
 * volume in this pose, and the world plane through that point on the die's axis, tilted by the
 * slosh. `state` is `{ cloud, heights, level, slosh, uniforms }`.
 */
export function updateSurface(mesh, state) {
    mesh.matrixWorld.decompose(position, rotation, scale);
    upLocal.copy(WORLD_UP).applyQuaternion(rotation.invert());
    const h = surfaceHeight(state.cloud, upLocal, state.level, state.heights);
    const { uniforms, slosh } = state;
    const n = uniforms.uSurfaceNormal.value.set(slosh.state.x, 1, slosh.state.z).normalize();
    through.copy(position).addScaledVector(WORLD_UP, h);
    uniforms.uSurfaceHeight.value = through.dot(n);
    uniforms.uRipple.value.set(slosh.tilt * SLOSH.ripple, slosh.state.phase, SLOSH.rippleFrequency);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/unit/liquid.test.js`
Expected: PASS. If the settle test fails on the 1e-3 bound, raise `damping` to 7 and re-run; keep `stiffness` at 40.

- [ ] **Step 5: Commit**

```bash
git add src/models/liquid.js test/unit/liquid.test.js
git commit -m "feat(models): the liquid's slosh, materials, shader cut and surface update

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Wire the liquid into model dice and keep labels off it

**Files:**
- Modify: `src/models/liquid.js` (add `buildLiquidTemplate` and `attachLiquid`)
- Modify: `src/models/model-die.js` (`modelTemplate`, `createModelDie`, label render order)
- Modify: `src/models/labels.js:150-160` (`labelGeometry` traverse)
- Modify: `test/unit/helpers/models.js` (add `flaskScene`, `liquidCubeDesign`)
- Test: `test/unit/model-die.test.js`

**Interfaces:**
- Consumes: `splitAtNeck`, `liquidBody`, `sampleCloud` (Task 2); `createGlassMaterial`, `createLiquidMaterial`, `liquidUniforms`, `createSlosh`, `updateSurface` (Task 3); `modelHull(model)` in `model-die.js`.
- Produces:
  - `buildLiquidTemplate(template, model, hull)`: splits `template` (which sits at identity in the die frame, so a baked kept mesh lands in the right frame), adds the shells and the body to it, stores the cloud in a module `WeakMap` keyed by `template`; warns once per entry when nothing lies below the neck.
  - `attachLiquid(visual, template, model)` returns `{ mesh, state, tick(body, dt) }` for one die (`visual` is the die's clone of `template`).
  - `createModelDie` returns `liquid` beside `mesh`, `body`, `type`, `model`, `faceValues` when the entry has a liquid and the die is visible; otherwise no `liquid` property.
  - Labels have `renderOrder = 2`.

- [ ] **Step 1: Add the test helpers**

Append to `test/unit/helpers/models.js`:

```js
/** The cube design with a draught inside: everything above y = 0.3 keeps its own look. */
export function liquidCubeDesign(id = 'liquid-cube', src = 'flask.glb', liquid = {}) {
    const design = cubeDesign(id, src);
    design.models.d6 = { ...design.models.d6, liquid: { color: '#2255AA', neck: 0.3, ...liquid } };
    return design;
}

/** The scene a loader would return for it: the box plus a small cylinder standing on top (a stopper). */
export function flaskScene() {
    const scene = boxScene();
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.2, 8), new THREE.MeshStandardMaterial({ color: 0x8b5a2b }));
    cap.name = 'stopper';
    cap.position.y = H + 0.1;
    scene.add(cap);
    return scene;
}
```

- [ ] **Step 2: Write the failing tests**

Append to `test/unit/model-die.test.js` (inside the file, after the existing `describe('model dice', …)` block). Extend the imports at the top:

```js
import { liquidCubeDesign, flaskScene } from './helpers/models.js';
import { labelGeometry } from '../../src/models/labels.js';
import { modelTemplate } from '../../src/models/model-die.js';
```

(`cubeDesign`, `boxScene`, `CUBE_UPS`, `createModelDie`, `modelDieValue`, `dieMaterials`, `validateSet`, `setModelLoader`, `loadModel`, `clearModelCache`, `setCanvasFactories`, `clearDiceSetCaches`, `makeRecordingCanvas` are already imported.)

```js
describe('model dice with a liquid', () => {
    let set, restore, warn;
    const parts = (die) => { const out = []; die.mesh.traverse((o) => { if (o.isMesh && !o.userData.label) out.push(o.name); }); return out.sort(); };
    beforeEach(async () => {
        restore = setCanvasFactories({ canvas: (size) => makeRecordingCanvas(size) });
        clearDiceSetCaches();
        clearModelCache();
        warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        set = validateSet(liquidCubeDesign());
        setModelLoader(async () => flaskScene());
        await loadModel('flask.glb');
    });
    afterEach(() => { restore(); setModelLoader(null); warn.mockRestore(); });

    it('keeps the stopper, draws the box as two glass shells with the draught inside, and labels on top', () => {
        const die = createModelDie({ type: 'd6', model: set.models.d6, set, visible: true });
        expect(parts(die)).toEqual(['liquid-body', 'liquid-shell-inner', 'liquid-shell-outer', 'stopper']);
        const inner = die.mesh.getObjectByName('liquid-shell-inner');
        const outer = die.mesh.getObjectByName('liquid-shell-outer');
        const body = die.mesh.getObjectByName('liquid-body');
        expect(inner.renderOrder).toBe(0);
        expect(outer.renderOrder).toBe(1);
        expect(inner.geometry).toBe(outer.geometry);
        expect(inner.material).not.toBe(outer.material);
        expect(inner.material.side).toBe(THREE.BackSide);
        expect(outer.material.depthWrite).toBe(true);
        expect(body.userData.liquid).toBe('body');
        expect(body.material.userData.liquid).toBe(die.liquid.state.uniforms);
        expect(die.liquid.mesh).toBe(body);
        expect(typeof body.onBeforeRender).toBe('function');
        for (const label of die.mesh.children.filter((c) => c.userData.label)) expect(label.renderOrder).toBe(2);
        expect(die.mesh.children.filter((c) => c.userData.label)).toHaveLength(6);
        const materials = dieMaterials(die).filter((m) => !m.map);        // the labels carry maps
        expect(materials).toHaveLength(4);
        expect(materials.filter((m) => m.transparent)).toHaveLength(2);
    });

    it('builds the liquid material per die and shares one program between dice', () => {
        const a = createModelDie({ type: 'd6', model: set.models.d6, set, visible: true });
        const b = createModelDie({ type: 'd6', model: set.models.d6, set, visible: true });
        const template = modelTemplate(set.models.d6);
        expect(a.liquid.mesh.material).not.toBe(template.getObjectByName('liquid-body').material);
        expect(a.liquid.mesh.material).not.toBe(b.liquid.mesh.material);
        expect(a.liquid.mesh.material.customProgramCacheKey()).toBe(b.liquid.mesh.material.customProgramCacheKey());
        expect(a.liquid.state.uniforms).not.toBe(b.liquid.state.uniforms);
        expect(a.liquid.state.slosh).not.toBe(b.liquid.state.slosh);
        expect(a.liquid.state.cloud).toBe(b.liquid.state.cloud);          // the template's cloud, shared
    });

    it('levels the surface before a render, from the die pose', () => {
        const die = createModelDie({ type: 'd6', model: set.models.d6, set, visible: true });
        die.mesh.position.set(0, 2, 0);
        restOn(die, CUBE_UPS[2]);                                            // a side up
        die.mesh.updateMatrixWorld(true);
        die.liquid.mesh.onBeforeRender();
        expect(die.liquid.state.uniforms.uSurfaceHeight.value).toBeCloseTo(2 + 0.55 * 0.2, 1);   // level 0.6 of a cube: 0.1 above its middle
        expect(die.liquid.state.uniforms.uSurfaceNormal.value.y).toBeCloseTo(1, 6);
    });

    it('feeds the roller\'s tick to the slosh', () => {
        const die = createModelDie({ type: 'd6', model: set.models.d6, set, visible: true });
        die.liquid.tick({ velocity: { x: 6, y: 0, z: 0 } }, 1 / 60);
        die.liquid.tick({ velocity: { x: 0, y: 0, z: 0 } }, 1 / 60);
        expect(die.liquid.state.slosh.tilt).toBeGreaterThan(0);
    });

    it('cuts labels from the stopper and the outer shell only, never from the draught or the inner shell', () => {
        const plain = validateSet(cubeDesign('plain-cube', 'flask.glb'));
        const template = modelTemplate(set.models.d6);
        const plainTemplate = modelTemplate(plain.models.d6);
        set.models.d6.labels.forEach((label, i) => {
            const cut = labelGeometry(template, label);
            const reference = labelGeometry(plainTemplate, plain.models.d6.labels[i]);
            expect(cut.getAttribute('position').count).toBe(reference.getAttribute('position').count);
        });
    });

    it('an invisible prediction die has no liquid', () => {
        const die = createModelDie({ type: 'd6', model: set.models.d6, set, visible: false });
        expect(die.liquid).toBeUndefined();
        expect(die.mesh.children).toHaveLength(0);
    });

    it('a neck below the whole model gives a draught with no shell, and warns once', () => {
        const low = validateSet(liquidCubeDesign('low-neck', 'flask.glb', { neck: -5 }));
        const a = createModelDie({ type: 'd6', model: low.models.d6, set: low, visible: true });
        const b = createModelDie({ type: 'd6', model: low.models.d6, set: low, visible: true });
        expect(parts(a)).toEqual(['', 'liquid-body', 'stopper']);           // the box mesh has no name
        expect(b.liquid).toBeDefined();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain('nothing lies below its liquid neck');
    });

    it('a design without a liquid is untouched: one mesh, labels at order 2, no liquid', () => {
        const plain = validateSet(cubeDesign('plain-cube', 'flask.glb'));
        const die = createModelDie({ type: 'd6', model: plain.models.d6, set: plain, visible: true });
        expect(parts(die)).toEqual(['', 'stopper']);
        expect(die.liquid).toBeUndefined();
        for (const label of die.mesh.children.filter((c) => c.userData.label)) expect(label.renderOrder).toBe(2);
    });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run test/unit/model-die.test.js`
Expected: the new describe FAILS (`modelTemplate` import is fine; `parts` shows one unnamed box mesh, `die.liquid` undefined, labels at order 1).

- [ ] **Step 4: Add `buildLiquidTemplate` and `attachLiquid` to `liquid.js`**

Append to `src/models/liquid.js` (add `splitAtNeck`, `liquidBody`, `sampleCloud` to its import from `./liquid-geometry.js`):

```js
const CLOUD_POINTS = 1024;
const clouds = new WeakMap();        // template -> Float32Array (Object3D.clone would JSON-copy userData)
const warnedNeck = new WeakSet();

/**
 * Give a model template its liquid: the model split at the neck, the shell drawn twice as
 * glass, the draught's body with a placeholder material (each die builds its own), and a
 * sample cloud for the level. The split runs over `template` itself: it sits at identity in
 * the die frame, so a kept mesh baked out of the transformed scene lands in the right frame.
 */
export function buildLiquidTemplate(template, model, hull) {
    const liquid = model.liquid;
    const shell = splitAtNeck(template, liquid.neck);
    if (shell) {
        const inner = new THREE.Mesh(shell, createGlassMaterial(liquid.glass, { inner: true }));
        inner.name = 'liquid-shell-inner';
        inner.userData.liquid = 'inner';
        inner.renderOrder = 0;
        const outer = new THREE.Mesh(shell, createGlassMaterial(liquid.glass, { inner: false }));
        outer.name = 'liquid-shell-outer';
        outer.userData.liquid = 'outer';
        outer.renderOrder = 1;
        template.add(inner, outer);
    } else if (!warnedNeck.has(model)) {
        warnedNeck.add(model);
        console.warn(`open-dice-dnd: nothing lies below its liquid neck in model "${model.src}"; the model keeps its own look and the draught is drawn inside it.`);
    }
    const body = liquidBody(hull, liquid.thickness);
    const bodyMesh = new THREE.Mesh(body.geometry, new THREE.MeshBasicMaterial({ color: new THREE.Color(liquid.color) }));
    bodyMesh.name = 'liquid-body';
    bodyMesh.userData.liquid = 'body';
    template.add(bodyMesh);
    clouds.set(template, sampleCloud(body, CLOUD_POINTS, 1));
}

/**
 * One die's liquid on its clone `visual` of `template`: its own material, uniforms and slosh,
 * the surface levelled before every render. Returns `{ mesh, state, tick }`.
 */
export function attachLiquid(visual, template, model) {
    const liquid = model.liquid;
    const mesh = visual.getObjectByName('liquid-body');
    const cloud = clouds.get(template);
    const uniforms = liquidUniforms(liquid);
    mesh.material.dispose();
    mesh.material = createLiquidMaterial(liquid, uniforms);
    mesh.castShadow = true;
    const slosh = createSlosh(liquid.slosh);
    const state = { cloud, heights: new Float32Array(cloud.length / 3), level: liquid.level, slosh, uniforms };
    mesh.onBeforeRender = () => updateSurface(mesh, state);
    return { mesh, state, tick: (body, dt) => slosh.tick(body, dt) };
}
```

- [ ] **Step 5: Use them in `model-die.js`**

In `src/models/model-die.js` add the import:

```js
import { buildLiquidTemplate, attachLiquid } from './liquid.js';
```

In `modelTemplate`, after `linearColourTextures(placed);` and the two lines that create `template` and add `placed`, and before `template.updateMatrixWorld(true);`, add:

```js
        if (model.liquid) buildLiquidTemplate(template, model, modelHull(model));
```

so the block reads:

```js
        template = new THREE.Group();
        template.add(placed);
        if (model.liquid) buildLiquidTemplate(template, model, modelHull(model));
        template.updateMatrixWorld(true);
```

In `createModelDie`, change `labelMesh.renderOrder = 1;` to `labelMesh.renderOrder = 2;`, and change the return so a liquid die carries it. Replace:

```js
    return { mesh, body, type, model, faceValues: values };
```

with:

```js
    const die = { mesh, body, type, model, faceValues: values };
    if (template && model.liquid) die.liquid = attachLiquid(mesh.children[0], template, model);
    return die;
```

(`mesh.children[0]` is `visual`, added first; the labels come after it.)

- [ ] **Step 6: Keep labels off the draught in `labels.js`**

In `labelGeometry`, change the traverse guard:

```js
    template.traverse((object) => {
        if (!object.isMesh || !object.geometry || !object.geometry.getAttribute('normal')) return;
        // The draught and the inner shell sit under the surface: a decal box is deeper than the
        // glass and would print a second number on them. Labels cut from the kept meshes and the
        // outer shell only.
        if (object.userData.liquid && object.userData.liquid !== 'outer') return;
        const decal = new DecalGeometry(object, position, orientation, size);
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run test/unit/model-die.test.js test/unit/roller-models.test.js test/unit/liquid.test.js`
Expected: PASS. The existing model-die tests still see one non-label mesh for the plain cube design (no liquid there).

- [ ] **Step 8: Commit**

```bash
git add src/models/liquid.js src/models/model-die.js src/models/labels.js test/unit/helpers/models.js test/unit/model-die.test.js
git commit -m "feat(models): model dice carry their liquid, labels stay on the glass

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: The roller feeds the slosh and fades the glass from its own opacity

**Files:**
- Modify: `src/DiceRoller.js:876-889` (`_animate`), `src/DiceRoller.js:776-782` (the fade in `reset()`)
- Test: `test/unit/roller-models.test.js`

**Interfaces:**
- Consumes: `die.liquid.tick(body, dt)` from Task 4.
- Produces: no new API. `material.userData.baseOpacity` is recorded by the fade.

- [ ] **Step 1: Write the failing tests**

Append to `test/unit/roller-models.test.js` inside `describe('model dice in the roller', …)` (its `beforeEach` registers the cube design and installs the box loader; `headlessRoller`, `dieMaterials`, `createDie`, `registerDiceSet`, `loadModel`, `vi` are in scope). Add to the imports at the top:

```js
import { createDie } from '../../src/dice.js';
import { liquidCubeDesign, flaskScene } from './helpers/models.js';
```

(`getDieValue` and `dieMaterials` are already imported from `dice.js`; merge the import lines.)

```js
    describe('with a liquid', () => {
        let die;
        beforeEach(async () => {
            registerDiceSet(liquidCubeDesign());
            setModelLoader(async (src) => (src === 'flask.glb' ? flaskScene() : boxScene()));
            await loadModel('flask.glb');
            die = createDie('d6', true, true, undefined, undefined, null, null, null, null, null, null, false, null, null, { set: 'liquid-cube' });
            expect(die.liquid).toBeDefined();
        });

        it('_animate ticks each liquid with the frame time after syncing the mesh', () => {
            const r = headlessRoller();
            r.renderer = { render() {} };
            r.isAnimating = true;
            r._shouldIdle = () => true;
            r.dice.push(die);
            r.world.addBody(die.body);
            die.liquid.tick = vi.fn();
            r._animate(1000);
            expect(die.liquid.tick).toHaveBeenCalledWith(die.body, 0);
            r.isAnimating = true;
            r._animate(1016);
            expect(die.liquid.tick).toHaveBeenLastCalledWith(die.body, expect.closeTo(0.016, 3));
            expect(die.mesh.position.x).toBe(die.body.position.x);
        });

        it('reset() fades the glass from its own opacity, the opaque parts from 1', async () => {
            const frames = [];
            vi.stubGlobal('requestAnimationFrame', (cb) => { frames.push(cb); return frames.length; });
            const now = vi.spyOn(performance, 'now');
            now.mockReturnValue(0);
            const r = headlessRoller();
            r.dice.push(die);
            r._ensureAnimating = () => {};
            r.isAnimating = true;
            const glass = die.mesh.getObjectByName('liquid-shell-outer').material;
            const cork = die.mesh.getObjectByName('stopper').material;
            const done = r.reset();
            expect(glass.opacity).toBeCloseTo(0.35, 6);                       // the first frame, no time passed
            expect(cork.opacity).toBeCloseTo(1, 6);
            now.mockReturnValue(250);
            frames.shift()();
            expect(glass.opacity).toBeGreaterThan(0);
            expect(glass.opacity).toBeLessThan(0.35);
            expect(cork.opacity).toBeGreaterThan(0);
            expect(cork.opacity).toBeLessThan(1);
            expect(glass.opacity / cork.opacity).toBeCloseTo(0.35, 6);
            now.mockReturnValue(600);
            frames.shift()();
            await done;
            expect(glass.opacity).toBe(0);
            now.mockRestore();
            vi.unstubAllGlobals();
        });
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/unit/roller-models.test.js`
Expected: the two new tests FAIL (`tick` never called; glass opacity jumps to 1 on the first fade frame).

- [ ] **Step 3: Change `_animate` and the fade**

In `src/DiceRoller.js` `_animate`, replace:

```js
        if (this.lastTime !== undefined) {
            const dt = (time - this.lastTime) / 1000;
            this.world.step(1 / 60, dt, 2);
        }
        this.lastTime = time;

        this.dice.forEach(d => {
            d.mesh.position.copy(d.body.position);
            d.mesh.quaternion.copy(d.body.quaternion);
        });
```

with:

```js
        let dt = 0;
        if (this.lastTime !== undefined) {
            dt = (time - this.lastTime) / 1000;
            this.world.step(1 / 60, dt, 2);
        }
        this.lastTime = time;

        this.dice.forEach(d => {
            d.mesh.position.copy(d.body.position);
            d.mesh.quaternion.copy(d.body.quaternion);
            // A model die's liquid sloshes with the body's change in velocity (liquid.js).
            if (d.liquid) d.liquid.tick(d.body, dt);
        });
```

In `reset()`, replace:

```js
                diceToFade.forEach(d => {
                    dieMaterials(d).forEach(m => {
                        m.transparent = true;
                        m.opacity = opacity;
                    });
                });
```

with:

```js
                diceToFade.forEach(d => {
                    dieMaterials(d).forEach(m => {
                        // Fade from the material's own opacity: glass (0.35) must not pop opaque first.
                        if (m.userData.baseOpacity === undefined) m.userData.baseOpacity = m.opacity;
                        m.transparent = true;
                        m.opacity = m.userData.baseOpacity * opacity;
                    });
                });
```

- [ ] **Step 4: Run the whole unit suite**

Run: `npm test`
Expected: PASS (310 before plus the new tests). The existing fade test (`reset() fades every material of a model die`) still passes: opaque materials have base 1.

- [ ] **Step 5: Commit**

```bash
git add src/DiceRoller.js test/unit/roller-models.test.js
git commit -m "feat(roller): tick each die's liquid per frame; fade materials from their own opacity

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Render check and baselines for the flask

**Files:**
- Modify: `test/render/fixture.js` (extract `capture`, add `poseUp` and `window.__liquidCheck`)
- Modify: `test/render/run.mjs` (the `probeIn` block after the model dice check; a `LIQUID_TOLERANCE` constant)
- Create: `test/render/baseline/liquid-flask-base.png`, `test/render/baseline/liquid-flask-side.png` (written by the first run)

**Interfaces:**
- Consumes: the library through `../../src/index.js` (`dieShape`, `analyzeModelDie`, `registerDiceSet`, `createDie`, `dieMaterials`, `setModelLoader`), the fixture's `roller`, `SIZE`, `current`, `window.__renders`, `window.__diff`, `window.__loadBaseline`.
- Produces: `window.__liquidCheck()` resolving `{ ok, renders: { base, side }, parts, glowRestored }` or `{ ok: false, reason }`; two baseline PNGs; `liquid-flask-<pose>-<browser>.png` in `test/render/out/`.

- [ ] **Step 1: Extract the capture from `__renderDie`**

In `test/render/fixture.js`, add above `window.__renderDie`:

```js
/** Render the stage and keep its pixels under `key`; returns the PNG data URL. */
function capture(key) {
    roller.renderer.render(roller.scene, roller.camera);
    // Output in device pixels: at devicePixelRatio 1 (the harness) this is exactly SIZE, so
    // the baselines are unaffected; at 2 it shows whether the renderer draws at full density.
    const px = Math.round(SIZE * (window.devicePixelRatio || 1));
    const out = document.createElement('canvas');
    out.width = out.height = px;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#2b2f36';
    ctx.fillRect(0, 0, px, px);
    ctx.drawImage(roller.renderer.domElement, 0, 0, px, px);
    window.__renders[key] = ctx.getImageData(0, 0, px, px).data;
    return out.toDataURL('image/png');
}

/** The fixture's standard lean (as poseFor) with `up` turned to +Y first. */
function poseUp(up) {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3().fromArray(up).normalize(), new THREE.Vector3(0, 1, 0));
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(0.42, 0.55, 0.0, 'XYZ')).multiply(q);
}
```

and replace the tail of `__renderDie` (from `roller.renderer.render(roller.scene, roller.camera);` to `return out.toDataURL('image/png');`) with:

```js
    return capture(key || `${setId}-${type}${half === 'tens' ? '-tens' : ''}`);
```

Run: `npm run test:render`
Expected: all checks PASS exactly as before (a pure refactor; the classic baselines must still match).

- [ ] **Step 2: Add `__liquidCheck`**

Append to `test/render/fixture.js`, after `window.__modelCheck`:

```js
// A liquid flask: the library's own d4 flask shape through the stub loader, with a draught.
// Rendered still on its base and on a side; the draught must keep level, the far labels must
// hide behind the near glass, the shader must compile (page errors are collected by the
// runner), and a glow must restore the materials.
window.__liquidCheck = async () => {
    const shape = () => lib.dieShape('d4', { stopper: { radius: 0.1, height: 0.18 } });
    lib.setModelLoader(async (src) => (src === 'shape:liquid-d4' ? shape() : null));
    const flask = await lib.analyzeModelDie(shape(), { type: 'd4', throws: 120, seed: 2 });
    if (!flask.ok) return { ok: false, reason: flask.reason };
    // The neck, in the die frame: a little under the flask body's apex. dieShape seats the
    // stopper 0.08 into the apex, so the stopper's side triangles (centroids from 0.02 under
    // the apex upward) keep their paint, its hidden bottom disc joins the glass, and the apex
    // tip that stays grey is inside the cork.
    const body = shape().getObjectByName('body');
    const t = flask.model.transform;
    const q = new THREE.Quaternion().fromArray(t.rotation);
    const offset = new THREE.Vector3().fromArray(t.position);
    const pos = body.geometry.getAttribute('position');
    const v = new THREE.Vector3();
    let apex = -Infinity;
    for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).multiplyScalar(t.scale).applyQuaternion(q).add(offset);
        apex = Math.max(apex, v.y);
    }
    const neck = apex - 0.05 * t.scale;
    registerDiceSet({
        id: 'fixture-liquid', name: 'Fixture Liquid', family: 'glass',
        body: { color: '#8A1020' }, numeral: { color: '#FFFFFF' }, swatch: ['#8A1020'],
        models: { d4: { src: 'shape:liquid-d4', ...flask.model, numeral: { color: '#FFFFFF', outline: { color: '#5A0812', width: 0.1 } },
            liquid: { color: '#B3122A', surfaceColor: '#FF8A96', glow: { color: '#FF3B4E', intensity: 0.3 }, level: 0.6, neck, glass: { color: '#FFE9EC', opacity: 0.35 } } } },
    }, { replace: true });
    await roller.preloadSets(['fixture-liquid']);
    const up = (value) => flask.model.faces.find((f) => f.value === value).up;
    const renders = {};
    let die = null;
    for (const [name, face] of [['base', 4], ['side', 1]]) {
        if (current) roller.scene.remove(current.mesh);
        die = createDie('d4', true, true, undefined, undefined, null, roller.scene, null, null, null, null, false, null, roller.decalRegistry, { set: 'fixture-liquid' });
        die.mesh.quaternion.copy(poseUp(up(face)));
        die.mesh.position.set(0, 1.2, 0);
        current = die;
        renders[name] = capture(`liquid-flask-${name}`);
    }
    const parts = [];
    die.mesh.traverse((o) => { if (o.isMesh && !o.userData.label) parts.push(o.name); });
    const materials = lib.dieMaterials(die).filter((m) => m.emissive);
    const before = materials.map((m) => m.emissive.getHex());
    roller.glow(die, { color: 0xff0000, duration: 120 });
    roller._ensureAnimating();
    await new Promise((r) => setTimeout(r, 600));
    const glowRestored = materials.every((m, i) => m.emissive.getHex() === before[i]);
    return { ok: true, renders, parts: parts.sort(), glowRestored };
};
```

If `roller.glow(die, …)` needs the die in `roller.dice` to animate (check how `__modelCheck` does it: it rolls first), push the die first: `roller.dice.push(die);` before the glow and `roller.dice.length = 0;` after the wait.

- [ ] **Step 3: Run the check from the runner**

In `test/render/run.mjs`, add the constant beside `CLASSIC_TOLERANCE`:

```js
const LIQUID_TOLERANCE = 0.01;   // the glass blends many layers; 1% of pixels may drift between runs
```

and inside `probeIn`, after the model dice block (after `if (!mok) failures++;`):

```js
        // Liquid: the flask keeps its draught level in two poses, the shader compiles, glow restores,
        // and chromium's renders match the baselines (written on the first run or with --update-baseline).
        const lq = await pg.evaluate(() => window.__liquidCheck());
        let lok = lq.ok && lq.glowRestored && JSON.stringify(lq.parts) === JSON.stringify(['liquid-body', 'liquid-shell-inner', 'liquid-shell-outer', 'stopper']);
        if (lq.ok) {
            for (const name of ['base', 'side']) savePng(lq.renders[name], resolve(outDir, `liquid-flask-${name}-${label}.png`));
            const d = await pg.evaluate(([a, b]) => window.__diff(a, b), ['liquid-flask-base', 'liquid-flask-side']);
            lok = lok && d >= IMAGE_MIN_DIFF;
            console.log(`${lok ? 'PASS' : 'FAIL'} liquid flask (${label}): parts ${JSON.stringify(lq.parts)}, base vs side ${(d * 100).toFixed(1)}% (needs >= ${(IMAGE_MIN_DIFF * 100).toFixed(0)}%), glow restored ${lq.glowRestored}`);
            if (label === 'chromium') {
                for (const name of ['base', 'side']) {
                    const baselinePath = resolve(baselineDir, `liquid-flask-${name}.png`);
                    if (updateBaseline || !existsSync(baselinePath)) {
                        copyFileSync(resolve(outDir, `liquid-flask-${name}-${label}.png`), baselinePath);
                        console.log(`baseline written: ${baselinePath}`);
                        continue;
                    }
                    await pg.evaluate((url) => window.__loadBaseline(url), `/baseline/liquid-flask-${name}.png?${Date.now()}`);
                    const db = await pg.evaluate((key) => window.__diff(key, 'baseline'), `liquid-flask-${name}`);
                    const bok = db <= LIQUID_TOLERANCE;
                    console.log(`${bok ? 'PASS' : 'FAIL'} liquid-flask-${name} vs baseline: ${(db * 100).toFixed(3)}% differing (limit ${(LIQUID_TOLERANCE * 100).toFixed(1)}%)`);
                    if (!bok) failures++;
                }
            }
        } else {
            console.log(`FAIL liquid flask (${label}): ${lq.reason}`);
        }
        if (!lok) failures++;
```

Run: `npm run test:render`
Expected: `baseline written` twice, `PASS liquid flask (chromium)` and `PASS liquid flask (webkit)`, no page errors (a shader that fails to compile shows up as `console: THREE.WebGLProgram: shader error` in the errors list and fails the run).

- [ ] **Step 4: Look at the renders**

Open `test/render/out/liquid-flask-base-chromium.png` and `liquid-flask-side-chromium.png` (the Read tool shows PNGs). Check: the flask is see-through with the cork painted; the draught sits level with the table in both poses, so on its side the draught pools along the lower face and the cork points sideways; the top of the draught shows as a flat lighter disc where the cut opens; the numbers on the near faces read, the far ones do not show through. If the draught looks too dark, raise `glass.opacity` in the check to 0.45; if the level is hard to see, lower `level` to 0.5. Re-run with `--update-baseline` after any such change and look again.

- [ ] **Step 5: Run the second time without `--update-baseline`**

Run: `npm run test:render`
Expected: `PASS liquid-flask-base vs baseline` and `PASS liquid-flask-side vs baseline` under 1%.

- [ ] **Step 6: Commit**

```bash
git add test/render/fixture.js test/render/run.mjs test/render/baseline/liquid-flask-base.png test/render/baseline/liquid-flask-side.png
git commit -m "test(render): the liquid flask on its base and on a side, with baselines

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: README, changelog and version 1.10.0

**Files:**
- Modify: `readme.md:421` (the `models` entry table), `readme.md:452` (rendering notes), `readme.md:716-718` (changelog)
- Modify: `package.json:3`

- [ ] **Step 1: Document the block**

In `readme.md`, after the `numeral` row of "The `models` entry" table (line 421), add:

```markdown
| `liquid` | Optional: the model becomes a clear glass flask with a draught inside that keeps level with the table, sloshes with the throw and settles after landing. `{ color, surfaceColor, glow: { color, intensity }, level, thickness, glass: { color, opacity, roughness }, neck, slosh }`; see "Liquid" below. |
```

After the "Rendering notes" list (before `## 🔊 Sounds`), add:

```markdown
### Liquid

A model entry with `liquid` renders as a flask. Triangles whose centre lies above `neck` (a die-frame height, like `hull` and `labels`) keep the model's own meshes and paint, a cork say; everything below becomes a see-through glass shell (`glass.color`, `glass.opacity` 0.05 to 0.95, `glass.roughness`). Inside it the draught is the physics hull pulled inward by `thickness` (a share of the hull's inradius, 0.01 to 0.3, default 0.06), coloured `color` with its top in `surfaceColor` (default: `color` lightened) and an optional `glow`. `level` (0.05 to 0.95, default 0.6) is the share of the draught's volume that is filled: the surface stays level with the table in every pose and holds the same volume on a base as on a side. `slosh` (0 to 2, default 1) sets how far the surface swings with the throw; it settles flat within about a second of landing, and a still die (a preview, a cover) always shows a level fill.

```js
models: { d4: { src, hull, faces, labels, ...,
    liquid: { color: '#B3122A', glow: { color: '#FF3B4E', intensity: 0.3 }, level: 0.6, neck: 0.83, glass: { color: '#FFE9EC', opacity: 0.35 } } } }
```

The draught is cut by a shader in the die's own material (the glass has no refraction; it shows the scene's reflections). `glow` and `reset()` reach the draught and the glass like any material; `dieMaterials(die)` lists them. Labels are cut from the kept meshes and the outer glass only.
```

- [ ] **Step 2: Changelog and version**

In `readme.md`, above `### [1.9.0] - 2026-10-04`, add:

```markdown
### [1.10.0] - 2026-10-05

- 🧪 Liquid in model dice: a `models` entry's `liquid` block renders the model as a clear glass flask with a draught inside that keeps level with the table in every pose, holds the same volume on a base as on a side, sloshes with the throw and settles after landing; the model's own meshes stay above `neck` (a cork keeps its paint). `glow` and `reset()` reach the draught and the glass. Designs without the block, classic dice and prediction dice are unchanged.
- `reset()` fades every material from its own opacity, so a transparent material no longer pops opaque at the start of the fade.
```

In `package.json` set `"version": "1.10.0"`.

- [ ] **Step 3: Build and run everything**

Run: `npm test && npm run build:lib && npm run test:render`
Expected: all PASS; `dist/` rebuilt without errors.

- [ ] **Step 4: Commit**

```bash
git add readme.md package.json
git commit -m "docs(models): liquid in model dice; 1.10.0

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Pull request and publish

**Files:** none (git and npm).

- [ ] **Step 1: Push and open the PR**

```bash
git push -u origin feat/model-dice-liquid
gh pr create --title "Liquid in model dice: a glass flask whose draught keeps level and sloshes; 1.10.0" --body "$(cat <<'EOF'
## Summary
- A model entry's `liquid` block renders the model as a clear glass shell with a draught inside: level with the table in every pose, constant volume, a spring-damped slosh that settles after landing; the model's own meshes stay above `neck` (the cork keeps its paint).
- Geometry: the model split at the neck, the hull pulled inward as the draught, a seeded point cloud whose quantile sets the level; the surface updates in the liquid mesh's `onBeforeRender`, so stills (previews, covers) are right with no host change.
- A shader patch on the draught's material discards above the surface and lights back faces as the top. Glass is opacity + clearcoat + reflections (no refraction on three r130).
- The roller ticks each die's liquid per frame and `reset()` now fades every material from its own opacity.
- Spec: docs/superpowers/specs/2026-10-05-model-dice-liquid-design.md

## Test plan
- [ ] `npm test` (unit: schema, split, body, level solver, slosh, shader patch, die wiring, labels, roller tick, fade)
- [ ] `npm run test:render` (the flask on its base and on a side, chromium baselines, webkit compile)
- [ ] Classic baselines unchanged

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: After the merge, publish**

From a checkout of `main` at the merge commit:

```bash
npm whoami && npm run build:lib && npm publish && git tag v1.10.0 && git push origin v1.10.0
```

If `npm whoami` fails, stop and hand the publish to the owner (the npm account holder): the RollQuest tasks below need `open-dice-dnd@1.10.0` on npm.

---

### Task 9: RollQuest takes 1.10.0

**Repo:** `~/rollquest`, a worktree off `staging` (the app's workflow: fix PRs go to staging; a worktree needs the node_modules symlinks and commits need the `Agent:` trailer; see the repo's hooks).

**Files:**
- Modify: `packages/client-svelte/package.json:38` (`"open-dice-dnd": "1.8.0"` to `"1.10.0"`)
- Modify: `packages/admin-panel/package.json:26` (`"open-dice-dnd": "1.9.0"` to `"1.10.0"`)
- Modify: `pnpm-lock.yaml` (by `pnpm install`)

- [ ] **Step 1: Bump and install**

```bash
cd ~/rollquest/<worktree>
sed -i '' 's/"open-dice-dnd": "1.8.0"/"open-dice-dnd": "1.10.0"/' packages/client-svelte/package.json
sed -i '' 's/"open-dice-dnd": "1.9.0"/"open-dice-dnd": "1.10.0"/' packages/admin-panel/package.json
pnpm install
grep -n '"open-dice-dnd"' packages/client-svelte/package.json packages/admin-panel/package.json
```

Expected: both read `1.10.0`; `pnpm install` resolves it from npm.

- [ ] **Step 2: The client's model-dice tests still pass**

```bash
cd packages/client-svelte && node --test src/lib/diceModelLoader.test.js src/lib/modelDice.test.js src/lib/modelDiceThrow.test.js src/lib/diceDesignCatalogue.test.js
cd ../admin-panel && tsx lib/diceStudioResume.test.ts && tsx lib/diceStudioNumbers.test.ts && tsx lib/diceStudioDefinitionValid.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/client-svelte/package.json packages/admin-panel/package.json pnpm-lock.yaml
git commit -m "chore(dice): open-dice-dnd 1.10.0 (liquid in model dice)

Agent: Claude
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

(Use whatever `Agent:` trailer text the repo's hook demands; check `.githooks` or the rejection message.)

---

### Task 10: The Potion of Healing pours

**Files:**
- Modify: `packages/server/data/dice-designs/potion-of-healing.json` (`description`, `revision`, `definition.models.d4.liquid`)
- Test: `packages/server/lib/diceDesigns/catalog.test.js` (existing), `packages/admin-panel/lib/diceStudioResume.test.ts`, `packages/admin-panel/lib/diceStudioNumbers.test.ts` (existing, they read this file)

- [ ] **Step 1: Edit the entry**

In `potion-of-healing.json`:
- `"description"`: `"A d4 shaped like a glass potion flask with a cork on its point. The flask is a real 3D model: its shape decides the roll, and the glowing draught inside keeps level with the table and sloshes as it rolls. The rest of the set is ruby glass."`
- `"revision": 4`
- inside `"definition" > "models" > "d4"`, after `"numeral"`, add:

```json
        "liquid": {
          "color": "#B3122A",
          "surfaceColor": "#FF8A96",
          "glow": { "color": "#FF3B4E", "intensity": 0.3 },
          "level": 0.6,
          "thickness": 0.06,
          "glass": { "color": "#FFE9EC", "opacity": 0.35, "roughness": 0.08 },
          "neck": 0.83,
          "slosh": 1
        }
```

Keep `"src": "/dice-models/potion-of-healing-d4.glb?v=3"` (the file is unchanged).

- [ ] **Step 2: Run the catalogue and studio tests**

```bash
cd packages/server && STATE_DIVERGENCE_STRICT=true SKIP_MONGO_INTEGRATION=true node --test lib/diceDesigns/catalog.test.js lib/diceDesigns/unlockMapping.test.js lib/diceDesigns/ensureDiceDesigns.test.js
cd ../admin-panel && tsx lib/diceStudioResume.test.ts && tsx lib/diceStudioNumbers.test.ts
```

Expected: PASS (the catalogue loader validates each definition with the library's `validateSet`, so a wrong field fails here with its name).

- [ ] **Step 3: Commit**

```bash
git add packages/server/data/dice-designs/potion-of-healing.json
git commit -m "feat(dice): the Potion of Healing's draught keeps level and sloshes

Agent: Claude
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: The potion's cover, the PR, the check on staging

**Files:**
- Modify: `packages/client-svelte/public/dice-designs/potion-of-healing.png`

- [ ] **Step 1: Re-render the cover**

The library's main checkout has an ignored `.scratch/` with `models.html` + `models.js` (a page exposing `window.__cover(definition, dieType)`, the renderer the catalogue covers came from) and `covers.mjs` (a playwright script). Copy it into the library worktree and point it at this RollQuest worktree:

```bash
cp -R ~/Code/open-dice/.scratch <library worktree>/.scratch
mkdir -p <library worktree>/.scratch/models
cp ~/rollquest/<worktree>/packages/client-svelte/public/dice-models/potion-of-healing-d4.glb <library worktree>/.scratch/models/opt-potion-of-healing-d4.glb
```

Edit `<library worktree>/.scratch/covers.mjs`: set `RQ` to `~/rollquest/<worktree>/packages` (absolute), and reduce the loop to the potion only: `[['potion-of-healing', 'd4', 'potion-of-healing-d4.glb']]`, with the `writeFileSync(... opt-...)` copy line removed (the file is already in place). Then:

```bash
cd <library worktree> && npx vite --port 5173 &      # serves .scratch/models.html
node .scratch/covers.mjs                               # writes the PNG into the RollQuest worktree
kill %1
```

Open the written `potion-of-healing.png` with the Read tool: the flask front and centre, see-through, draught level, cork painted, the d6 and d20 of the set behind it. If it looks wrong, fix the definition (not the renderer) and re-run.

- [ ] **Step 2: Commit and open the PR to staging**

```bash
git add packages/client-svelte/public/dice-designs/potion-of-healing.png
git commit -m "feat(dice): the Potion of Healing cover shows the glass flask

Agent: Claude
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push -u origin <branch>
gh pr create --base staging --title "Potion of Healing: the draught acts as liquid (open-dice-dnd 1.10.0)" --body "$(cat <<'EOF'
## Summary
- open-dice-dnd 1.10.0 in client-svelte and admin-panel: liquid in model dice.
- The Potion of Healing d4 gains a `liquid` block: a clear glass flask (the cork keeps its Meshy paint above the neck) with a glowing draught that keeps level with the table whichever face it lands on, sloshes with the throw and settles after landing. Revision 4, new cover.
- Library spec and PR: richardhealy/open-dice `docs/superpowers/specs/2026-10-05-model-dice-liquid-design.md`.

## Test plan
- [ ] server catalogue tests, admin studio tests, client model-dice tests
- [ ] staging: the Potion in the drawer's dice preview shows a level draught
- [ ] staging: a live d4 roll from the QuickHUD sloshes and settles level on a side face
- [ ] staging: a replay on a second screen; the marketplace card shows the new cover

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Check on staging after the deploy**

With the no-login visual check recipe from the app notes (or signed in as the GM): open a game, pick the Potion of Healing design, look at the drawer's dice preview (level draught), roll a d4 from the QuickHUD and watch it land on a side face (the draught pools along the lower face, the cork sideways), and open the marketplace card (new cover). Report what was seen, with screenshots, in the PR.
