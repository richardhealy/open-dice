import { describe, it, expect, vi } from 'vitest';
import { DiceRoller } from '../../src/DiceRoller.js';

const proto = DiceRoller.prototype;
const rest = { velocity: { lengthSquared: () => 0 }, angularVelocity: { lengthSquared: () => 0 } };
const moving = { velocity: { lengthSquared: () => 4 }, angularVelocity: { lengthSquared: () => 0 } };

function fake(over = {}) {
    return { dice: [], diceBatches: [], effects: [], _pendingSetRolls: 0, _isBodySettled: proto._isBodySettled, _shouldIdle: proto._shouldIdle, ...over };
}

describe('the animation loop idles when nothing moves (a full-screen overlay must not render forever)', () => {
    it('idles with an empty table', () => {
        expect(fake()._shouldIdle()).toBe(true);
    });

    it('idles once every die rests, every batch is resolved and no effect runs', () => {
        const r = fake({ dice: [{ body: rest }, { body: rest }], diceBatches: [{ resolved: true, dice: [1] }] });
        expect(r._shouldIdle()).toBe(true);
    });

    it('keeps running while a die moves, a batch is unresolved, an effect runs, or a set roll waits', () => {
        expect(fake({ dice: [{ body: moving }] })._shouldIdle()).toBe(false);
        expect(fake({ dice: [{ body: rest }], diceBatches: [{ resolved: false, dice: [1] }] })._shouldIdle()).toBe(false);
        expect(fake({ effects: [{ update() {} }] })._shouldIdle()).toBe(false);
        expect(fake({ _pendingSetRolls: 1 })._shouldIdle()).toBe(false);
    });

    it('playEffect wakes the loop so an effect fired on an idle table animates', () => {
        const r = { effects: [], _ensureAnimating: vi.fn(), playEffect: proto.playEffect };
        const spec = { create: () => ({ update: () => true }) };
        expect(r.playEffect(spec, null)).not.toBeNull();
        expect(r._ensureAnimating).toHaveBeenCalledTimes(1);
    });
});
