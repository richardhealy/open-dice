import { describe, it, expect } from 'vitest';
import { buildFiligree } from '../../src/sets/decor/filigree.js';
import { DECOR, DECOR_SHAPES, hasDecor, getDecor } from '../../src/sets/decor/index.js';

const PATH_SYNTAX = /^[MLQAZ0-9 .\-]+$/;

describe('filigree generator', () => {
    it('emits frame, vine, berry and knot per edge for centred numerals', () => {
        const paths = buildFiligree(3);
        expect(paths).toHaveLength(12);
        const strokes = paths.filter((p) => !p.fill), fills = paths.filter((p) => p.fill);
        expect(strokes).toHaveLength(6);
        expect(fills).toHaveLength(6);
        for (const p of paths) {
            expect(p.d).toMatch(PATH_SYNTAX);
            expect(p.fill ? p.stroke === 0 : p.stroke > 0).toBe(true);
        }
    });

    it('keeps the centre clear: vines never come closer than 0.3 to the origin', () => {
        for (const sides of [3, 4, 5]) {
            const vines = buildFiligree(sides).filter((p) => p.d.includes('Q'));
            for (const v of vines) {
                const nums = v.d.match(/-?\d+(\.\d+)?/g).map(Number);
                // M ax ay Q qx qy bx by → deepest point at t = 0.5
                const [ax, ay, qx, qy, bx, by] = nums;
                const px = 0.25 * ax + 0.5 * qx + 0.25 * bx, py = 0.25 * ay + 0.5 * qy + 0.25 * by;
                expect(Math.hypot(px, py)).toBeGreaterThan(0.3);
            }
        }
    });

    it('corner layout drops the vines and adds a centre rosette', () => {
        const paths = buildFiligree(3, { corners: true });
        expect(paths.filter((p) => p.d.includes('Q'))).toHaveLength(0);
        expect(paths).toHaveLength(3 * 2 + 2);
    });
});

describe('decor library', () => {
    it('exposes filigree for every face shape', () => {
        expect(DECOR_SHAPES).toEqual(['tri', 'triCorners', 'square', 'kite', 'pent']);
        expect(hasDecor('filigree')).toBe(true);
        expect(hasDecor('nope')).toBe(false);
        for (const shape of DECOR_SHAPES) expect(getDecor('filigree', shape).length).toBeGreaterThan(0);
        expect(getDecor('filigree', 'square')).toHaveLength(16);
        expect(getDecor('filigree', 'kite')).toEqual(getDecor('filigree', 'square'));
        expect(getDecor('filigree', 'pent')).toHaveLength(20);
        expect(DECOR.filigree.triCorners).toHaveLength(8);
    });

    it('throws for unknown art or shape', () => {
        expect(() => getDecor('nope', 'tri')).toThrow(/unknown decor art/);
        expect(() => getDecor('filigree', 'hex')).toThrow(/unknown face shape/);
    });
});
