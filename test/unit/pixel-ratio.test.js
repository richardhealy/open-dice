import { describe, it, expect } from 'vitest';
import { resolvePixelRatio, clampPixelRatioToBuffer } from '../../src/pixel-ratio.js';

describe('resolvePixelRatio', () => {
    it('defaults to the device ratio, capped at 2 (a Retina canvas drawn at 1x reads as pixelated)', () => {
        expect(resolvePixelRatio(undefined, 2)).toBe(2);
        expect(resolvePixelRatio(undefined, 1.5)).toBe(1.5);
        expect(resolvePixelRatio(undefined, 3)).toBe(2);
        expect(resolvePixelRatio(undefined, undefined)).toBe(1);
    });

    it('clampPixelRatioToBuffer keeps the drawing buffer within the GPU maximum and never drops below 1', () => {
        expect(clampPixelRatioToBuffer(2, 1000, 700, 4096)).toBe(2);
        expect(clampPixelRatioToBuffer(2, 2560, 1440, 4096)).toBeCloseTo(1.6, 9);     // 4096 / 2560
        expect(clampPixelRatioToBuffer(2, 4096, 2304, 4096)).toBe(1);                 // a map-sized roller on a 4096 GPU
        expect(clampPixelRatioToBuffer(2, 5000, 100, 4096)).toBe(1);                  // already too wide at 1x: leave it
        expect(clampPixelRatioToBuffer(1.5, 400, 400, undefined)).toBe(1.5);          // no limit known
        expect(clampPixelRatioToBuffer(1.5, 400, 400, 0)).toBe(1.5);
    });

    it('honours an explicit option, including opting out with 1', () => {
        expect(resolvePixelRatio(1, 3)).toBe(1);
        expect(resolvePixelRatio(1.25, 2)).toBe(1.25);
        expect(resolvePixelRatio(0, 2)).toBe(2);       // nonsense falls back to the default, not to 1
        expect(resolvePixelRatio(-2, 2)).toBe(2);
    });
});
