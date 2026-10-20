import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { createDie, getDieValue } from '../../src/dice.js';
import { DiceRoller } from '../../src/DiceRoller.js';
import { isDieSettled } from '../../src/physics-config.js';
import { describeWorld, runPrediction, STATE_SIZE } from '../../src/physics-sim.js';
import { registerDiceSet, _resetRegistryForTests } from '../../src/sets/index.js';
import { setCanvasFactories } from '../../src/sets/canvas-factory.js';
import { setModelLoader, loadModel, clearModelCache } from '../../src/models/loader.js';
import { modelDiceAllowance } from '../../src/models/throw-allowance.js';
import { makeRecordingCanvas } from './helpers/canvas-stub.js';
import { cubeDesign, boxScene } from './helpers/models.js';
import { headlessRoller, seededRandom } from './helpers/roller.js';

/**
 * D1: the roller used to simulate every throw twice, once to predict the landing face and
 * again, live, for the visible dice. It now records the prediction and plays it back. These
 * tests run the old algorithm, verbatim, next to the new one and require the visible dice
 * to pass through bit-identical states at every physics step.
 */

const state = (b) => [b.position.x, b.position.y, b.position.z, b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w,
    b.velocity.x, b.velocity.y, b.velocity.z, b.angularVelocity.x, b.angularVelocity.y, b.angularVelocity.z];

/** Index of the first float that differs (Object.is: -0 and 0 differ too), or -1. */
function firstDifference(a, b) {
    if (a.length !== b.length) return -2;
    for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return i;
    return -1;
}

function seedsFor(r, config, seed) {
    const random = seededRandom(seed);
    const spy = vi.spyOn(Math, 'random').mockImplementation(random);
    const seeds = config.flatMap((d) => (d.dice === 'd100' ? [0, 1] : [0])).map(() => DiceRoller.prototype._generateRandomSeed());
    spy.mockRestore();
    return seeds;
}

/**
 * The old roll, as DiceRoller did it up to 1.11.1: predict in the live world (existing dice
 * snapshotted and restored), then spawn the visible dice with the same seeds and let the live
 * world simulate them. Returns the per-step states of every moving body for both runs.
 *
 * `restoreInertia`: also restore the existing dice's world inertia, which the old restore
 * missed (see the addDice test).
 */
function oldRoll(r, config, seeds, { restoreInertia = false } = {}) {
    const snapshots = r.dice.map((d) => ({ d, inertia: d.body.invInertiaWorld.elements.slice(), p: d.body.position.clone(), q: d.body.quaternion.clone(), v: d.body.velocity.clone(), w: d.body.angularVelocity.clone() }));
    const allowed = modelDiceAllowance(config, (d) => r._setFor(d));
    const build = (visible, closestIndexes) => {
        const out = [];
        let c = 0;
        config.forEach((roll, k) => {
            for (let i = 0; i < (roll.dice === 'd100' ? 2 : 1); i++) {
                const die = createDie(roll.dice, visible, i === 0, roll.rolled, closestIndexes ? closestIndexes[c] : null, r.diceMaterial,
                    visible ? r.scene : null, r.world, roll.diceColor, roll.textColor, roll.backgroundColor, roll.isSecret, null, null,
                    { set: r._setFor(roll), model: allowed[k] });
                die.isFirst = !(i > 0 && roll.dice === 'd100');
                die.closestIndex = closestIndexes ? closestIndexes[c] : null;
                die.targetNumber = roll.rolled;
                r._applyDiePhysics(die, seeds[c]);
                out.push(die);
                c++;
            }
        });
        return out;
    };
    const existing = r.dice.slice();
    const hidden = build(false, null);
    const predicted = [];
    for (let step = 0; step < 5000; step++) {
        r.world.step(1 / 60);
        predicted.push([...existing, ...hidden].flatMap((d) => state(d.body)));
        if (step < 60) continue;
        if (hidden.every((d) => isDieSettled(d.body))) break;
    }
    const closestIndexes = hidden.map((d) => { d.mesh.quaternion.copy(d.body.quaternion); return getDieValue(d, r.up)[1]; });
    for (const d of hidden) r.world.removeBody(d.body);
    for (const s of snapshots) {
        s.d.body.position.copy(s.p); s.d.body.quaternion.copy(s.q); s.d.body.velocity.copy(s.v); s.d.body.angularVelocity.copy(s.w);
        s.d.body.force.setZero(); s.d.body.torque.setZero();
        if (restoreInertia) s.d.body.invInertiaWorld.elements = s.inertia.slice();
    }
    const visible = build(true, closestIndexes);
    r.dice.push(...visible);
    const live = [];
    for (let s = 0; s < predicted.length + EXTRA; s++) {
        r.world.step(1 / 60);
        live.push(r.dice.flatMap((d) => state(d.body)));
    }
    return { predicted, live, closestIndexes };
}

