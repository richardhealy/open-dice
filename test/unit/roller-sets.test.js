import { describe, it, expect, beforeEach } from 'vitest';
import { DiceRoller } from '../../src/DiceRoller.js';
import { _resetRegistryForTests, CLASSIC_SET } from '../../src/sets/index.js';
import { GEM } from './helpers/sets.js';
import * as lib from '../../src/index.js';

describe('DiceRoller set gating (prototype methods on a bare object)', () => {
    const proto = DiceRoller.prototype;
    let fake;
    beforeEach(() => {
        _resetRegistryForTests();
        fake = { defaultSet: null, _setAssetsReady: false, _setFor: proto._setFor, _needsSetAssets: proto._needsSetAssets };
    });

    it('resolves die.set first, then the roller default, then classic', () => {
        expect(fake._setFor({ dice: 'd6' })).toBe(CLASSIC_SET);
        fake.defaultSet = GEM;
        expect(fake._setFor({ dice: 'd6' })).toBe(GEM);
        expect(fake._setFor({ dice: 'd6', set: CLASSIC_SET })).toBe(CLASSIC_SET);
        expect(fake._setFor({ dice: 'd6', set: 'classic' })).toBe(CLASSIC_SET);
    });

    it('needs assets only for non-classic dice and only until they are ready', () => {
        expect(fake._needsSetAssets([{ dice: 'd6' }, { dice: 'd20' }])).toBe(false);
        expect(fake._needsSetAssets([{ dice: 'd6' }, { dice: 'd20', set: GEM }])).toBe(true);
        fake._setAssetsReady = true;
        expect(fake._needsSetAssets([{ dice: 'd20', set: GEM }])).toBe(false);
    });

    it('setDefaultSet stores the id and clears with null', () => {
        const target = { defaultSet: 'x' };
        proto.setDefaultSet.call(target, 'ruby-jewel');
        expect(target.defaultSet).toBe('ruby-jewel');
        proto.setDefaultSet.call(target, null);
        expect(target.defaultSet).toBeNull();
    });
});

describe('public exports', () => {
    it('exposes the set API', () => {
        for (const name of ['registerDiceSet', 'listDiceSets', 'getDiceSet', 'resolveSet', 'clearDiceSetCaches', 'installEnvironment']) {
            expect(typeof lib[name]).toBe('function');
        }
        expect(lib.CLASSIC_DICE_SET).toBe('classic');
        expect(lib.diceSets.CLASSIC).toBe('classic');
        expect(typeof lib.diceSets.registerDiceSet).toBe('function');
        expect(lib.listDiceSets()[0].id).toBe('classic');
    });
});
