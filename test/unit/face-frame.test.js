import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { makeGeometry, D4_GEOMETRY, D6_GEOMETRY, D8_GEOMETRY, D10_GEOMETRY, D12_GEOMETRY, D20_GEOMETRY } from '../../src/geometry.js';
import { FACE_FRAMES, framePolygon, frameUv, frameRadius, applyFrameTransform } from '../../src/sets/face-frame.js';

function uvsFromMakeGeometry(frame) {
    // One regular polygon face with `sides` vertices; the vertex positions are irrelevant
    // to the UVs, which makeGeometry derives from tab/af alone.
    const vertices = [];
    for (let j = 0; j < frame.sides; j++) vertices.push(new THREE.Vector3(Math.cos(j), Math.sin(j), 1));
    const face = [...Array(frame.sides).keys(), 0];
    const geom = makeGeometry(vertices, [face], 1, frame.tab, frame.af);
    const uv = geom.attributes.uv;
    const seen = new Map();
    const pos = geom.attributes.position;
    for (let i = 0; i < uv.count; i++) {
        const key = `${pos.getX(i).toFixed(5)},${pos.getY(i).toFixed(5)}`;
        seen.set(key, [uv.getX(i), uv.getY(i)]);
    }
    return vertices.map((v) => seen.get(`${v.x.toFixed(5)},${v.y.toFixed(5)}`));
}

describe('face frames', () => {
    it('lists every die type with the model constants', () => {
        expect(Object.keys(FACE_FRAMES).sort()).toEqual(['d10', 'd100', 'd12', 'd20', 'd4', 'd6', 'd8']);
        expect(FACE_FRAMES.d20).toEqual({ sides: 3, tab: -0.2, af: -Math.PI / 8, shape: 'tri' });
        expect(FACE_FRAMES.d4.shape).toBe('triCorners');
        expect(FACE_FRAMES.d100).toEqual(FACE_FRAMES.d10);
    });

    for (const [type, frame] of Object.entries(FACE_FRAMES)) {
        it(`${type}: frameUv matches makeGeometry and framePolygon is its flipY image`, () => {
            const real = uvsFromMakeGeometry(frame);
            const ts = 256;
            const poly = framePolygon(frame, ts);
            for (let j = 0; j < frame.sides; j++) {
                const [u, v] = frameUv(frame, j);
                expect(u).toBeCloseTo(real[j][0], 6);
                expect(v).toBeCloseTo(real[j][1], 6);
                expect(poly[j][0]).toBeCloseTo(u * ts, 6);
                expect(poly[j][1]).toBeCloseTo((1 - v) * ts, 6);
            }
        });
    }

    it('sides come from the real face polygons in geometry.js, not from an assumed shape', () => {
        const sidesOf = (G) => G.faces[0].length - 1;
        expect(FACE_FRAMES.d4.sides).toBe(sidesOf(D4_GEOMETRY));
        expect(FACE_FRAMES.d6.sides).toBe(sidesOf(D6_GEOMETRY));
        expect(FACE_FRAMES.d8.sides).toBe(sidesOf(D8_GEOMETRY));
        expect(FACE_FRAMES.d10.sides).toBe(sidesOf(D10_GEOMETRY));      // a d10 "kite" is textured as a triangle
        expect(FACE_FRAMES.d100.sides).toBe(sidesOf(D10_GEOMETRY));
        expect(FACE_FRAMES.d12.sides).toBe(sidesOf(D12_GEOMETRY));
        expect(FACE_FRAMES.d20.sides).toBe(sidesOf(D20_GEOMETRY));
    });

    it('frameRadius is ts / (2 (1 + tab))', () => {
        expect(frameRadius(FACE_FRAMES.d6, 256)).toBeCloseTo(256 / 2.2, 9);
        expect(frameRadius(FACE_FRAMES.d20, 256)).toBeCloseTo(160, 9);
    });

    it('applyFrameTransform translates, scales by (R, -R) and rotates by af', () => {
        const calls = [];
        const ctx = { translate: (...a) => calls.push(['translate', ...a]), scale: (...a) => calls.push(['scale', ...a]), rotate: (...a) => calls.push(['rotate', ...a]) };
        applyFrameTransform(ctx, FACE_FRAMES.d20, 256);
        expect(calls).toEqual([['translate', 128, 128], ['scale', 160, -160], ['rotate', -Math.PI / 8]]);
    });
});
