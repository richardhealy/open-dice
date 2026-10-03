import { describe, it, expect, beforeEach } from 'vitest';
import {
    registerDecorArt, registerEmblemArt, hasDecorArt, hasEmblemArt, getRegisteredDecor, getRegisteredEmblem,
    validatePathList, _resetArtRegistryForTests,
} from '../../src/sets/art-registry.js';
import { hasDecor, getDecor } from '../../src/sets/decor/index.js';
import { hasEmblem, getEmblem } from '../../src/sets/decor/emblems.js';
import { validateSet } from '../../src/sets/validate.js';

const SIGIL = [
    { d: 'M -0.5 -0.5 L 0.5 -0.5 L 0 0.5 Z', stroke: 0, fill: true },
    { d: 'M -0.6 0 L 0.6 0', stroke: 0.04, fill: false },
];
const RING_D = 'M 1 0 A 1 1 0 1 0 -1 0 A 1 1 0 1 0 1 0 Z M 0.6 0 A 0.6 0.6 0 1 0 -0.6 0 A 0.6 0.6 0 1 0 0.6 0 Z';
const RING = [{ d: RING_D, fill: true, rule: 'evenodd' }];
const RING_NORMALISED = [{ d: RING_D, stroke: 0, fill: true, rule: 'evenodd' }];

beforeEach(() => _resetArtRegistryForTests());

describe('validatePathList', () => {
    it('accepts stroke and fill paths and returns a frozen normalised copy', () => {
        const out = validatePathList([
            { d: 'M 0 0 L 1 1', stroke: 0.05 },
            { d: 'M 0 0 l 1 1 h -1 v 1 c 0 0 1 1 1 1 s 1 1 1 1 q 1 1 1 1 t 1 1 a 1 1 0 0 1 1 1 z', fill: true, stroke: 3 },
            { d: 'M 1.5e-1 -2E1 L 1,2', stroke: 0.5 },
            RING[0],
        ]);
        expect(out).toEqual([
            { d: 'M 0 0 L 1 1', stroke: 0.05, fill: false },
            { d: 'M 0 0 l 1 1 h -1 v 1 c 0 0 1 1 1 1 s 1 1 1 1 q 1 1 1 1 t 1 1 a 1 1 0 0 1 1 1 z', stroke: 0, fill: true },
            { d: 'M 1.5e-1 -2E1 L 1,2', stroke: 0.5, fill: false },
            RING_NORMALISED[0],
        ]);
        expect(Object.isFrozen(out)).toBe(true);
        expect(out.every(Object.isFrozen)).toBe(true);
    });

    it('refuses anything that is not a non-empty list of path objects', () => {
        for (const bad of [null, undefined, 'M 0 0', {}, [], [null], ['M 0 0'], [{ stroke: 1 }], [{ d: 7, stroke: 1 }], [{ d: '', stroke: 1 }], [{ d: '   ', stroke: 1 }]]) {
            expect(() => validatePathList(bad)).toThrow(/open-dice-dnd/);
        }
    });

    it('refuses path data outside the SVG command and number alphabet', () => {
        for (const d of ['M 0 0 L 1 1 #', 'M 0 0 L 1 1; alert(1)', 'url(x)', 'M 0 0 L 1 1 x', 'M 0 0 L 1+1', 'M 0 0 L 1 1\n', 'M 0 0 L 1 1 Б']) {
            expect(() => validatePathList([{ d, stroke: 0.1 }])).toThrow(/path data/);
        }
    });

    it('refuses a stroke path without a positive width and a bad fill rule or flag', () => {
        for (const stroke of [undefined, 0, -1, NaN, Infinity, '0.1']) {
            expect(() => validatePathList([{ d: 'M 0 0 L 1 1', stroke }])).toThrow(/stroke/);
        }
        expect(() => validatePathList([{ d: 'M 0 0 Z', fill: true, rule: 'winding' }])).toThrow(/rule/);
        expect(() => validatePathList([{ d: 'M 0 0 Z', fill: 'yes' }])).toThrow(/fill/);
        expect(() => validatePathList([{ d: 'M 0 0 Z', fill: true, stroke: -1 }])).toThrow(/stroke/);
    });
});