/**
 * The new roll with the same seeds: predict (synchronous fallback in Node), spawn, and step the
 * live world as the animation loop does. (Seeds are handed over rather than drawn from a seeded
 * Math.random: three draws from it too, for object ids, and the two paths build different objects.)
 */
async function newRoll(r, config, seeds) {
    const queue = seeds.slice();
    r._generateRandomSeed = () => queue.shift();
    const prediction = await r._predict(config);
    r._spawnBatch(config, 'main', prediction, () => {});
    const live = [];
    for (let s = 0; s < prediction.recording.steps + EXTRA; s++) {
        r.world.step(1 / 60);
        live.push(r.dice.flatMap((d) => state(d.body)));
    }
    return { live, steps: prediction.recording.steps, closestIndexes: prediction.closestIndexes };
}

// Steps simulated past the end of the recording: the dice must rejoin the live world exactly.
const EXTRA = 40;

const MIXES = [
    [{ dice: 'd20' }],
    [{ dice: 'd6', rolled: 3 }, { dice: 'd6', rolled: 5 }],
    [{ dice: 'd4' }, { dice: 'd8' }, { dice: 'd10' }, { dice: 'd12' }],
    [{ dice: 'd100', rolled: 37 }, { dice: 'd20', rolled: 20 }],
    [{ dice: 'd4', rolled: 2 }, { dice: 'd6' }, { dice: 'd8', rolled: 8 }, { dice: 'd10' }, { dice: 'd12', rolled: 1 }, { dice: 'd20' }, { dice: 'd100' }],
];

function expectSameSteps(newSteps, oldSteps, label) {
    expect(newSteps.length, label).toBe(oldSteps.length);
    for (let s = 0; s < oldSteps.length; s++) {
        const at = firstDifference(newSteps[s], oldSteps[s]);
        if (at !== -1) expect.fail(`${label}: step ${s + 1} differs at float ${at}: ${newSteps[s][at]} vs ${oldSteps[s][at]}`);
    }
}

