import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { DiceRoller } from '../../src/DiceRoller.js';
import { DecalRegistry } from '../../src/decal-registry.js';
import { registerDiceSet, _resetRegistryForTests } from '../../src/sets/index.js';
import { setCanvasFactories } from '../../src/sets/canvas-factory.js';
import { clearDiceSetCaches } from '../../src/sets/texture-cache.js';
import { makeRecordingCanvas } from './helpers/canvas-stub.js';
import { setModelLoader, loadModel, clearModelCache } from '../../src/models/loader.js';
import { getDieValue, dieMaterials } from '../../src/dice.js';
import { glow } from '../../src/effects/glow.js';
import { isBodySettled } from '../../src/physics-config.js';
import { cubeDesign, boxScene } from './helpers/models.js';

const proto = DiceRoller.prototype;

/** A DiceRoller without its WebGL constructor: real physics, prediction, spawn and results. */
function headlessRoller() {
    const r = Object.create(proto);
    Object.assign(r, {
        width: 1600, height: 900, throwSpeed: 15, throwSpin: 20,
        dice: [], diceBatches: [], effects: [], effectRules: null, defaultSet: null,
        decalRegistry: new DecalRegistry(), soundManager: { sounds: [], play() {} },
        up: new THREE.Vector3(0, 1, 0), scene: new THREE.Scene(),
        _setAssetsReady: true, _rollGeneration: 0, _pendingSetRolls: 0, _animationHolds: 0, _destroyed: false,
    });
    r._initPhysics();
    return r;
}

/** Spawn one predicted batch and step it to rest the way the animation loop does. */
function rollToRest(r, config) {
    const { closestIndexes, seeds } = r._preSimulateInLiveWorld(config);
    const batch = r._spawnBatch(config, 'main', closestIndexes, seeds, () => {});
    for (let step = 0; step < 5000; step++) {
        r.world.step(1 / 60);
        if (step > 60 && batch.dice.every((d) => r._isBodySettled(d.body))) break;
    }
    batch.dice.forEach((d) => d.mesh.quaternion.copy(d.body.quaternion));
    return { batch, result: r._computeBatchResults(batch.dice) };
}

describe('model dice in the roller', () => {
    let restore;
    beforeEach(async () => {
        restore = setCanvasFactories({ canvas: (size) => makeRecordingCanvas(size) });
        clearDiceSetCaches();
        clearModelCache();
        _resetRegistryForTests();
        registerDiceSet(cubeDesign());
        setModelLoader(async () => boxScene());
        await loadModel('cube.glb');
    });
    afterEach(() => { restore(); setModelLoader(null); });

    it('without a target, reports the face the model physically lands on', () => {
        for (let i = 0; i < 6; i++) {
            const r = headlessRoller();
            const { batch, result } = rollToRest(r, [{ dice: 'd6', set: 'cube-design' }]);
            const die = batch.dice[0];
            expect(die.model).toBeTruthy();
            const landed = getDieValue(die, r.up)[0];
            expect(result.results[0].value).toBe(landed);
            expect(result.results[0].visible).toBe(landed);
            expect(result.variances).toEqual([]);
            // The prediction built the same model body, so it predicted this very face.
            expect(die.faceValues[die.closestIndex]).toBe(landed);
        }
    });

    it('with a target (a replay), the model lands showing the target', () => {
        for (const target of [1, 4, 6]) {
            const r = headlessRoller();
            const { result } = rollToRest(r, [{ dice: 'd6', set: 'cube-design', rolled: target }]);
            expect(result.results[0].visible).toBe(target);
            expect(result.results[0].value).toBe(target);
        }
    });

    it('mixes model dice with procedural dice of the same design', () => {
        const r = headlessRoller();
        const { batch, result } = rollToRest(r, [{ dice: 'd6', set: 'cube-design' }, { dice: 'd8', set: 'cube-design', rolled: 7 }]);
        expect(batch.dice[0].model).toBeTruthy();
        expect(batch.dice[1].model).toBeUndefined();
        expect(result.results[1].visible).toBe(7);
    });
});