describe('decor art registry', () => {
    it('registers a custom art per face shape and resolves it through the decor library', () => {
        expect(hasDecorArt('house')).toBe(false);
        expect(hasDecor('house')).toBe(false);
        registerDecorArt('house', { tri: SIGIL, square: SIGIL.slice(0, 1) });
        expect(hasDecorArt('house')).toBe(true);
        expect(hasDecor('house')).toBe(true);
        expect(getRegisteredDecor('house', 'tri')).toEqual(SIGIL);
        expect(getRegisteredDecor('house', 'square')).toHaveLength(1);
        expect(getRegisteredDecor('house', 'kite')).toEqual([]);
        expect(getDecor('house', 'tri')).toEqual(SIGIL);
        expect(getDecor('house', 'kite')).toEqual([]);
        expect(getDecor('house', 'pent')).toEqual([]);          // a registered art missing that shape paints nothing
        expect(Object.isFrozen(getDecor('house', 'tri'))).toBe(true);
        expect(() => getDecor('nope', 'tri')).toThrow(/unknown decor art/);
        expect(() => getRegisteredDecor('nope', 'tri')).toThrow(/unknown decor art/);
    });

    it('keeps built-ins ahead of registrations and leaves them intact', () => {
        const filigree = getDecor('filigree', 'tri');
        expect(() => registerDecorArt('filigree', { tri: SIGIL })).toThrow(/built in/);
        expect(hasDecorArt('filigree')).toBe(false);
        expect(getDecor('filigree', 'tri')).toBe(filigree);
    });

    it('refuses duplicates, bad ids, unknown shapes and bad paths, registering nothing', () => {
        registerDecorArt('house', { tri: SIGIL });
        expect(() => registerDecorArt('house', { tri: SIGIL })).toThrow(/already registered/);
        for (const id of ['House', 'house_sigil', '-house', 'house-', 'house--sigil', '', 7, null]) {
            expect(() => registerDecorArt(id, { tri: SIGIL })).toThrow(/kebab-case/);
        }
        expect(() => registerDecorArt('crest', { hex: SIGIL })).toThrow(/face shape/);
        expect(() => registerDecorArt('crest', {})).toThrow(/face shape/);
        expect(() => registerDecorArt('crest', SIGIL)).toThrow(/face shape/);
        expect(() => registerDecorArt('crest', null)).toThrow(/face shape/);
        expect(() => registerDecorArt('crest', { tri: SIGIL, square: [{ d: 'M 0 0 L 1 1 #', stroke: 0.1 }] })).toThrow(/path data/);
        expect(() => registerDecorArt('crest', { tri: [] })).toThrow(/open-dice-dnd/);
        expect(hasDecorArt('crest')).toBe(false);
        expect(hasDecor('crest')).toBe(false);
    });

    it('is emptied by the test reset', () => {
        registerDecorArt('house', { tri: SIGIL });
        _resetArtRegistryForTests();
        expect(hasDecorArt('house')).toBe(false);
        expect(hasDecor('house')).toBe(false);
        registerDecorArt('house', { tri: SIGIL });   // and can register again
    });
});

describe('emblem art registry', () => {
    it('registers a custom emblem and resolves it through getEmblem', () => {
        expect(hasEmblemArt('house-crest')).toBe(false);
        expect(hasEmblem('house-crest')).toBe(false);
        registerEmblemArt('house-crest', RING);
        expect(hasEmblemArt('house-crest')).toBe(true);
        expect(hasEmblem('house-crest')).toBe(true);
        expect(getRegisteredEmblem('house-crest')).toEqual(RING_NORMALISED);
        expect(getEmblem('house-crest')).toEqual(RING_NORMALISED);
        expect(Object.isFrozen(getEmblem('house-crest'))).toBe(true);
        expect(() => getRegisteredEmblem('nope')).toThrow(/unknown emblem art/);
        expect(() => getEmblem('nope')).toThrow(/unknown emblem art/);
    });

    it('refuses duplicates, built-in ids, bad ids and bad paths', () => {
        registerEmblemArt('house-crest', RING);
        expect(() => registerEmblemArt('house-crest', RING)).toThrow(/already registered/);
        expect(() => registerEmblemArt('skull', RING)).toThrow(/built in/);
        expect(hasEmblemArt('skull')).toBe(false);
        expect(() => registerEmblemArt('Crest', RING)).toThrow(/kebab-case/);
        expect(() => registerEmblemArt('crest', [{ d: 'M 0 0 L 1 1 #', stroke: 0.1 }])).toThrow(/path data/);
        expect(() => registerEmblemArt('crest', [{ d: 'M 0 0 L 1 1', stroke: 0 }])).toThrow(/stroke/);
        expect(() => registerEmblemArt('crest', [])).toThrow(/open-dice-dnd/);
        expect(hasEmblemArt('crest')).toBe(false);
        _resetArtRegistryForTests();
        expect(hasEmblemArt('house-crest')).toBe(false);
    });
});

describe('registered arts in set definitions', () => {
    const base = () => ({
        id: 'crested', name: 'Crested', family: 'gem',
        body: { color: '#B5173A' }, numeral: { color: '#2A0912' }, swatch: ['#B5173A'],
    });

    it('validate once registered and fail before', () => {
        expect(() => validateSet({ ...base(), decor: [{ art: 'house', metal: 'gold' }] })).toThrow(/decor\[0\]\.art: unknown decoration "house"/);
        expect(() => validateSet({ ...base(), emblems: { '20': 'house-crest' } })).toThrow(/emblems\.20\.art: unknown emblem "house-crest"/);
        registerDecorArt('house', { tri: SIGIL });
        registerEmblemArt('house-crest', RING);
        const set = validateSet({ ...base(), decor: [{ art: 'house', metal: 'gold' }], emblems: { '20': 'house-crest', '1': { art: 'house-crest', metal: 'silver' } } });
        expect(set.decor[0].art).toBe('house');
        expect(set.emblems['20']).toMatchObject({ art: 'house-crest', color: '#2A0912' });
        expect(set.emblems['1']).toMatchObject({ art: 'house-crest', metal: 'silver' });
    });
});
