import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { dieShape, shapeToGlb } from '../../src/models/shapes.js';
import { analyzeModelDie, classicVolume } from '../../src/models/analyze.js';
import { buildHull, hullVolume } from '../../src/models/hull.js';
import { MODEL_DIE_TYPES, MODEL_DIE_VALUES } from '../../src/models/spec.js';

function vertices(object) {
    object.updateMatrixWorld(true);
    const out = [];
    object.traverse((o) => {
        if (!o.isMesh) return;
        const p = o.geometry.getAttribute('position');
        for (let i = 0; i < p.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld));
    });
    return out;
}

describe('dieShape', () => {
    it('builds every model die type at about the classic volume, rounded', () => {
        for (const type of MODEL_DIE_TYPES) {
            const shape = dieShape(type);
            const v = hullVolume(buildHull(vertices(shape)));
            expect(v / classicVolume(type)).toBeGreaterThan(0.9);
            expect(v / classicVolume(type)).toBeLessThan(1.01);
        }
    });

    it('stands a d4 on its base with a corner straight up', () => {
        const top = vertices(dieShape('d4')).reduce((best, p) => (p.y > best.y ? p : best));
        expect(Math.hypot(top.x, top.z)).toBeLessThan(0.08);
    });

    it('adds a stopper on top when asked', () => {
        const plain = dieShape('d4');
        const flask = dieShape('d4', { stopper: { radius: 0.1, height: 0.2 } });
        const meshes = []; flask.traverse((o) => { if (o.isMesh) meshes.push(o.name); });
        expect(meshes).toEqual(['body', 'stopper']);
        const maxY = (o) => Math.max(...vertices(o).map((p) => p.y));
        expect(maxY(flask)).toBeGreaterThan(maxY(plain));
    });

    it('refuses unknown types', () => {
        expect(() => dieShape('d100')).toThrow(/d4, d6, d8, d10, d12, d20/);
    });
});

describe('the studio recovers every classic die from its exact shape', () => {
    for (const type of MODEL_DIE_TYPES) {
        it(type, async () => {
            const sides = MODEL_DIE_VALUES[type].length;
            const r = await analyzeModelDie(dieShape(type), { type, throws: Math.max(200, sides * 16), seed: 4 });
            expect(r.ok).toBe(true);
            expect(r.model.faces).toHaveLength(sides);
            expect(r.report.coverage).toBeGreaterThan(0.9);
            for (const v of MODEL_DIE_VALUES[type]) expect(r.report.distribution[v]).toBeGreaterThan(0);
        }, 60000);
    }
});

describe('shapeToGlb', () => {
    it('writes a GLB that three reads back with the same geometry', async () => {
        const shape = dieShape('d6', { stopper: { radius: 0.12, height: 0.2 } });
        const glb = shapeToGlb(shape);
        expect(glb).toBeInstanceOf(Uint8Array);
        expect(new TextDecoder().decode(glb.subarray(0, 4))).toBe('glTF');
        const buffer = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength);
        const scene = await new Promise((resolve, reject) => new GLTFLoader().parse(buffer, '', (g) => resolve(g.scene), reject));
        const names = []; scene.traverse((o) => { if (o.isMesh) names.push(o.name); });
        expect(names).toEqual(['body', 'stopper']);
        expect(vertices(scene).length).toBe(vertices(shape).length);
        const before = hullVolume(buildHull(vertices(shape)));
        expect(hullVolume(buildHull(vertices(scene)))).toBeCloseTo(before, 4);
    });
});
