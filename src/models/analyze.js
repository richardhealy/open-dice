import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { buildHull, hullVolume, hullCentroid, hullShape, simplifyHull } from './hull.js';
import { MODEL_DIE_TYPES, MODEL_DIE_VALUES, CLASSIC_RADIUS, CORNER_READ } from './spec.js';
import { D4_GEOMETRY, D6_GEOMETRY, D8_GEOMETRY, D10_GEOMETRY, D12_GEOMETRY, D20_GEOMETRY } from '../geometry.js';
import { GRAVITY_Y, SOLVER_ITERATIONS, CONTACT, DIE_DAMPING, FRUSTUM_SIZE, WALL_THICKNESS, WALL_HEIGHT, applyThrow, isDieSettled, trackRestSteps } from '../physics-config.js';

/**
 * The model studio: turn any loaded 3D model into a design's `models` entry by throwing its
 * convex hull the way the roller throws dice and seeing how it lands. See README "Model dice".
 */

const CLASSIC_GEOMETRY = { d4: D4_GEOMETRY, d6: D6_GEOMETRY, d8: D8_GEOMETRY, d10: D10_GEOMETRY, d12: D12_GEOMETRY, d20: D20_GEOMETRY };

/** Throws run on a 16:9 table with the roller's default throw speed and spin. */
const STUDIO_TABLE = { aspect: 16 / 9, throwSpeed: 15, throwSpin: 20 };
const MAX_STEPS = 2400;
const MIN_STEPS = 60;
/** Resting up vectors within this angle are one resting face. */
const CLUSTER_COS = Math.cos((12 * Math.PI) / 180);
/** A top face must lie within this angle of the face's up to carry its label. */
const TOP_FACE_COS = Math.cos((25 * Math.PI) / 180);
/** The chosen faces must hold at least this share of throws, or the shape has no clear faces. */
const MIN_COVERAGE = 0.5;
/** Label square as a multiple of a top face's inradius. */
const FACE_LABEL_SCALE = 1.25;
/** d4 corner labels: distance from the face centre towards the corner, as a share of the way to the edge, and size per inradius. */
const CORNER_POSITION = 0.55;
const CORNER_LABEL_SCALE = 1;
/** A value whose share strays further than this from fair earns a warning. */
const WARN_DEVIATION = 0.05;
const WARN_UNUSED = 0.03;

const round = (n) => Math.round(n * 1e6) / 1e6;
const vec = (v) => [round(v.x), round(v.y), round(v.z)];

/** Volume of the classic polyhedron of `type` at its visual size. */
export function classicVolume(type) {
    const r = CLASSIC_RADIUS[type];
    const points = CLASSIC_GEOMETRY[type].vertices.map((v) => new THREE.Vector3().fromArray(v).normalize().multiplyScalar(r));
    return hullVolume(buildHull(points));
}

/** A small, fast, seedable PRNG (mulberry32) so a studio run is reproducible. */
function prng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** A throw seed shaped like the roller's own. */
function throwSeed(rand) {
    return {
        xPos: rand(), yPos: rand(), zPos: rand(),
        rotAxis: [rand(), rand(), rand()], rotAngle: rand(),
        vel: [rand(), rand(), rand()], angVel: [rand(), rand(), rand()],
    };
}

/**
 * The roller's table: floor and walls. The roller's dice-to-wall contact material names a
 * different 'wall' material from the one its walls use, so walls take cannon's default
 * contact; the studio's walls do the same, so the odds it measures are the odds a roll has.
 */