describe('a recorded throw replays exactly what the old second simulation showed', () => {
    let restore;
    beforeAll(() => { restore = setCanvasFactories({ canvas: (size) => makeRecordingCanvas(size) }); });
    afterAll(() => restore());

    it('every die type and mix, 100 seeded throws: same states at every step, same landing faces', async () => {
        let throws = 0;
        for (let seed = 1; seed <= 20; seed++) {
            for (const config of MIXES) {
                const rOld = headlessRoller();
                const old = oldRoll(rOld, config, seedsFor(rOld, config, seed));
                // The old algorithm itself: its second run retraced its prediction.
                expectSameSteps(old.live.slice(0, old.predicted.length), old.predicted, `old prediction vs old visible, seed ${seed}`);
                const rNew = headlessRoller();
                const now = await newRoll(rNew, config, seedsFor(rNew, config, seed));
                expect(now.steps).toBe(old.predicted.length);
                expect(now.closestIndexes).toEqual(old.closestIndexes);
                expectSameSteps(now.live, old.live, `seed ${seed} ${config.map((d) => d.dice).join(',')}`);
                throws++;
            }
        }
        expect(throws).toBe(100);
    }, 120000);

    // A throw onto dice already in the world (addDice, or a roll while reset() fades dice out)
    // is not played back: the visible dice simulate live, from the world the old in-world
    // prediction left behind, so they move exactly as they did in 1.11.1. (That world differs
    // slightly from the one the prediction started from, so such a throw can still land a
    // face other than the painted one and report a variance, as it always could.)
    it('addDice with dice on the table: every die moves exactly as in the old visible run', async () => {
        let drifted = 0;
        for (let seed = 101; seed <= 130; seed++) {
            const first = MIXES[seed % MIXES.length];
            const added = MIXES[(seed + 2) % MIXES.length];
            const rOld = headlessRoller();
            oldRoll(rOld, first, seedsFor(rOld, first, seed));
            const rNew = headlessRoller();
            await newRoll(rNew, first, seedsFor(rNew, first, seed));
            expect(firstDifference(rNew.dice.flatMap((d) => state(d.body)), rOld.dice.flatMap((d) => state(d.body)))).toBe(-1);
            const old = oldRoll(rOld, added, seedsFor(rOld, added, seed + 1000));
            const now = await newRoll(rNew, added, seedsFor(rNew, added, seed + 1000));
            expect(now.closestIndexes).toEqual(old.closestIndexes);
            expectSameSteps(now.live, old.live, `addDice seed ${seed} vs old visible run`);
            expect(rNew.dice.map((d) => d.body.restSteps)).toEqual(rOld.dice.map((d) => d.body.restSteps));
            if (old.live.slice(0, old.predicted.length).some((st, i) => firstDifference(st, old.predicted[i]) !== -1)) drifted++;
        }
        // The old quirk is reproduced, not fixed: some of these throws drift from their prediction.
        expect(drifted).toBeGreaterThan(0);
    }, 120000);

    it('a roll while reset() fades dice out: the new and the fading dice move as in the old run', async () => {
        for (let seed = 301; seed <= 315; seed++) {
            const first = MIXES[seed % MIXES.length];
            const next = MIXES[(seed + 1) % MIXES.length];
            const rOld = headlessRoller();
            oldRoll(rOld, first, seedsFor(rOld, first, seed));
            const rNew = headlessRoller();
            await newRoll(rNew, first, seedsFor(rNew, first, seed));
            // reset(): the dice leave the table but their bodies stay in the world while they fade.
            const fadingOld = rOld.dice.splice(0);
            const fadingNew = rNew.dice.splice(0);
            rNew._fadingDice.push(...fadingNew);
            const old = oldRoll(rOld, next, seedsFor(rOld, next, seed + 1000));
            const now = await newRoll(rNew, next, seedsFor(rNew, next, seed + 1000));
            expect(now.closestIndexes).toEqual(old.closestIndexes);
            expectSameSteps(now.live, old.live, `fade seed ${seed}: new dice`);
            expect(firstDifference(fadingNew.flatMap((d) => state(d.body)), fadingOld.flatMap((d) => state(d.body)))).toBe(-1);
        }
    }, 120000);

    it('the sounds the old prediction played for dice on the table still play, once, at the spawn', async () => {
        const config = [{ dice: 'd20' }, { dice: 'd6' }];
        const added = [{ dice: 'd12' }, { dice: 'd8' }, { dice: 'd20' }];
        const now = vi.spyOn(performance, 'now').mockReturnValue(10000);
        try {
            const heard = { old: [], now: [] };
            const rOld = headlessRoller();
            rOld.soundManager = { sounds: [1], play: (v) => heard.old.push(v) };
            oldRoll(rOld, config, seedsFor(rOld, config, 9));
            rOld.dice.forEach((d) => rOld._attachCollisionSound(d));
            const rNew = headlessRoller();
            rNew.soundManager = { sounds: [1], play: (v) => heard.now.push(v) };
            await newRoll(rNew, config, seedsFor(rNew, config, 9));
            heard.now.length = 0;
            for (const d of [...rOld.dice, ...rNew.dice]) d._lastCollideSound = 0;
            // Old: the prediction ran in the live world, so the dice on the table heard it.
            const seeds = seedsFor(rOld, added, 29);
            const rOldPredictionSounds = (() => { const before = heard.old.length; oldRoll(rOld, added, seeds); return heard.old.slice(before); })();
            const queue = seeds.slice();
            rNew._generateRandomSeed = () => queue.shift();
            const prediction = await rNew._predict(added);
            rNew._spawnBatch(added, 'added', prediction, () => {});
            expect(prediction.live).toBe(true);
            expect(rOldPredictionSounds.length).toBeGreaterThan(0);   // seed 29: a new die hits one on the table
            expect(heard.now).toEqual(rOldPredictionSounds);
        } finally { now.mockRestore(); }
    });

    describe('model dice', () => {
        beforeAll(async () => {
            clearModelCache();
            _resetRegistryForTests();
            registerDiceSet(cubeDesign());
            setModelLoader(async () => boxScene());
            await loadModel('cube.glb');
        });
        afterAll(() => { setModelLoader(null); clearModelCache(); _resetRegistryForTests(); });

        it('a model die (its hull as the body, ten still steps to rest) replays identically', async () => {
            for (let seed = 201; seed <= 210; seed++) {
                const config = [{ dice: 'd6', set: 'cube-design' }, { dice: 'd6', set: 'cube-design', rolled: 2 }, { dice: 'd20' }];
                const rOld = headlessRoller();
                const old = oldRoll(rOld, config, seedsFor(rOld, config, seed));
                const rNew = headlessRoller();
                const now = await newRoll(rNew, config, seedsFor(rNew, config, seed));
                expect(rNew.dice[0].body.modelDie).toBe(true);
                expect(now.closestIndexes).toEqual(old.closestIndexes);
                expectSameSteps(now.live, old.live, `model seed ${seed}`);
            }
        }, 60000);
    });
});

