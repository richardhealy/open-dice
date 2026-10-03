import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { validateSet } from '../../src/sets/validate.js';
import { setDecalsFor, collectSetDecalSources } from '../../src/sets/decals.js';
import { setCanvasFactories } from '../../src/sets/canvas-factory.js';
import { clearDiceSetCaches } from '../../src/sets/texture-cache.js';
import { createDie } from '../../src/dice.js';
import { makeRecordingCanvas } from './helpers/canvas-stub.js';

const base = {
    id: 'decal-set', name: 'Decal Set', family: 'gem', body: { color: '#123456' }, edge: { metal: 'gold' },
    numeral: { color: '#ffffff', style: 'flat' }, swatch: ['#123456'],
};

describe('design decals are ordinary decal options, keyed by die type', () => {
    it('validates { [dieType]: { [value]: { src, scale?, offsetX?, offsetY?, rotation? } } } and keeps exactly the given fields', () => {
        const set = validateSet({ ...base, decals: { d20: { '20': { src: 'data:image/svg+xml,a', scale: 0.74 } }, d6: { '6': { src: '/six.svg', offsetX: 0.1, rotation: 45 } } } });
        expect(set.decals).toEqual({ d20: { '20': { src: 'data:image/svg+xml,a', scale: 0.74 } }, d6: { '6': { src: '/six.svg', offsetX: 0.1, rotation: 45 } } });
        expect(Object.isFrozen(set.decals.d20['20'])).toBe(true);
        expect(validateSet(base).decals).toBeNull();
        expect(validateSet({ ...base, decals: {} }).decals).toBeNull();               // empty means none
        expect(validateSet({ ...base, decals: { d20: {} } }).decals).toBeNull();
        expect(validateSet({ ...base, decals: { d100: { '00': { src: 'x' }, '0': { src: 'y' } } } }).decals.d100['00'].src).toBe('x');
    });

    it('rejects unknown die types, bad face values, a missing src and out-of-range options', () => {
        const bad = (decals, field) => expect(() => validateSet({ ...base, decals })).toThrow(new RegExp(`decals\\.${field.replace(/\./g, '\\.')}`));
        bad({ d7: { '1': { src: 'a' } } }, 'd7');
        bad({ d20: { twenty: { src: 'a' } } }, 'd20.twenty');
        bad({ d20: { '21': { src: 'a' } } }, 'd20.21');                                // a d20 has no 21
        bad({ d6: { '00': { src: 'a' } } }, 'd6.00');
        bad({ d20: { '20': { scale: 1 } } }, 'd20.20.src');
        bad({ d20: { '20': { src: 'a', scale: 5 } } }, 'd20.20.scale');
        bad({ d20: { '20': { src: 'a', offsetY: 0.9 } } }, 'd20.20.offsetY');
    });

    it('merges under the die\'s own decals: the die wins per value and null switches the design\'s decal off', () => {
        const set = validateSet({ ...base, decals: { d20: { '20': { src: 'crown' }, '1': { src: 'skull' } } } });
        expect(setDecalsFor(set, 'd20', null)).toEqual({ '20': { src: 'crown' }, '1': { src: 'skull' } });
        expect(setDecalsFor(set, 'd20', { '20': { src: 'host' } })).toEqual({ '20': { src: 'host' }, '1': { src: 'skull' } });
        expect(setDecalsFor(set, 'd20', { '20': null })['20']).toBeNull();
        expect(setDecalsFor(set, 'd100', { '20': { src: 'host' } })).toEqual({ '20': { src: 'host' } });   // other types untouched
        expect(setDecalsFor(set, 'd100', null)).toBeNull();
        expect(setDecalsFor(null, 'd20', { '5': { src: 'x' } })).toEqual({ '5': { src: 'x' } });
    });

    it('collects every decal source once for preloading', () => {
        const set = validateSet({ ...base, decals: { d20: { '20': { src: 'a' }, '1': { src: 'b' } }, d6: { '6': { src: 'a' } } } });
        expect([...collectSetDecalSources(set)].sort()).toEqual(['a', 'b']);      // order is irrelevant for preloading
        expect(collectSetDecalSources(validateSet(base))).toEqual([]);
    });
});

describe('createDie applies a design\'s decals through the normal decal pipeline', () => {
    let restore;
    beforeEach(() => {
        clearDiceSetCaches();
        restore = setCanvasFactories({ canvas: (size) => makeRecordingCanvas(size), path2D: (d) => ({ d }) });
    });
    afterEach(() => restore());

    it('the d20 "20" face draws the design decal; the d100 tens "20" face keeps its numeral', () => {
        const img = { width: 100, height: 100 };
        const registry = { get: (src) => (src === 'crown.svg' ? img : undefined), load: () => Promise.resolve(img), preload: async () => [] };
        const set = validateSet({ ...base, id: 'crowned', decals: { d20: { '20': { src: 'crown.svg', scale: 0.74 } } } });
        const d20 = createDie('d20', true, true, 20, 4, null, null, null, null, null, null, false, null, registry, { set });
        const face = d20.mesh.material[5].map.image;                       // the predetermined face carries the target value
        expect(face.calls.filter((c) => c.name === 'drawImage' && c.args[0] === img)).toHaveLength(1);
        expect(face.calls.filter((c) => c.name === 'fillText')).toHaveLength(0);
        const tens = createDie('d100', true, false, 20, 3, null, null, null, null, null, null, false, null, registry, { set });
        const painted = tens.mesh.material.slice(1).map((m) => m.map && m.map.image).filter(Boolean);
        expect(painted.some((c) => c.calls.some((x) => x.name === 'drawImage' && x.args[0] === img))).toBe(false);
        expect(painted.flatMap((c) => c.calls.filter((x) => x.name === 'fillText').map((x) => x.args[0]))).toContain('20');
    });

    it('a host decal for the same value replaces the design\'s', () => {
        const crown = { width: 100, height: 100 }, host = { width: 100, height: 100 };
        const registry = { get: (src) => ({ 'crown.svg': crown, 'host.svg': host }[src]), load: () => Promise.resolve(null), preload: async () => [] };
        const set = validateSet({ ...base, id: 'crowned-2', decals: { d20: { '20': { src: 'crown.svg' } } } });
        const d20 = createDie('d20', true, true, 20, 4, null, null, null, null, null, null, false, { '20': { src: 'host.svg' } }, registry, { set });
        const face = d20.mesh.material[5].map.image;
        expect(face.calls.some((c) => c.name === 'drawImage' && c.args[0] === host)).toBe(true);
        expect(face.calls.some((c) => c.name === 'drawImage' && c.args[0] === crown)).toBe(false);
        expect(THREE).toBeDefined();
    });
});
