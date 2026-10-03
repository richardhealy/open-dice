import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CLASSIC, CLASSIC_SET, registerDiceSet, getDiceSet, listDiceSets, resolveSet, _resetRegistryForTests } from '../../src/sets/index.js';

const def = (id) => ({ id, name: id, family: 'gem', body: { color: '#123456' }, edge: { metal: 'gold' }, numeral: { color: '#000000', style: 'flat' }, swatch: ['#123456'] });

describe('dice set registry', () => {
    beforeEach(() => _resetRegistryForTests());
    afterEach(() => vi.restoreAllMocks());

    it('always lists classic first', () => {
        expect(CLASSIC).toBe('classic');
        expect(listDiceSets()[0]).toEqual({ id: 'classic', name: 'Classic', family: 'classic', swatch: ['#f0f0f0'] });
        expect(getDiceSet('classic')).toBe(CLASSIC_SET);
    });

    it('registers, lists and returns frozen definitions', () => {
        expect(registerDiceSet(def('house-brass'))).toBe('house-brass');
        expect(listDiceSets().map((s) => s.id)).toContain('house-brass');
        const got = getDiceSet('house-brass');
        expect(Object.isFrozen(got)).toBe(true);
        expect(got.name).toBe('house-brass');
    });

    it('refuses duplicates and the reserved id', () => {
        registerDiceSet(def('dup'));
        expect(() => registerDiceSet(def('dup'))).toThrow(/already exists/);
        expect(() => registerDiceSet(def('classic'))).toThrow(/already exists/);
    });

    it('resolves falsy to classic, ids to definitions, and passes resolved objects through', () => {
        registerDiceSet(def('a-set'));
        expect(resolveSet(null)).toBe(CLASSIC_SET);
        expect(resolveSet(undefined)).toBe(CLASSIC_SET);
        expect(resolveSet('classic')).toBe(CLASSIC_SET);
        const a = getDiceSet('a-set');
        expect(resolveSet('a-set')).toBe(a);
        expect(resolveSet(a)).toBe(a);
    });

    it('warns once per unknown id and renders classic', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(resolveSet('no-such-set')).toBe(CLASSIC_SET);
        expect(resolveSet('no-such-set')).toBe(CLASSIC_SET);
        expect(resolveSet('another-missing')).toBe(CLASSIC_SET);
        expect(warn).toHaveBeenCalledTimes(2);
        expect(warn.mock.calls[0][0]).toMatch(/unknown dice set "no-such-set"/);
    });

    it('a set registered later resolves on the next lookup (no snapshot at construction)', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(resolveSet('late')).toBe(CLASSIC_SET);
        registerDiceSet(def('late'));
        expect(resolveSet('late').id).toBe('late');
        expect(warn).toHaveBeenCalledTimes(1);
    });
});