describe('the replay carries what the live simulation used to provide', () => {
    let restore;
    beforeAll(() => { restore = setCanvasFactories({ canvas: (size) => makeRecordingCanvas(size) }); });
    afterAll(() => restore());
    afterEach(() => vi.restoreAllMocks());

    it('collision sounds fire on the same steps with the same impacts as live collisions did', async () => {
        const config = [{ dice: 'd20' }, { dice: 'd6' }, { dice: 'd8' }];
        const heard = (r) => {
            const out = [];
            r.soundManager = { sounds: [1], play: (v) => out.push([step, v]) };
            return out;
        };
        let step = 0;
        // Old: the live world's collide events. performance.now() frozen so the cooldown is the only gate.
        vi.spyOn(performance, 'now').mockImplementation(() => step * 1000 / 60);
        const rOld = headlessRoller();
        const oldHeard = heard(rOld);
        const seeds = seedsFor(rOld, config, 7);
        // Run the old prediction, then spawn and hook sounds as _spawnBatch does.
        const old = (() => {
            const hiddenRun = oldRoll(headlessRoller(), config, seeds);   // closest indexes from a separate world: same physics
            return hiddenRun;
        })();
        const visible = [];
        config.forEach((roll) => {
            const die = createDie(roll.dice, true, true, undefined, null, rOld.diceMaterial, rOld.scene, rOld.world);
            visible.push(die);
        });
        visible.forEach((d, i) => { rOld._applyDiePhysics(d, seeds[i]); rOld._attachCollisionSound(d); });
        for (step = 1; step <= old.predicted.length; step++) rOld.world.step(1 / 60);

        step = 0;
        const rNew = headlessRoller();
        const newHeard = heard(rNew);
        const queue = seeds.slice();
        rNew._generateRandomSeed = () => queue.shift();
        const prediction = await rNew._predict(config);
        rNew._spawnBatch(config, 'main', prediction, () => {});
        for (step = 1; step <= prediction.recording.steps; step++) rNew.world.step(1 / 60);
        expect(oldHeard.length).toBeGreaterThan(3);
        expect(newHeard).toEqual(oldHeard);
    });

    it('the worker and the main-thread fallback run the same simulation', () => {
        const r = headlessRoller();
        const die = createDie('d20', false, true, undefined, null, r.diceMaterial, null, null);
        r._applyDiePhysics(die, seedsFor(r, [{ dice: 'd20' }], 3)[0]);
        const desc = describeWorld(r.world, { added: [die.body], record: [die.body], watch: [die.body] });
        // What the worker receives is a structured clone of the description.
        const a = runPrediction(structuredClone(desc));
        const b = runPrediction(desc);
        expect(a.steps).toBeGreaterThan(60);
        expect(firstDifference(a.states, b.states)).toBe(-1);
        expect(Array.from(a.events)).toEqual(Array.from(b.events));
        expect(a.states.length).toBe(a.steps * STATE_SIZE);
    });

    it('walls keep cannon\'s default contact material, as the live world gives them', () => {
        const r = headlessRoller();
        const desc = describeWorld(r.world);
        const wall = desc.bodies.find((b) => b.shapes[0].kind === 'box' && b.mass === 0);
        const pairs = desc.contactMaterials.map((c) => [c.a, c.b]);
        expect(pairs.some(([a, b]) => a === wall.material || b === wall.material)).toBe(false);
    });
});
