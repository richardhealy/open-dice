import { describe, it, expect } from 'vitest';
import { heightToNormal } from '../../src/sets/normal-map.js';

describe('heightToNormal', () => {
    it('encodes a flat surface as (128, 128, 255, 255)', () => {
        const h = new Uint8ClampedArray(8 * 8).fill(90);
        const out = heightToNormal(h, 8, 8);
        for (let i = 0; i < out.length; i += 4) {
            expect([out[i], out[i + 1], out[i + 2], out[i + 3]]).toEqual([128, 128, 255, 255]);
        }
    });

    it('a step up from left to right tilts normals toward -x and leaves y level', () => {
        const w = 8, hgt = 8;
        const h = new Uint8ClampedArray(w * hgt);
        for (let y = 0; y < hgt; y++) for (let x = 0; x < w; x++) h[y * w + x] = x >= 4 ? 255 : 0;
        const out = heightToNormal(h, w, hgt, 1);
        const i = (3 * w + 4) * 4;          // a pixel on the edge column
        expect(out[i]).toBeLessThan(128);     // red < 128 → normal.x negative
        expect(out[i + 1]).toBe(128);         // green level
        expect(out[i + 2]).toBeLessThan(255); // tilted, so z < 1
        const flat = (3 * w + 1) * 4;         // far from the edge
        expect([out[flat], out[flat + 1], out[flat + 2]]).toEqual([128, 128, 255]);
    });

    it('a step up from top to bottom (canvas y down) tilts normals toward -y in texture space', () => {
        const w = 8, hgt = 8;
        const h = new Uint8ClampedArray(w * hgt);
        for (let y = 0; y < hgt; y++) for (let x = 0; x < w; x++) h[y * w + x] = y >= 4 ? 255 : 0;
        const out = heightToNormal(h, w, hgt, 1);
        const i = (4 * w + 3) * 4;
        expect(out[i]).toBe(128);
        // height rises as canvas y grows, i.e. as texture v falls: dh/dv < 0 → n.y = -dh/dv > 0 → green > 128
        expect(out[i + 1]).toBeGreaterThan(128);
    });
});
