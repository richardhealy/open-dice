import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildHull } from '../../src/models/hull.js';
import { splitAtNeck, liquidBody, sampleCloud, surfaceHeight } from '../../src/models/liquid-geometry.js';

const H = 0.55;
const CUBE = [];
for (const x of [-H, H]) for (const y of [-H, H]) for (const z of [-H, H]) CUBE.push([x, y, z]);
const TETRA = [[1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1]];

/** A box with a small cylinder standing a little above it (0.02 clear), as a flask with a stopper. */
function flask() {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2 * H, 2 * H, 2 * H), new THREE.MeshStandardMaterial({ color: 0x8844aa }));
    body.name = 'body';
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.2, 8), new THREE.MeshStandardMaterial({ color: 0x8b5a2b }));
    cap.name = 'stopper';
    cap.position.y = H + 0.12;
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
        const shell = splitAtNeck(object, H + 0.01);                       // between the box's top and the stopper's bottom
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
        expect(triangles(kept.geometry) + triangles(shell)).toBe(12);
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
        expect(lowest).toBeCloseTo(-(H + 0.22), 4);                         // the stopper's far end, below
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
