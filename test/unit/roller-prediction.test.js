import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setCanvasFactories } from '../../src/sets/canvas-factory.js';
import { makeRecordingCanvas } from './helpers/canvas-stub.js';
import { headlessRoller, seededRandom } from './helpers/roller.js';

/** A roller whose frames are driven by hand: `frame()` runs one requestAnimationFrame tick 1/60 s later. */
function drivenRoller() {
    const r = headlessRoller({ renderer: { render() {} }, isAnimating: false, lastTime: undefined, animationFrameId: null, floor: null, onRollComplete: null, onBatchSettled: null });
    let queue = [];
    let t = 1000;
    vi.stubGlobal('requestAnimationFrame', (cb) => { queue.push(cb); return queue.length; });
    const frame = () => { const q = queue; queue = []; t += 1000 / 60; q.forEach((cb) => cb(t)); };
    return { r, frame };
}

/** A prediction that resolves when the test says so. */
function deferPredictions(r) {
    const calls = [];
    const real = r._predict.bind(r);
    r._predict = (config) => new Promise((resolve, reject) => calls.push({ config, go: () => real(config).then(resolve, reject) }));
    return calls;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('a roll predicted off the main thread', () => {
    let restore;
    beforeEach(() => { restore = setCanvasFactories({ canvas: (size) => makeRecordingCanvas(size) }); });
    afterEach(() => { restore(); vi.unstubAllGlobals(); });

    it('is rolling from the call, spawns once the prediction arrives, and lands on the painted faces', async () => {
        const { r, frame } = drivenRoller();
        const calls = deferPredictions(r);
        let total = null;
        r.roll([{ dice: 'd20', rolled: 17 }, { dice: 'd6', rolled: 2 }, { dice: 'd100', rolled: 64 }]).then((t) => { total = t; });
        expect(r.isRolling()).toBe(true);
        await flush();
        expect(r.dice.length).toBe(0);
        calls[0].go();
        await flush();
        expect(r.dice.length).toBe(4);
        expect(r._replay).not.toBeNull();
        for (let i = 0; i < 3000 && total === null; i++) { frame(); await null; }
        expect(total).toBe(83);
        const result = r.getCurrentResults();
        expect(result.variances).toEqual([]);
        expect(result.results.map((x) => x.visible)).toEqual([17, 2, 4, 60]);
        expect(r.isRolling()).toBe(false);
    });

    it('the table holds still while a prediction runs: dice already there do not move', async () => {
        const { r, frame } = drivenRoller();
        r.roll([{ dice: 'd6' }]);
        await flush();   // spawned; no frames driven, so the die is at its throw pose
        r._finishReplay();
        const die = r.dice[0];
        const before = die.body.position.clone();
        const calls = deferPredictions(r);
        r.addDice([{ dice: 'd8' }]);
        // addDice waits for the first batch; resolve it so the prediction starts.
        r.diceBatches.forEach((b) => { b.resolved = true; });
        await new Promise((resolve) => setTimeout(resolve, 120));   // addDice polls every 50 ms
        r._ensureAnimating();
        for (let i = 0; i < 10; i++) frame();
        expect(calls.length).toBe(1);
        expect(die.body.position.almostEquals(before, 0)).toBe(true);
        calls[0].go();
        await flush();
        for (let i = 0; i < 10; i++) frame();
        expect(die.body.position.almostEquals(before, 0)).toBe(false);
    });

    it('keeps the previous dice on screen until the new roll spawns (no empty frame in between)', async () => {
        const { r, frame } = drivenRoller();
        const renders = [];
        r.renderer = { render: () => renders.push(r.dice.length) };
        r.roll([{ dice: 'd6' }]);
        await flush();
        for (let i = 0; i < 5; i++) frame();
        const calls = deferPredictions(r);
        r.roll([{ dice: 'd8' }, { dice: 'd8' }]);
        renders.length = 0;
        for (let i = 0; i < 5; i++) frame();
        expect(renders).toEqual([]);
        await flush();
        calls[0].go();
        await flush();
        frame();
        expect(renders.length).toBeGreaterThan(0);
        expect(renders.every((n) => n === 2)).toBe(true);
    });

    it('a second roll() made while the first is predicting wins: the first never spawns', async () => {
        const { r } = drivenRoller();
        const calls = deferPredictions(r);
        const first = vi.fn();
        r.roll([{ dice: 'd20' }]).then(first);
        r.roll([{ dice: 'd6' }, { dice: 'd6' }]);
        await flush();
        // The first roll's table was wiped before its turn came: it does not even predict.
        expect(calls.map((c) => c.config.length)).toEqual([2]);
        expect(r.isRolling()).toBe(true);
        calls[0].go();
        await flush(); await flush();
        expect(r.dice.map((d) => d.type)).toEqual(['d6', 'd6']);
        expect(first).not.toHaveBeenCalled();
    });

    it('a second roll() made after the first started predicting: the first prediction is dropped when it arrives', async () => {
        const { r } = drivenRoller();
        const calls = deferPredictions(r);
        const first = vi.fn();
        r.roll([{ dice: 'd20' }]).then(first);
        await flush();
        r.roll([{ dice: 'd6' }, { dice: 'd6' }]);
        calls[0].go();
        await flush(); await flush();
        expect(r.dice.length).toBe(0);
        expect(calls.map((c) => c.config.length)).toEqual([1, 2]);
        calls[1].go();
        await flush(); await flush();
        expect(r.dice.map((d) => d.type)).toEqual(['d6', 'd6']);
        expect(first).not.toHaveBeenCalled();
    });

    it('reset() while a roll is predicting: the roll never spawns', async () => {
        const { r } = drivenRoller();
        const calls = deferPredictions(r);
        const settled = vi.fn();
        r.roll([{ dice: 'd20' }]).then(settled);
        await flush();
        await r.reset();
        calls[0].go();
        await flush(); await flush();
        expect(r.dice.length).toBe(0);
        expect(r.isRolling()).toBe(false);
        expect(settled).not.toHaveBeenCalled();
    });

    it('addDice waits for a roll still predicting, then predicts with its dice on the table', async () => {
        const { r, frame } = drivenRoller();
        // Seeded: a throw onto dice already on the table simulates live, as it always did, and can
        // (rarely) land another face than the painted one; this seed lands the painted faces.
        const random = seededRandom(7);
        r._generateRandomSeed = () => ({ xPos: random(), yPos: random(), zPos: random(), rotAxis: [random(), random(), random()], rotAngle: random(), vel: [random(), random(), random()], angVel: [random(), random(), random()] });
        const rolled = r.roll([{ dice: 'd6', rolled: 4 }]);
        let added = null;
        r.addDice([{ dice: 'd8', rolled: 5 }]).then((res) => { added = res; });
        expect(rolled).toBeInstanceOf(Promise);
        await flush();
        // Until the roll has spawned and settled, addDice does not predict.
        expect(r.dice.map((d) => d.type)).toEqual(['d6']);
        for (let i = 0; i < 400 && r.diceBatches.length < 2; i++) { frame(); await new Promise((res) => setTimeout(res, 2)); }
        expect(r.dice.map((d) => d.type)).toEqual(['d6', 'd8']);
        for (let i = 0; i < 3000 && added === null; i++) { frame(); await null; }
        expect(added.variances).toEqual([]);
        expect(r.getCurrentResults().variances).toEqual([]);
        expect(r.getCurrentResults().results.map((x) => x.visible)).toEqual([4, 5]);
    });

    it('roll() during a replay drops it: the old dice leave and never rejoin the world', async () => {
        const { r } = drivenRoller();
        await r._predictAndSpawn([{ dice: 'd20' }], null, (p) => { r._spawnBatch([{ dice: 'd20' }], 'main', p, () => {}); return null; });
        const old = r.dice[0];
        expect(r._replay).not.toBeNull();
        r._clearDice();
        expect(r._replay).toBeNull();
        expect(r.world.bodies.includes(old.body)).toBe(false);
        r.world.step(1 / 60);
        expect(r.world.bodies.includes(old.body)).toBe(false);
    });

    it('a prediction that fails rejects the roll and does not block later rolls', async () => {
        const { r } = drivenRoller();
        const broken = { id: 'broken', name: 'Broken', family: 'glass', body: { color: '#000000' }, numeral: { color: '#FFFFFF' }, swatch: ['#000000'] };
        const real = r._predict.bind(r);
        r._predict = vi.fn(() => { throw new Error('cannot build'); });
        await expect(r.roll([{ dice: 'd6', set: broken }])).rejects.toThrow('cannot build');
        expect(r.isRolling()).toBe(false);
        r._predict = real;
        await r._predictionQueue;
        r.roll([{ dice: 'd6' }]);
        await flush();
        expect(r.dice.length).toBe(1);
    });
});
