import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { analyzeModelDie, remapModelValues, summarizeThrows } from '../../src/models/analyze.js';
import { buildHull, hullVolume } from '../../src/models/hull.js';
import { classicVolume } from '../../src/models/analyze.js';
import { validateSet } from '../../src/sets/validate.js';

const mat = () => new THREE.MeshStandardMaterial();
const group = (...meshes) => { const g = new THREE.Group(); meshes.forEach((m) => g.add(m)); return g; };

/** A regular tetrahedron with one corner straight up (+Y), off-centre and scaled, as a model file might be. */
function tetraScene() {
    const mesh = new THREE.Mesh(new THREE.TetrahedronGeometry(3), mat());
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(1, 1, 1).normalize(), new THREE.Vector3(0, 1, 0));
    const g = group(mesh);
    g.position.set(5, 2, -1);
    return g;
}

/** The tetrahedron with a long cork on its top corner. */
function flaskScene() {
    const g = tetraScene();
    const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.8, 16), mat());
    cork.position.set(0, 3 + 0.6, 0);
    g.add(cork);
    return g;
}

const dieValuesOf = (r) => r.model.faces.map((f) => f.value).sort((a, b) => a - b);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe('analyzeModelDie', () => {
    it('turns a tetrahedron into a d4: four resting faces, corner labels, classic size', async () => {
        const r = await analyzeModelDie(tetraScene(), { type: 'd4', throws: 160, seed: 3 });
        expect(r.ok).toBe(true);
        expect(dieValuesOf(r)).toEqual([1, 2, 3, 4]);
        // The corner pointing up in the model is the 4.
        const four = r.model.faces.find((f) => f.value === 4);
        expect(four.up[1]).toBeGreaterThan(0.9);
        // Three corner labels per face: each value appears three times.
        expect(r.model.labels).toHaveLength(12);
        for (const v of [1, 2, 3, 4]) expect(r.model.labels.filter((l) => l.value === v)).toHaveLength(3);
        // Sized like the classic d4, centred on its centre of mass.
        expect(hullVolume(buildHull(r.model.hull))).toBeCloseTo(classicVolume('d4'), 2);
        // A regular tetrahedron rolls each face about a quarter of the time.
        for (const v of [1, 2, 3, 4]) {
            expect(r.report.distribution[v]).toBeGreaterThan(0.12);
            expect(r.report.distribution[v]).toBeLessThan(0.38);
        }
        // The result validates as a design's model entry.
        expect(() => validateSet({ id: 'tetra', name: 'Tetra', family: 'glass', body: { color: '#335577' }, numeral: { color: '#FFFFFF' }, swatch: ['#335577'], models: { d4: { src: 't.glb', ...r.model } } })).not.toThrow();
    }, 30000);

    it('puts each d4 corner label on a face that touches its corner, upright towards that corner', async () => {
        const r = await analyzeModelDie(tetraScene(), { type: 'd4', throws: 60, seed: 5 });
        for (const label of r.model.labels) {
            const corner = r.model.faces.find((f) => f.value === label.value);
            // Faces that touch a tetrahedron's corner lean towards it (cosine 1/3); the face
            // opposite the corner faces straight away from it (cosine -1).
            expect(dot(label.normal, corner.up)).toBeGreaterThan(0.2);
            expect(dot(label.normal, corner.up)).toBeLessThan(0.6);
            expect(dot(label.up, corner.up)).toBeGreaterThan(0.8);
        }
    }, 30000);

    it('turns a box into a d6: opposite faces sum to seven and the top face is the six', async () => {
        const box = group(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), mat()));
        const r = await analyzeModelDie(box, { type: 'd6', throws: 120, seed: 1 });
        expect(r.ok).toBe(true);
        expect(dieValuesOf(r)).toEqual([1, 2, 3, 4, 5, 6]);
        for (const f of r.model.faces) {
            const opposite = r.model.faces.reduce((best, g) => (dot(g.up, f.up) < dot(best.up, f.up) ? g : best));
            expect(f.value + opposite.value).toBe(7);
        }
        expect(r.model.faces.find((f) => f.value === 6).up[1]).toBeGreaterThan(0.9);
        // One label in the middle of each top face, facing out.
        expect(r.model.labels).toHaveLength(6);
        for (const label of r.model.labels) {
            const face = r.model.faces.find((f) => f.value === label.value);
            expect(dot(label.normal, face.up)).toBeGreaterThan(0.99);
            expect(dot(label.position, face.up)).toBeGreaterThan(0.4);
        }
    }, 30000);

    it('sizes a face label from the whole top of the die, even when the top is a slight dome of small facets', async () => {
        const geometry = new THREE.BoxGeometry(2, 2, 2, 8, 8, 8);
        const pos = geometry.getAttribute('position');
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
            if (y > 0.99) pos.setY(i, y + 0.03 * (1 - (x * x + z * z) / 2));
        }
        const r = await analyzeModelDie(group(new THREE.Mesh(geometry, mat())), { type: 'd6', throws: 120, seed: 1 });
        expect(r.ok).toBe(true);
        const six = r.model.labels.find((l) => l.value === 6);
        // The classic-volume cube's faces are about 1.04 wide; a label for the whole face is about 0.65.
        expect(six.size).toBeGreaterThan(0.55);
    }, 30000);

    it('sizes d4 corner labels from the whole face, even when each face is a slight dome of small facets', async () => {
        // A regular tetrahedron whose faces bulge a little: every face is many near-coplanar facets.
        const corners = [[1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1]].map((c) => new THREE.Vector3(...c));
        const faces = [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]];
        const positions = [];
        for (const [a, b, c] of faces) {
            const [A, B, C] = [corners[a], corners[b], corners[c]];
            const n = new THREE.Vector3().subVectors(B, A).cross(new THREE.Vector3().subVectors(C, A)).normalize();
            if (n.dot(A) < 0) n.negate();   // outward, so the bumps are domes rather than dents
            const point = (u, v) => {
                const w = 1 - u - v;
                const p = new THREE.Vector3().addScaledVector(A, w).addScaledVector(B, u).addScaledVector(C, v);
                return p.addScaledVector(n, 0.06 * u * v * w * 27);   // 0 on the edges, a gentle bump inside
            };
            const N = 8;
            for (let i = 0; i < N; i++) for (let j = 0; j < N - i; j++) {
                const tri = [[i, j], [i + 1, j], [i, j + 1]];
                if (i + j < N - 1) tri.push([i + 1, j], [i + 1, j + 1], [i, j + 1]);
                for (const [x, y] of tri) positions.push(...point(x / N, y / N).toArray());
            }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.computeVertexNormals();
        const r = await analyzeModelDie(group(new THREE.Mesh(geometry, mat())), { type: 'd4', throws: 120, seed: 3, maxHullPoints: 128 });
        expect(r.ok).toBe(true);
        expect(r.model.hull.length).toBeGreaterThan(4);   // the bumps survive simplification
        expect(r.model.labels).toHaveLength(12);
        // A classic-volume d4 face has an inradius near 0.57; corner labels are about one inradius wide.
        for (const label of r.model.labels) expect(label.size).toBeGreaterThan(0.4);
    }, 30000);

    it('rejects a shape with no clear resting faces', async () => {
        const ball = group(new THREE.Mesh(new THREE.IcosahedronGeometry(1, 4), mat()));
        const r = await analyzeModelDie(ball, { type: 'd6', throws: 60, seed: 1 });
        expect(r.ok).toBe(false);
        expect(r.reason).toMatch(/resting faces/);
    }, 30000);

    it('reports how a cork changes the odds, still as a d4', async () => {
        const r = await analyzeModelDie(flaskScene(), { type: 'd4', throws: 160, seed: 2 });
        expect(r.ok).toBe(true);
        expect(dieValuesOf(r)).toEqual([1, 2, 3, 4]);
        const shares = [1, 2, 3, 4].map((v) => r.report.distribution[v]);
        expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
        expect(r.report.maxDeviation).toBeGreaterThanOrEqual(0);
        expect(r.model.hull.length).toBeLessThanOrEqual(48);
    }, 30000);

    it('is reproducible for a seed and reports progress up to 1', async () => {
        const progress = [];
        const a = await analyzeModelDie(tetraScene(), { type: 'd4', throws: 40, seed: 9, onProgress: (p) => progress.push(p) });
        const b = await analyzeModelDie(tetraScene(), { type: 'd4', throws: 40, seed: 9 });
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
        expect(progress[progress.length - 1]).toBe(1);
        expect(progress.every((p, i) => i === 0 || p >= progress[i - 1])).toBe(true);
    }, 30000);

    it('never returns an entry the validator would refuse: hull points clamped, scale kept for huge models', async () => {
        const many = await analyzeModelDie(group(new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), mat())), { type: 'd20', throws: 40, seed: 1, maxHullPoints: 500 });
        if (many.ok) expect(many.model.hull.length).toBeLessThanOrEqual(128);
        // A model authored in millimetres at a vast scale still gets a usable transform.
        const huge = tetraScene();
        huge.scale.setScalar(1e7);
        const r = await analyzeModelDie(huge, { type: 'd4', throws: 40, seed: 1 });
        expect(r.ok).toBe(true);
        expect(r.model.transform.scale).toBeGreaterThan(0);
        expect(() => validateSet({ id: 'huge', name: 'Huge', family: 'glass', body: { color: '#335577' }, numeral: { color: '#FFFFFF' }, swatch: ['#335577'], models: { d4: { src: 'h.glb', ...r.model } } })).not.toThrow();
    }, 60000);

    it('refuses an unknown die type and a model with no geometry', async () => {
        await expect(analyzeModelDie(tetraScene(), { type: 'd100' })).rejects.toThrow(/d4, d6, d8, d10, d12, d20/);
        const r = await analyzeModelDie(new THREE.Group(), { type: 'd6', throws: 10 });
        expect(r.ok).toBe(false);
        expect(r.reason).toMatch(/no geometry/);
    });
});