describe('a model die rests only once it has stayed still', () => {
    let restore;
    beforeEach(async () => {
        restore = setCanvasFactories({ canvas: (size) => makeRecordingCanvas(size) });
        clearModelCache();
        _resetRegistryForTests();
        registerDiceSet(cubeDesign());
        setModelLoader(async () => boxScene());
        await loadModel('cube.glb');
    });
    afterEach(() => { restore(); setModelLoader(null); });

    it('counts as settled after ten still physics steps; a classic die after one', () => {
        const r = headlessRoller();
        const { closestIndexes, seeds } = r._preSimulateInLiveWorld([{ dice: 'd6', set: 'cube-design' }, { dice: 'd6' }]);
        const [model, classic] = r._spawnBatch([{ dice: 'd6', set: 'cube-design' }, { dice: 'd6' }], 'main', closestIndexes, seeds, () => {}).dice;
        for (const d of [model, classic]) {
            d.body.position.set(d === model ? -3 : 3, d === model ? 0.55 : 0.5, 0); // resting on the floor
            d.body.quaternion.set(0, 0, 0, 1);
            d.body.velocity.set(0, 0, 0);
            d.body.angularVelocity.set(0, 0, 0);
        }
        let run = 0;
        for (let i = 0; i < 120; i++) {
            r.world.step(1 / 60);
            run = isBodySettled(model.body) ? run + 1 : 0;
            expect(r._isBodySettled(model.body)).toBe(run >= 10);
            expect(r._isBodySettled(classic.body)).toBe(isBodySettled(classic.body));
        }
        expect(r._isBodySettled(model.body)).toBe(true);
        // A nudge restarts the count.
        model.body.angularVelocity.set(0, 2, 0);
        r.world.step(1 / 60);
        expect(r._isBodySettled(model.body)).toBe(false);
    });
});

describe('waiting for models', () => {
    beforeEach(() => {
        clearModelCache();
        _resetRegistryForTests();
        registerDiceSet(cubeDesign());
    });
    afterEach(() => setModelLoader(null));

    it('a roll needs assets while a die model has not loaded, and not after', async () => {
        const loader = vi.fn(async () => boxScene());
        setModelLoader(loader);
        const r = { _setAssetsReady: true, defaultSet: null, _setFor: proto._setFor, _needsSetAssets: proto._needsSetAssets, _modelsFor: proto._modelsFor };
        expect(r._needsSetAssets([{ dice: 'd6', set: 'cube-design' }])).toBe(true);
        expect(r._needsSetAssets([{ dice: 'd8', set: 'cube-design' }])).toBe(false);   // no d8 model
        await loadModel('cube.glb');
        expect(r._needsSetAssets([{ dice: 'd6', set: 'cube-design' }])).toBe(false);
    });

    it('roll() loads the models before predicting', async () => {
        const order = [];
        setModelLoader(async () => { order.push('load'); return boxScene(); });
        const r = {
            floor: null, dice: [], diceBatches: [], effects: [], isAnimating: false, defaultSet: null,
            _setAssetsReady: true, _rollGeneration: 0, _pendingSetRolls: 0, _destroyed: false,
            _clearDice() {}, _setFor: proto._setFor, _modelsFor: proto._modelsFor, _needsSetAssets: proto._needsSetAssets,
            _ensureSetAssets: proto._ensureSetAssets, _ensureModels: proto._ensureModels, _setAssetsPromise: Promise.resolve(),
            _startRoll: vi.fn(() => { order.push('start'); return Promise.resolve(1); }),
            roll: proto.roll, isRolling: proto.isRolling, _ensureAnimating() {},
        };
        await r.roll([{ dice: 'd6', set: 'cube-design' }]);
        expect(order).toEqual(['load', 'start']);
    });
});

describe('effects and fades reach model materials', () => {
    let restore, die;
    beforeEach(async () => {
        restore = setCanvasFactories({ canvas: (size) => makeRecordingCanvas(size) });
        clearModelCache();
        _resetRegistryForTests();
        registerDiceSet(cubeDesign());
        setModelLoader(async () => boxScene());
        await loadModel('cube.glb');
        const r = headlessRoller();
        die = rollToRest(r, [{ dice: 'd6', set: 'cube-design' }]).batch.dice[0];
    });
    afterEach(() => { restore(); setModelLoader(null); vi.useRealTimers(); });

    it('glow lights the model and its labels, then restores them', () => {
        const now = vi.spyOn(performance, 'now');
        now.mockReturnValue(0);
        const effect = glow({ color: 0xff0000, duration: 100 }).create({ die });
        const materials = dieMaterials(die).filter((m) => m.emissive);
        const before = materials.map((m) => m.emissive.getHex());
        now.mockReturnValue(15);
        effect.update();
        expect(materials.every((m, i) => m.emissive.getHex() !== before[i])).toBe(true);
        now.mockReturnValue(100);
        expect(effect.update()).toBe(true);
        expect(materials.map((m) => m.emissive.getHex())).toEqual(before);
        now.mockRestore();
    });

    it('reset() fades every material of a model die', async () => {
        const frames = [];
        vi.stubGlobal('requestAnimationFrame', (cb) => { frames.push(cb); return frames.length; });
        const now = vi.spyOn(performance, 'now');
        now.mockReturnValue(0);
        const r = headlessRoller();
        r.dice.push(die);
        r._ensureAnimating = () => {};
        r.isAnimating = true;
        const done = r.reset();
        now.mockReturnValue(250);
        frames.shift()();
        for (const m of dieMaterials(die)) {
            expect(m.transparent).toBe(true);
            expect(m.opacity).toBeGreaterThan(0);
            expect(m.opacity).toBeLessThan(1);
        }
        now.mockReturnValue(600);
        frames.shift()();
        await done;
        now.mockRestore();
        vi.unstubAllGlobals();
    });
});
