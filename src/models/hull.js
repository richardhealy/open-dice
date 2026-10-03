import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { ConvexHull } from './vendor.js';

/**
 * Convex hulls for model dice. A model die's physics body is the convex hull of a short list
 * of points, so every client that builds the body from the same points gets the same faces in
 * the same order (QuickHull is deterministic for a given input order) and the same physics.
 */

const toVector = (p) => (p && p.isVector3 ? p.clone() : new THREE.Vector3(p[0], p[1], p[2]));

/** Largest coordinate magnitude, the scale for the coplanarity tolerance. */
function extentOf(points) {
    let m = 0;
    for (const p of points) m = Math.max(m, Math.abs(p.x), Math.abs(p.y), Math.abs(p.z));
    return m || 1;
}

/** Newell's method: the unit normal of a planar polygon wound counter-clockwise. */
function polygonNormal(points, face) {
    const n = new THREE.Vector3();
    for (let i = 0; i < face.length; i++) {
        const a = points[face[i]], b = points[face[(i + 1) % face.length]];
        n.x += (a.y - b.y) * (a.z + b.z);
        n.y += (a.z - b.z) * (a.x + b.x);
        n.z += (a.x - b.x) * (a.y + b.y);
    }
    return n.normalize();
}

/**
 * The convex hull of `points` ([x, y, z] arrays or Vector3s): its corner points, its faces as
 * counter-clockwise (seen from outside) index loops into those points, and each face's outward
 * unit normal. Triangles that lie in one plane are merged into one polygon, so a cube has six
 * quads and a d8 eight triangles.
 * @param {Array<number[]|THREE.Vector3>} points
 * @returns {{ points: THREE.Vector3[], faces: number[][], normals: THREE.Vector3[] }}
 */
export function buildHull(points) {
    if (!Array.isArray(points) || points.length < 4) throw new Error('open-dice-dnd: a hull needs at least 4 points');
    const input = points.map(toVector);
    const extent = extentOf(input);
    const quick = new ConvexHull().setFromPoints(input);
    if (quick.faces.length < 4) throw new Error('open-dice-dnd: the hull points are flat (they span no volume)');

    // Hull corners, numbered in the order the faces first reach them.
    const index = new Map();
    const corners = [];
    const triangles = quick.faces.map((face) => {
        const loop = [];
        let edge = face.edge;
        do {
            const node = edge.head();
            if (!index.has(node)) { index.set(node, corners.length); corners.push(node.point.clone()); }
            loop.push(index.get(node));
            edge = edge.next;
        } while (edge !== face.edge);
        return { loop, normal: face.normal.clone(), constant: face.constant };
    });
    // QuickHull of a flat set still returns faces; a hull without volume is flat.
    let volume = 0;
    for (const t of triangles) {
        const [a, b, c] = t.loop.map((i) => corners[i]);
        volume += a.dot(new THREE.Vector3().crossVectors(b, c)) / 6;
    }
    if (!(Math.abs(volume) > 1e-9 * extent ** 3)) throw new Error('open-dice-dnd: the hull points are flat (they span no volume)');

    // Group triangles by plane (exactly coplanar up to rounding), keeping the first triangle's order.
    const groups = [];
    for (const t of triangles) {
        const g = groups.find((x) => x.normal.dot(t.normal) > 1 - 1e-9 && Math.abs(x.constant - t.constant) < 1e-9 * extent);
        if (g) g.triangles.push(t.loop);
        else groups.push({ normal: t.normal, constant: t.constant, triangles: [t.loop] });
    }

    const faces = groups.map((g) => {
        if (g.triangles.length === 1) return g.triangles[0].slice();
        // The polygon's boundary: directed edges whose reverse is not in the group.
        const directed = new Set();
        for (const tri of g.triangles) for (let i = 0; i < tri.length; i++) directed.add(`${tri[i]}>${tri[(i + 1) % tri.length]}`);
        const next = new Map();
        for (const tri of g.triangles) {
            for (let i = 0; i < tri.length; i++) {
                const a = tri[i], b = tri[(i + 1) % tri.length];
                if (!directed.has(`${b}>${a}`)) next.set(a, b);
            }
        }
        const start = g.triangles[0].find((v) => next.has(v));
        const loop = [start];
        for (let v = next.get(start); v !== start && loop.length <= next.size; v = next.get(v)) loop.push(v);
        // Drop corners that sit on a straight edge of the merged polygon.
        return loop.filter((v, i) => {
            const prev = corners[loop[(i + loop.length - 1) % loop.length]], cur = corners[v], nxt = corners[loop[(i + 1) % loop.length]];
            const cross = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(cur, prev), new THREE.Vector3().subVectors(nxt, cur));
            return cross.length() > 1e-12 * extent * extent;
        });
    });

    // Corners left unused by straight-edge removal are dropped and the faces renumbered.
    const used = [...new Set(faces.flat())].sort((a, b) => a - b);
    const renumber = new Map(used.map((v, i) => [v, i]));
    const hullPoints = used.map((v) => corners[v]);
    const hullFaces = faces.map((f) => f.map((v) => renumber.get(v)));
    return { points: hullPoints, faces: hullFaces, normals: hullFaces.map((f) => polygonNormal(hullPoints, f)) };
}