function studioWorld() {
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, GRAVITY_Y, 0) });
    world.broadphase = new CANNON.NaiveBroadphase();
    world.solver.iterations = SOLVER_ITERATIONS;
    trackRestSteps(world);
    const dice = new CANNON.Material('dice');
    const floor = new CANNON.Material('floor');
    world.addContactMaterial(new CANNON.ContactMaterial(dice, floor, { ...CONTACT.diceFloor }));
    const floorBody = new CANNON.Body({ mass: 0, material: floor, shape: new CANNON.Plane() });
    floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    world.addBody(floorBody);
    const wall = new CANNON.Material('wall');
    const half = FRUSTUM_SIZE / 2, side = (FRUSTUM_SIZE * STUDIO_TABLE.aspect) / 2;
    const addWall = (pos, ext) => {
        const body = new CANNON.Body({ mass: 0, material: wall, shape: new CANNON.Box(new CANNON.Vec3(...ext)) });
        body.position.set(...pos);
        world.addBody(body);
    };
    addWall([-side - WALL_THICKNESS / 2, WALL_HEIGHT / 2, 0], [WALL_THICKNESS / 2, WALL_HEIGHT / 2, half]);
    addWall([side + WALL_THICKNESS / 2, WALL_HEIGHT / 2, 0], [WALL_THICKNESS / 2, WALL_HEIGHT / 2, half]);
    addWall([0, WALL_HEIGHT / 2, half + WALL_THICKNESS / 2], [side, WALL_HEIGHT / 2, WALL_THICKNESS / 2]);
    addWall([0, WALL_HEIGHT / 2, -half - WALL_THICKNESS / 2], [side, WALL_HEIGHT / 2, WALL_THICKNESS / 2]);
    return { world, dice };
}

/** Throw the hull once; the die-frame direction that points up once it rests. */
function throwOnce({ world, dice }, hull, seed) {
    const body = new CANNON.Body({ mass: 1, shape: hullShape(hull), material: dice });
    body.linearDamping = DIE_DAMPING;
    body.angularDamping = DIE_DAMPING;
    body.modelDie = true;
    applyThrow(body, seed, STUDIO_TABLE);
    world.addBody(body);
    for (let step = 0; step < MAX_STEPS; step++) {
        world.step(1 / 60);
        if (step >= MIN_STEPS && isDieSettled(body)) break;
    }
    world.removeBody(body);
    const q = body.quaternion;
    const up = new CANNON.Quaternion(-q.x, -q.y, -q.z, q.w).vmult(new CANNON.Vec3(0, 1, 0));
    return new THREE.Vector3(up.x, up.y, up.z).normalize();
}

/** Group resting up vectors into resting faces, most frequent first. */
function clusterUps(ups) {
    const clusters = [];
    ups.forEach((u, i) => {
        let best = null, bestDot = CLUSTER_COS;
        for (const c of clusters) {
            const d = c.mean.dot(u);
            if (d >= bestDot) { bestDot = d; best = c; }
        }
        if (!best) {
            best = { sum: new THREE.Vector3(), mean: new THREE.Vector3(), count: 0, first: i };
            clusters.push(best);
        }
        best.sum.add(u);
        best.count++;
        best.mean.copy(best.sum).normalize();
    });
    return clusters.sort((a, b) => b.count - a.count || a.first - b.first);
}

/** Snap a resting up to the hull face it rests on (up = -face normal) when it lies flat on one. */
function snapToFace(up, hull) {
    let best = null, bestDot = Math.cos((5 * Math.PI) / 180);
    for (const n of hull.normals) {
        const d = -n.dot(up);
        if (d > bestDot) { bestDot = d; best = n; }
    }
    return best ? best.clone().negate() : up.clone();
}

const azimuth = (u) => Math.atan2(u.z, u.x);

/**
 * Values for faces with these up vectors. The face nearest the model's own +Y (its upright
 * top) takes the highest value; on every die but the d4 opposite faces pair to sum like a real
 * die's and the pairs follow by azimuth; anything left is filled in azimuth order.
 */
