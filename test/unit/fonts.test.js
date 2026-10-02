import { describe, it, expect, beforeEach } from 'vitest';
import { NUMERAL_FONT_FAMILY, NUMERAL_FONT_FALLBACK, ensureNumeralFont, _resetNumeralFontForTests } from '../../src/sets/fonts/numerals.js';
import { NUMERAL_FONT_WOFF2_BASE64 } from '../../src/sets/fonts/numerals-data.js';

describe('numeral font', () => {
    beforeEach(() => _resetNumeralFontForTests());

    it('registers under a neutral family name with a serif fallback', () => {
        expect(NUMERAL_FONT_FAMILY).toBe('OpenDiceNumerals');
        expect(NUMERAL_FONT_FALLBACK).toBe('OpenDiceNumerals, Georgia, "Times New Roman", serif');
    });

    it('embeds a woff2 file (magic bytes wOF2) of a few kilobytes', () => {
        const bytes = Buffer.from(NUMERAL_FONT_WOFF2_BASE64, 'base64');
        expect(bytes.subarray(0, 4).toString('ascii')).toBe('wOF2');
        expect(bytes.length).toBeGreaterThan(1000);
        expect(bytes.length).toBeLessThan(8000);
    });

    it('resolves false outside a browser and memoises the promise', async () => {
        const p1 = ensureNumeralFont();
        const p2 = ensureNumeralFont();
        expect(p1).toBe(p2);
        await expect(p1).resolves.toBe(false);
    });
});