/** Fan triangles of every face: [a, b, c] Vector3 triples, counter-clockwise from outside. */
function fan(hull) {
    const out = [];
    for (const f of hull.faces) {
        for (let i = 1; i < f.length - 1; i++) out.push([hull.points[f[0]], hull.points[f[i]], hull.points[f[i + 1]]]);
    }
    return out;
}

/** Enclosed volume of a hull from buildHull. */
export function hullVolume(hull) {
    let v = 0;
    for (const [a, b, c] of fan(hull)) v += a.dot(new THREE.Vector3().crossVectors(b, c)) / 6;
    return v;
}

/** Volume centroid (centre of mass at uniform density) of a hull from buildHull. */
export function hullCentroid(hull) {
    let total = 0;
    const sum = new THREE.Vector3();
    for (const [a, b, c] of fan(hull)) {
        const v = a.dot(new THREE.Vector3().crossVectors(b, c)) / 6;
        total += v;
        sum.addScaledVector(new THREE.Vector3().add(a).add(b).add(c), v / 4);
    }
    return sum.divideScalar(total);
}

/**
 * A cannon-es ConvexPolyhedron for a hull from buildHull. The hull must contain the origin
 * (model dice centre their hull on its centroid), or cannon reports its faces as inward.
 */
export function hullShape(hull) {
    return new CANNON.ConvexPolyhedron({
        vertices: hull.points.map((p) => new CANNON.Vec3(p.x, p.y, p.z)),
        faces: hull.faces.map((f) => f.slice()),
    });
}

/** `count` unit directions spread evenly over the sphere (a Fibonacci lattice). */
export function sphereDirections(count) {
    const out = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) {
        const y = 1 - (2 * (i + 0.5)) / count;
        const r = Math.sqrt(Math.max(0, 1 - y * y));
        out.push(new THREE.Vector3(r * Math.cos(i * golden), y, r * Math.sin(i * golden)));
    }
    return out;
}

/** Indices of the support points (the farthest point along each direction), first-seen order. */
function supportIndices(points, directions) {
    const seen = new Set();
    const out = [];
    for (const d of directions) {
        let best = 0, bestDot = -Infinity;
        for (let i = 0; i < points.length; i++) {
            const dot = points[i].dot(d);
            if (dot > bestDot) { bestDot = dot; best = i; }
        }
        if (!seen.has(best)) { seen.add(best); out.push(best); }
    }
    return out;
}

/**
 * At most `max` points whose hull follows the hull of `points`: the hull's corners when there
 * are few enough, otherwise the support points over the densest direction set (up to 256
 * directions) that stays within `max`. Corners a die rests on are extreme in a wide cone of
 * directions, so they survive; points on gentle curves are thinned.
 * @returns {number[][]} [x, y, z] arrays
 */
export function simplifyHull(points, max = 48) {
    const hull = buildHull(points);
    const asArrays = (list) => list.map((p) => [p.x, p.y, p.z]);
    if (hull.points.length <= max) return asArrays(hull.points);
    let best = null;
    let lo = 8, hi = 256;
    while (lo <= hi) {
        const k = (lo + hi) >> 1;
        const picked = supportIndices(hull.points, sphereDirections(k));
        if (picked.length <= max) { best = picked; lo = k + 1; } else { hi = k - 1; }
    }
    if (!best || best.length < 4) best = supportIndices(hull.points, sphereDirections(8));
    return asArrays(best.map((i) => hull.points[i]));
}
