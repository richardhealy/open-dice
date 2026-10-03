import { describe, it, expect } from 'vitest';
import { hashSeed, valueNoise, fbm, pattern, PATTERN_KINDS } from '../../src/sets/noise.js';

describe('noise', () => {
    it('hashSeed is deterministic and differs between strings', () => {
        expect(hashSeed('ruby-jewel:d20')).toBe(hashSeed('ruby-jewel:d20'));
        expect(hashSeed('ruby-jewel:d20')).not.toBe(hashSeed('ruby-jewel:d6'));
    });

    it('valueNoise and fbm stay within 0..1 and repeat for a seed', () => {
        const seed = hashSeed('x');
        for (let i = 0; i < 200; i++) {
            const x = i * 0.37, y = i * 0.11;
            const n = valueNoise(seed, x, y), f = fbm(seed, x, y);
            expect(n).toBeGreaterThanOrEqual(0); expect(n).toBeLessThanOrEqual(1);
            expect(f).toBeGreaterThanOrEqual(0); expect(f).toBeLessThanOrEqual(1);
            expect(valueNoise(seed, x, y)).toBe(n);
        }
        expect(fbm(seed, 1.5, 2.5)).not.toBe(fbm(seed + 1, 1.5, 2.5));
    });

    it('every pattern kind returns values in 0..1 and is not constant', () => {
        expect(PATTERN_KINDS).toEqual(['noise', 'marble', 'veins', 'scales', 'pour', 'circuit', 'felt']);
        const seed = hashSeed('p');
        // pour, circuit and felt produce colour through patterns.js; only the scalar kinds go through pattern().
        for (const kind of ['noise', 'marble', 'veins', 'scales']) {
            const values = new Set();
            for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
                const v = pattern(kind, seed, x / 16, y / 16, 4);
                expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1);
                values.add(v.toFixed(3));
            }
            expect(values.size).toBeGreaterThan(8);
        }
    });
});
