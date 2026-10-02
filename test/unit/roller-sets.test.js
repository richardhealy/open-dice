import { describe, it, expect, beforeEach, vi } from 'vitest';
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

describe('DiceRoller first-set-roll gating (C1 / I5)', () => {
    const proto = DiceRoller.prototype;
    const flush = () => new Promise((r) => setTimeout(r, 0));
    const stillPending = (p) => Promise.race([p.then(() => 'resolved'), new Promise((r) => setTimeout(() => r('pending'), 15))]);

    function fakeRoller() {
        return {
            floor: null, dice: [], diceBatches: [], effects: [], isAnimating: false,
            defaultSet: null, _setAssetsReady: false, _rollGeneration: 0, _pendingSetRolls: 0, _destroyed: false,
            _clearDice() {}, _needsSetAssets() { return true; },
            _ensureSetAssets() { return Promise.resolve(); },
            _startRoll: vi.fn((config) => Promise.resolve(config.length)),
            roll: proto.roll, isRolling: proto.isRolling, _ensureAnimating: proto._ensureAnimating,
        };
    }

    it('a roll made while the first set roll waits for assets supersedes it: one spawn, one completion', async () => {
        const r = fakeRoller();
        const first = r.roll([{ dice: 'd6', set: GEM }]);
        expect(r.isRolling()).toBe(true);                       // waiting counts as rolling
        const second = r.roll([{ dice: 'd20', set: GEM }, { dice: 'd4', set: GEM }]);
        await flush();
        expect(r._startRoll).toHaveBeenCalledTimes(1);
        expect(r._startRoll.mock.calls[0][0].map((d) => d.dice)).toEqual(['d20', 'd4']);
        await expect(second).resolves.toBe(2);
        expect(await stillPending(first)).toBe('pending');      // a wiped roll never resolves, as before this branch
        expect(r.isRolling()).toBe(false);
    });

    it('a roller destroyed while its first set roll waits never spawns or restarts the loop', async () => {
        const r = fakeRoller();
        const p = r.roll([{ dice: 'd6', set: GEM }]);
        r._destroyed = true;
        await flush();
        expect(r._startRoll).not.toHaveBeenCalled();
        expect(await stillPending(p)).toBe('pending');
        r._ensureAnimating();
        expect(r.isAnimating).toBe(false);
    });

    it('destroy() marks the roller destroyed', () => {
        const saved = globalThis.window;
        globalThis.window = { removeEventListener() {} };
        const r = { isAnimating: true, animationFrameId: null, _boundResizeHandler() {}, _clearDice() {},
            renderer: { dispose() {}, domElement: { parentNode: null } }, _destroyed: false };
        try { proto.destroy.call(r); } finally { globalThis.window = saved; }
        expect(r._destroyed).toBe(true);
        expect(r.isAnimating).toBe(false);
    });
});
