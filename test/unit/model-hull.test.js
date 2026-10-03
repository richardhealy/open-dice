import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { buildHull, hullVolume, hullCentroid, hullShape, simplifyHull } from '../../src/models/hull.js';

const CUBE = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
const TETRA = [[1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1]];

function outwardEveryFace(hull) {
    // Every face's normal points away from every hull point (convex, counter-clockwise from outside).
    return hull.faces.every((face, i) => {
        const n = hull.normals[i];
        const p0 = hull.points[face[0]];
        return hull.points.every((p) => n.dot(new THREE.Vector3().subVectors(p, p0)) <= 1e-9);
    });
}

describe('buildHull', () => {
    it('merges the coplanar triangles of a cube into six quads', () => {
        const hull = buildHull(CUBE);
        expect(hull.points).toHaveLength(8);
        expect(hull.faces).toHaveLength(6);
        expect(hull.faces.every((f) => f.length === 4)).toBe(true);
        expect(outwardEveryFace(hull)).toBe(true);
    });

    it('ignores interior points', () => {
        const hull = buildHull([...CUBE, [0, 0, 0], [0.5, -0.2, 0.3]]);
        expect(hull.points).toHaveLength(8);
        expect(hull.faces).toHaveLength(6);
    });

    it('gives a tetrahedron four triangles', () => {
        const hull = buildHull(TETRA);
        expect(hull.faces).toHaveLength(4);
        expect(hull.faces.every((f) => f.length === 3)).toBe(true);
        expect(outwardEveryFace(hull)).toBe(true);
    });

    it('throws on flat or too few points', () => {
        expect(() => buildHull([[0, 0, 0], [1, 0, 0], [0, 1, 0]])).toThrow(/at least 4/);
        expect(() => buildHull([[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]])).toThrow(/flat/);
    });

    it('is deterministic: the same points give the same faces', () => {
        expect(buildHull(CUBE).faces).toEqual(buildHull(CUBE).faces);
    });
});

describe('hull volume and centroid', () => {
    it('a 2x2x2 cube has volume 8 and centroid at the origin', () => {
        const hull = buildHull(CUBE);
        expect(hullVolume(hull)).toBeCloseTo(8, 9);
        const c = hullCentroid(hull);
        expect(c.length()).toBeLessThan(1e-9);
    });

    it('the centroid of a shifted tetrahedron is the mean of its corners', () => {
        const hull = buildHull(TETRA.map(([x, y, z]) => [x + 3, y - 2, z + 0.5]));
        const c = hullCentroid(hull);
        expect(c.x).toBeCloseTo(3, 9);
        expect(c.y).toBeCloseTo(-2, 9);
        expect(c.z).toBeCloseTo(0.5, 9);
        expect(hullVolume(hull)).toBeCloseTo(8 / 3, 9);
    });
});

describe('hullShape', () => {
    it('builds a cannon convex polyhedron whose normals all point out', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const shape = hullShape(buildHull(CUBE));
        expect(shape).toBeInstanceOf(CANNON.ConvexPolyhedron);
        expect(shape.vertices).toHaveLength(8);
        expect(shape.faces).toHaveLength(6);
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });

    it('rests a cube on the floor at its half height', () => {
        const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -50, 0) });
        const floor = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
        floor.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
        world.addBody(floor);
        const body = new CANNON.Body({ mass: 1, shape: hullShape(buildHull(CUBE.map((p) => p.map((v) => v * 0.5)))) });
        body.position.set(0, 2, 0);
        world.addBody(body);
        for (let i = 0; i < 400; i++) world.step(1 / 60);
        expect(body.position.y).toBeCloseTo(0.5, 1);
    });
});

describe('simplifyHull', () => {
    it('keeps a cube exactly and caps a dense sphere at the limit', () => {
        expect(simplifyHull(CUBE, 48)).toHaveLength(8);
        const sphere = [];
        for (let i = 0; i < 2000; i++) {
            const y = 1 - (2 * (i + 0.5)) / 2000, r = Math.sqrt(1 - y * y), phi = i * Math.PI * (3 - Math.sqrt(5));
            sphere.push([r * Math.cos(phi), y, r * Math.sin(phi)]);
        }
        const kept = simplifyHull(sphere, 40);
        expect(kept.length).toBeLessThanOrEqual(40);
        expect(kept.length).toBeGreaterThan(20);
        // The simplified hull keeps most of the volume.
        expect(hullVolume(buildHull(kept))).toBeGreaterThan(0.8 * (4 / 3) * Math.PI);
    });

    it('keeps the corners of a box with a bumpy face', () => {
        const pts = [...CUBE];
        for (let i = 0; i < 200; i++) pts.push([Math.sin(i) * 0.9, 1 + 0.01 * Math.cos(i * 7), Math.cos(i * 1.3) * 0.9]);
        const kept = simplifyHull(pts, 24);
        for (const corner of CUBE) {
            expect(kept.some((p) => p.every((v, k) => Math.abs(v - corner[k]) < 1e-9))).toBe(true);
        }
    });
});