describe('summarizeThrows', () => {
    it('computes shares, chi-square, the largest deviation and warnings', () => {
        const s = summarizeThrows({ 1: 50, 2: 25, 3: 15, 4: 10 }, { values: [1, 2, 3, 4], unused: 0 });
        expect(s.distribution).toEqual({ 1: 0.5, 2: 0.25, 3: 0.15, 4: 0.1 });
        expect(s.throws).toBe(100);
        expect(s.chiSquare).toBeCloseTo((625 + 0 + 100 + 225) / 25, 9);
        expect(s.maxDeviation).toBeCloseTo(0.25, 9);
        expect(s.warnings.some((w) => /1 rolls 50%/.test(w))).toBe(true);
        expect(summarizeThrows({ 1: 25, 2: 25, 3: 25, 4: 25 }, { values: [1, 2, 3, 4], unused: 0 }).warnings).toEqual([]);
        expect(summarizeThrows({ 1: 24, 2: 24, 3: 24, 4: 24 }, { values: [1, 2, 3, 4], unused: 4 }).warnings.some((w) => /4% of throws/.test(w))).toBe(true);
    });
});

describe('remapModelValues', () => {
    it('swaps values on faces and labels together and refuses a non-permutation', () => {
        const model = {
            faces: [{ value: 1, up: [0, 1, 0] }, { value: 2, up: [0, -1, 0] }],
            labels: [{ value: 1, position: [0, 1, 0] }, { value: 2, position: [0, -1, 0] }],
        };
        const out = remapModelValues(model, { 1: 2, 2: 1 });
        expect(out.faces.map((f) => f.value)).toEqual([2, 1]);
        expect(out.labels.map((l) => l.value)).toEqual([2, 1]);
        expect(model.faces[0].value).toBe(1); // the input is untouched
        expect(() => remapModelValues(model, { 1: 2 })).toThrow(/permutation/);
    });
});
