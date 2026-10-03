import { describe, it, expect } from 'vitest';
import { resolvePixelRatio } from '../../src/pixel-ratio.js';

describe('resolvePixelRatio', () => {
    it('defaults to the device ratio, capped at 2 (a Retina canvas drawn at 1x reads as pixelated)', () => {
        expect(resolvePixelRatio(undefined, 2)).toBe(2);
        expect(resolvePixelRatio(undefined, 1.5)).toBe(1.5);
        expect(resolvePixelRatio(undefined, 3)).toBe(2);
        expect(resolvePixelRatio(undefined, undefined)).toBe(1);
    });

    it('honours an explicit option, including opting out with 1', () => {
        expect(resolvePixelRatio(1, 3)).toBe(1);
        expect(resolvePixelRatio(1.25, 2)).toBe(1.25);
        expect(resolvePixelRatio(0, 2)).toBe(2);       // nonsense falls back to the default, not to 1
        expect(resolvePixelRatio(-2, 2)).toBe(2);
    });
});
