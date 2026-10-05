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