function assignValues(type, ups) {
    const values = MODEL_DIE_VALUES[type];
    const lo = values[0], hi = values[values.length - 1];
    const out = new Array(ups.length);
    const order = (a, b) => (ups[b].y - ups[a].y) || (azimuth(ups[a]) - azimuth(ups[b]));
    const top = ups.reduce((best, u, i) => (u.y > ups[best].y ? i : best), 0);
    if (CORNER_READ.has(type)) {
        out[top] = hi;
        const rest = ups.map((_, i) => i).filter((i) => i !== top).sort((a, b) => azimuth(ups[a]) - azimuth(ups[b]));
        rest.forEach((i, k) => { out[i] = values[k]; });
        return out;
    }
    const partner = new Array(ups.length).fill(-1);
    const byHeight = ups.map((_, i) => i).sort(order);
    for (const i of byHeight) {
        if (partner[i] !== -1) continue;
        let best = -1, bestDot = -0.8;
        for (let j = 0; j < ups.length; j++) {
            if (j === i || partner[j] !== -1) continue;
            const d = ups[i].dot(ups[j]);
            if (d < bestDot) { bestDot = d; best = j; }
        }
        if (best !== -1) { partner[i] = best; partner[best] = i; }
    }
    // Pairs, led by their higher member: the top's pair first, then by azimuth.
    const leaders = byHeight.filter((i) => partner[i] !== -1 && order(i, partner[i]) < 0);
    leaders.sort((a, b) => (a === top ? -1 : b === top ? 1 : azimuth(ups[a]) - azimuth(ups[b])));
    const used = new Set();
    leaders.forEach((i, k) => {
        out[i] = hi - k; out[partner[i]] = lo + k;
        used.add(hi - k); used.add(lo + k);
    });
    const leftValues = values.filter((v) => !used.has(v));
    const leftFaces = ups.map((_, i) => i).filter((i) => out[i] === undefined).sort((a, b) => azimuth(ups[a]) - azimuth(ups[b]));
    leftFaces.forEach((i, k) => { out[i] = leftValues[k]; });
    return out;
}

/** Area centroid of a face polygon and the distance from it to the nearest edge. */
function faceGeometry(hull, f) {
    const pts = hull.faces[f].map((i) => hull.points[i]);
    const c = new THREE.Vector3();
    let area = 0;
    for (let i = 1; i < pts.length - 1; i++) {
        const a = new THREE.Vector3().subVectors(pts[i], pts[0]).cross(new THREE.Vector3().subVectors(pts[i + 1], pts[0])).length() / 2;
        c.addScaledVector(new THREE.Vector3().add(pts[0]).add(pts[i]).add(pts[i + 1]), a / 3);
        area += a;
    }
    c.divideScalar(area);
    let inradius = Infinity;
    for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const ab = new THREE.Vector3().subVectors(b, a);
        const t = THREE.MathUtils.clamp(new THREE.Vector3().subVectors(c, a).dot(ab) / ab.lengthSq(), 0, 1);
        inradius = Math.min(inradius, c.distanceTo(a.clone().addScaledVector(ab, t)));
    }
    return { centroid: c, inradius, points: pts, normal: hull.normals[f] };
}

/** Distance from `origin` along in-plane direction `dir` to the edge of a convex face polygon. */
function distanceToEdge(face, origin, dir) {
    let best = Infinity;
    const pts = face.points;
    for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        // Solve origin + t*dir = a + s*(b - a) in the face plane.
        const e = new THREE.Vector3().subVectors(b, a);
        const n = face.normal;
        const denom = new THREE.Vector3().crossVectors(dir, e).dot(n);
        if (Math.abs(denom) < 1e-12) continue;
        const ao = new THREE.Vector3().subVectors(a, origin);
        const t = new THREE.Vector3().crossVectors(ao, e).dot(n) / denom;
        const s = new THREE.Vector3().crossVectors(ao, dir).dot(n) / denom;
        if (t > 1e-9 && s >= -1e-9 && s <= 1 + 1e-9) best = Math.min(best, t);
    }
    return best;
}

/** The face of the hull whose outward normal lies nearest `dir`, with the cosine between them. */
function nearestFace(hull, dir) {
    let best = 0, bestDot = -Infinity;
    hull.normals.forEach((n, i) => {
        const d = n.dot(dir);
        if (d > bestDot) { bestDot = d; best = i; }
    });
    return { index: best, cos: bestDot };
}

/** In-plane label "up": `reference` with the normal component removed (+Y, or -Z on a face that looks up). */
function inPlaneUp(normal) {
    const ref = Math.abs(normal.y) > 0.9 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
    return ref.addScaledVector(normal, -ref.dot(normal)).normalize();
}

