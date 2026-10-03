import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    NUMERAL_FONT_FAMILY,
    NUMERAL_FONT_FALLBACK,
    NUMERAL_FONTS,
    fontStack,
    ensureNumeralFont,
    isNumeralFontReady,
    _resetNumeralFontForTests,
} from '../../src/sets/fonts/numerals.js';
import { NUMERAL_FONT_DATA } from '../../src/sets/fonts/numerals-data.js';

describe('numeral font', () => {
    beforeEach(() => _resetNumeralFontForTests());

    it('registers under a neutral family name with a serif fallback', () => {
        expect(NUMERAL_FONT_FAMILY).toBe('OpenDiceNumerals');
        expect(NUMERAL_FONT_FALLBACK).toBe('OpenDiceNumerals, Georgia, "Times New Roman", serif');
    });

    it('describes both embedded families with their system fallbacks', () => {
        expect(Object.keys(NUMERAL_FONTS)).toEqual(['OpenDiceNumerals', 'OpenDiceMono']);
        expect(NUMERAL_FONTS.OpenDiceNumerals.fallback).toBe('Georgia, "Times New Roman", serif');
        expect(NUMERAL_FONTS.OpenDiceMono.fallback).toBe('"Courier New", monospace');
    });

    it('embeds a woff2 file (magic bytes wOF2) of a few kilobytes for every family', () => {
        expect(Object.keys(NUMERAL_FONT_DATA).sort()).toEqual(['OpenDiceMono', 'OpenDiceNumerals']);
        for (const family of Object.keys(NUMERAL_FONTS)) {
            const bytes = Buffer.from(NUMERAL_FONT_DATA[family], 'base64');
            expect(bytes.subarray(0, 4).toString('ascii'), family).toBe('wOF2');
            expect(bytes.length, family).toBeGreaterThan(1000);
            expect(bytes.length, family).toBeLessThan(8000);
        }
    });

    it('builds a font stack: embedded families gain their fallback, others pass through verbatim', () => {
        expect(fontStack('OpenDiceNumerals')).toBe(NUMERAL_FONT_FALLBACK);
        expect(fontStack('OpenDiceMono')).toBe('OpenDiceMono, "Courier New", monospace');
        expect(fontStack('OpenDiceMono').endsWith('monospace')).toBe(true);
        expect(fontStack('Papyrus')).toBe('Papyrus');
    });

    it('resolves false outside a browser and memoises the promise', async () => {
        const p1 = ensureNumeralFont();
        const p2 = ensureNumeralFont();
        expect(p1).toBe(p2);
        await expect(p1).resolves.toBe(false);
        expect(isNumeralFontReady()).toBe(false);
    });

    describe('with a FontFace API', () => {
        let created;
        let added;
        let failFor;
        beforeEach(() => {
            created = [];
            added = [];
            failFor = new Set();
            globalThis.FontFace = class {
                constructor(family, source, descriptors) {
                    this.family = family;
                    this.source = source;
                    this.descriptors = descriptors;
                    created.push(this);
                }
                async load() {
                    if (failFor.has(this.family)) throw new Error(`no ${this.family}`);
                    return this;
                }
            };
            globalThis.document = { fonts: { add: (face) => added.push(face.family) } };
        });
        afterEach(() => {
            delete globalThis.FontFace;
            delete globalThis.document;
        });

        it('loads every embedded family and reports ready when all are in', async () => {
            await expect(ensureNumeralFont()).resolves.toBe(true);
            expect(created.map((f) => f.family)).toEqual(['OpenDiceNumerals', 'OpenDiceMono']);
            expect(added).toEqual(['OpenDiceNumerals', 'OpenDiceMono']);
            for (const face of created) {
                expect(face.source).toBe(`url(data:font/woff2;base64,${NUMERAL_FONT_DATA[face.family]})`);
            }
            expect(isNumeralFontReady()).toBe(true);
        });

        it('is ready once every family has loaded or failed, and resolves false on a failure', async () => {
            failFor.add('OpenDiceMono');
            expect(isNumeralFontReady()).toBe(false);
            await expect(ensureNumeralFont()).resolves.toBe(false);
            expect(added).toEqual(['OpenDiceNumerals']);
            expect(isNumeralFontReady()).toBe(true);
        });
    });
});