/** Convex hull of 2D points (monotone chain), counter-clockwise. */
function hull2d(points) {
    const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (pts.length < 3) return pts;
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [], upper = [];
    for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
    for (const p of pts.slice().reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
    return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/**
 * The top of the die when `up` points up: every hull face lying within 10 degrees of `up` and
 * near the top plane, merged, so a top made of several gentle facets (a dome, a lid with
 * bands) counts as one face. Its area centroid, inradius and mean normal, or null.
 */
function topRegion(hull, up) {
    const top = Math.max(...hull.points.map((p) => p.dot(up)));
    const size = Math.max(...hull.points.map((p) => p.length()));
    const normal = new THREE.Vector3();
    const picked = new Set();
    hull.faces.forEach((f, i) => {
        const n = hull.normals[i];
        if (n.dot(up) < Math.cos((10 * Math.PI) / 180)) return;
        if (!f.every((k) => top - hull.points[k].dot(up) < 0.04 * size)) return;
        f.forEach((k) => picked.add(k));
        normal.add(n);
    });
    if (picked.size < 3) return null;
    normal.normalize();
    const u = inPlaneUp(normal), v = new THREE.Vector3().crossVectors(normal, u);
    const loop = hull2d([...picked].map((k) => [hull.points[k].dot(u), hull.points[k].dot(v)]));
    if (loop.length < 3) return null;
    let area = 0, cx = 0, cy = 0;
    for (let i = 0; i < loop.length; i++) {
        const [x0, y0] = loop[i], [x1, y1] = loop[(i + 1) % loop.length];
        const c = x0 * y1 - x1 * y0;
        area += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c;
    }
    area /= 2; cx /= 6 * area; cy /= 6 * area;
    let inradius = Infinity;
    for (let i = 0; i < loop.length; i++) {
        const [x0, y0] = loop[i], [x1, y1] = loop[(i + 1) % loop.length];
        const len = Math.hypot(x1 - x0, y1 - y0) || 1;
        inradius = Math.min(inradius, Math.abs((x1 - x0) * (y0 - cy) - (x0 - cx) * (y1 - y0)) / len);
    }
    const height = [...picked].reduce((sum, k) => sum + hull.points[k].dot(normal), 0) / picked.size;
    const centroid = u.clone().multiplyScalar(cx).addScaledVector(v, cy).addScaledVector(normal, height);
    return { centroid, inradius, normal };
}

/** Where the model's visible surface lies under a point, looking along -normal. */
function surfaceUnder(raycaster, template, point, normal, reach) {
    raycaster.set(point.clone().addScaledVector(normal, reach), normal.clone().negate());
    const hit = raycaster.intersectObject(template, true)[0];
    return hit ? hit.point : null;
}

function placeLabels(type, hull, faces, template, warnings) {
    const raycaster = new THREE.Raycaster();
    const reach = 4;
    const labels = [];
    if (CORNER_READ.has(type)) {
        // Each face the die can rest on carries the values of its corners, near each corner.
        for (const rest of faces) {
            const { index } = nearestFace(hull, rest.upVector.clone().negate());
            const face = faceGeometry(hull, index);
            for (const corner of faces) {
                if (corner === rest) continue;
                // The corner that points up when `corner` is the result.
                const tip = hull.points.reduce((best, p) => (p.dot(corner.upVector) > best.dot(corner.upVector) ? p : best));
                const dir = new THREE.Vector3().subVectors(tip, face.centroid);
                dir.addScaledVector(face.normal, -dir.dot(face.normal)).normalize();
                const reachEdge = distanceToEdge(face, face.centroid, dir);
                const centre = face.centroid.clone().addScaledVector(dir, CORNER_POSITION * (Number.isFinite(reachEdge) ? reachEdge : face.inradius * 2));
                const hit = surfaceUnder(raycaster, template, centre, face.normal, reach);
                if (!hit) warnings.push(`no surface under the ${corner.value} label near a corner; it sits on the hull instead`);
                labels.push({ value: corner.value, position: vec(hit || centre), normal: vec(face.normal), up: vec(dir),
                    size: round(THREE.MathUtils.clamp(CORNER_LABEL_SCALE * face.inradius, 0.05, 2)) });
            }
        }
        return labels;
    }
    for (const f of faces) {
        const { cos } = nearestFace(hull, f.upVector);
        const region = cos >= TOP_FACE_COS ? topRegion(hull, f.upVector) : null;
        if (!region) {
            // No flat top: put the label where the up direction leaves the model.
            const hit = surfaceUnder(raycaster, template, new THREE.Vector3(), f.upVector, reach);
            const size = 0.35 * Math.cbrt(classicVolume(type));
            if (!hit) { warnings.push(`no surface above the ${f.value} face; it has no label`); continue; }
            labels.push({ value: f.value, position: vec(hit), normal: vec(f.upVector), up: vec(inPlaneUp(f.upVector)), size: round(size) });
            continue;
        }
        const hit = surfaceUnder(raycaster, template, region.centroid, region.normal, reach);
        if (!hit) warnings.push(`no surface under the ${f.value} label; it sits on the hull instead`);
        labels.push({ value: f.value, position: vec(hit || region.centroid), normal: vec(region.normal), up: vec(inPlaneUp(region.normal)),
            size: round(THREE.MathUtils.clamp(FACE_LABEL_SCALE * region.inradius, 0.05, 2)) });
    }
    return labels;
}

/**
 * Shares per value, chi-square against a fair die, the largest deviation from fair and
 * warnings. `counts` maps each value to its throws (every throw reads as some value);
 * `unused` counts the throws that rested on none of the chosen faces.
 */
export function summarizeThrows(counts, { values, unused = 0, type = null }) {
    const throws = values.reduce((n, v) => n + (counts[v] || 0), 0);
    const fair = 1 / values.length;
    const expected = throws * fair;
    const distribution = {};
    let chiSquare = 0, maxDeviation = 0;
    const warnings = [];
    for (const v of values) {
        const n = counts[v] || 0;
        const share = throws ? n / throws : 0;
        distribution[v] = share;
        chiSquare += expected ? (n - expected) ** 2 / expected : 0;
        const deviation = Math.abs(share - fair);
        maxDeviation = Math.max(maxDeviation, deviation);
        if (deviation > WARN_DEVIATION) warnings.push(`${v} rolls ${Math.round(share * 100)}% (a fair ${type || 'die'} rolls each ${Math.round(fair * 100)}%)`);
    }
    const unusedShare = throws ? unused / throws : 0;
    if (unusedShare > WARN_UNUSED) warnings.push(`${Math.round(unusedShare * 100)}% of throws came to rest on none of the chosen faces and read as the nearest one`);
    return { throws, distribution, chiSquare, maxDeviation, unusedShare, warnings };
}

/** Every vertex of every mesh in `object`, in the frame the object itself sits in. */
function collectVertices(object) {
    object.updateMatrixWorld(true);
    const toLocal = object.parent ? object.parent.matrixWorld.clone().invert() : new THREE.Matrix4();
    const out = [];
    object.traverse((o) => {
        const pos = o.isMesh && o.geometry ? o.geometry.getAttribute('position') : null;
        if (!pos) return;
        const m = new THREE.Matrix4().multiplyMatrices(toLocal, o.matrixWorld);
        for (let i = 0; i < pos.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m));
    });
    return out;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Turn a loaded model into a `models` entry for a design: physics hull, face map and labels,
 * plus a report of how fairly the shape rolls.
 * @param {THREE.Object3D} object the loaded model (what the host's model loader returns)
 * @param {{ type: string, throws?: number, seed?: number, maxHullPoints?: number, onProgress?: (fraction: number) => void }} options
 * @returns {Promise<{ ok: boolean, reason?: string, model?: object, report?: object }>}
 */
export async function analyzeModelDie(object, options = {}) {
    const { type, throws = 300, seed = 1, maxHullPoints = 48, onProgress = null } = options;
    if (!MODEL_DIE_TYPES.includes(type)) throw new Error(`open-dice-dnd: analyzeModelDie needs a type: one of ${MODEL_DIE_TYPES.join(', ')}`);
    const vertices = collectVertices(object);
    if (vertices.length < 4) return { ok: false, reason: 'the model has no geometry' };

    let full;
    try { full = buildHull(vertices); } catch (error) { return { ok: false, reason: 'the model is flat: it has no volume to roll' }; }
    const centroid = hullCentroid(full);
    const scale = Math.cbrt(classicVolume(type) / hullVolume(full));
    const dieFrame = full.points.map((p) => p.clone().sub(centroid).multiplyScalar(scale));
    const hullPoints = simplifyHull(dieFrame, maxHullPoints).map((p) => p.map(round));
    const hull = buildHull(hullPoints);

    const physics = studioWorld();
    const rand = prng(seed);
    const ups = [];
    for (let t = 0; t < throws; t++) {
        ups.push(throwOnce(physics, hull, throwSeed(rand)));
        if ((t + 1) % 10 === 0 && t + 1 < throws) {
            if (onProgress) onProgress((t + 1) / throws);
            await tick();
        }
    }

    const sides = MODEL_DIE_VALUES[type].length;
    const clusters = clusterUps(ups);
    if (clusters.length < sides) {
        if (onProgress) onProgress(1);
        return { ok: false, reason: `the shape comes to rest in only ${clusters.length} distinct ways (resting faces); a ${type} needs ${sides}` };
    }
    const chosen = clusters.slice(0, sides);
    const covered = chosen.reduce((n, c) => n + c.count, 0) / throws;
    if (covered < MIN_COVERAGE) {
        if (onProgress) onProgress(1);
        return { ok: false, reason: `the shape has no clear resting faces: its ${sides} most common resting positions hold only ${Math.round(covered * 100)}% of throws` };
    }

    const upVectors = chosen.map((c) => snapToFace(c.mean, hull));
    const values = assignValues(type, upVectors);
    const faces = upVectors.map((upVector, i) => ({ value: values[i], upVector }));

    // Every throw reads as the chosen face nearest its resting up, as a roll would.
    const counts = {};
    for (const u of ups) {
        let best = faces[0], bestDot = -Infinity;
        for (const f of faces) { const d = f.upVector.dot(u); if (d > bestDot) { bestDot = d; best = f; } }
        counts[best.value] = (counts[best.value] || 0) + 1;
    }
    const unused = throws - chosen.reduce((n, c) => n + c.count, 0);
    const report = summarizeThrows(counts, { values: MODEL_DIE_VALUES[type], unused, type });

    const transform = { scale: round(scale), position: vec(centroid.clone().multiplyScalar(-scale)), rotation: [0, 0, 0, 1] };
    const template = new THREE.Group();
    const placed = new THREE.Group();
    placed.scale.setScalar(transform.scale);
    placed.position.fromArray(transform.position);
    placed.add(object.clone(true));
    template.add(placed);
    template.updateMatrixWorld(true);
    const labels = placeLabels(type, hull, faces, template, report.warnings);

    if (onProgress) onProgress(1);
    return {
        ok: true,
        model: {
            transform,
            hull: hullPoints,
            faces: faces.map((f) => ({ value: f.value, up: vec(f.upVector) })),
            labels,
        },
        report: { ...report, restingFaces: clusters.length, coverage: covered },
    };
}

/**
 * A copy of a model entry with its values renamed through `mapping` ({ from: to }), on faces
 * and labels together. The mapping must be a permutation of the values the faces use.
 */
export function remapModelValues(model, mapping) {
    const values = model.faces.map((f) => f.value);
    const targets = values.map((v) => (Object.prototype.hasOwnProperty.call(mapping, v) ? Number(mapping[v]) : v));
    if (new Set(targets).size !== values.length || targets.some((t) => !values.includes(t))) {
        throw new Error('open-dice-dnd: remapModelValues needs a permutation of the model\'s values');
    }
    const map = (v) => targets[values.indexOf(v)];
    return {
        ...model,
        faces: model.faces.map((f) => ({ ...f, value: map(f.value) })),
        labels: (model.labels || []).map((l) => ({ ...l, value: map(l.value) })),
    };
}
