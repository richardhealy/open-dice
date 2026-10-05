import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { DiceRoller } from '../../src/DiceRoller.js';
import { DecalRegistry } from '../../src/decal-registry.js';
import { registerDiceSet, _resetRegistryForTests } from '../../src/sets/index.js';
import { setCanvasFactories } from '../../src/sets/canvas-factory.js';
import { clearDiceSetCaches } from '../../src/sets/texture-cache.js';
import { makeRecordingCanvas } from './helpers/canvas-stub.js';
import { setModelLoader, loadModel, clearModelCache } from '../../src/models/loader.js';
import { getDieValue, dieMaterials, createDie } from '../../src/dice.js';
import { glow } from '../../src/effects/glow.js';
import { isBodySettled } from '../../src/physics-config.js';
import { cubeDesign, boxScene, liquidCubeDesign, flaskScene } from './helpers/models.js';

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

describe('a roll whose die cannot be built leaves the table as it was', () => {
    let restore;
    beforeEach(async () => {
        restore = setCanvasFactories({ canvas: (size) => makeRecordingCanvas(size) });
        clearModelCache();
        setModelLoader(async () => boxScene());
        await loadModel('flat.glb');
    });
    afterEach(() => { restore(); setModelLoader(null); });

    it('removes every prediction body when building a die throws', () => {
        const r = headlessRoller();
        const before = r.world.bodies.length;
        // A hand-built (unvalidated) design object: resolveSet passes objects through.
        const broken = { id: 'broken', name: 'Broken', family: 'glass', body: { color: '#000000' }, numeral: { color: '#FFFFFF' }, swatch: ['#000000'],
            models: { d6: { src: 'flat.glb', transform: { scale: 1, position: [0, 0, 0], rotation: [0, 0, 0, 1] }, hull: [[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]], faces: [], labels: [], numeral: null } } };
        expect(() => r._preSimulateInLiveWorld([{ dice: 'd20' }, { dice: 'd6', set: broken }])).toThrow();
        expect(r.world.bodies.length).toBe(before);
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

    describe('with a liquid', () => {
        let die;
        beforeEach(async () => {
            registerDiceSet(liquidCubeDesign());
            setModelLoader(async (src) => (src === 'flask.glb' ? flaskScene() : boxScene()));
            await loadModel('flask.glb');
            die = createDie('d6', true, true, undefined, undefined, null, null, null, null, null, null, false, null, null, { set: 'liquid-cube' });
            expect(die.liquid).toBeDefined();
        });

        it('_animate ticks each liquid with the frame time after syncing the mesh', () => {
            const r = headlessRoller();
            r.renderer = { render() {} };
            r.isAnimating = true;
            r._shouldIdle = () => true;
            r.dice.push(die);
            r.world.addBody(die.body);
            die.liquid.tick = vi.fn();
            r._animate(1000);
            expect(die.liquid.tick).toHaveBeenCalledWith(die.body, 0);
            r.isAnimating = true;
            r._animate(1016);
            expect(die.liquid.tick).toHaveBeenLastCalledWith(die.body, expect.closeTo(0.016, 3));
            expect(die.mesh.position.x).toBe(die.body.position.x);
        });

        it('throws one flask per design and type; the other dice roll as the design\'s procedural die', () => {
            const r = headlessRoller();
            const { batch } = rollToRest(r, [{ dice: 'd6', set: 'liquid-cube' }, { dice: 'd6', set: 'liquid-cube' }, { dice: 'd6', set: 'liquid-cube' }]);
            expect(batch.dice.map((d) => !!d.model)).toEqual([true, false, false]);
            expect(batch.dice.map((d) => !!d.liquid)).toEqual([true, false, false]);
            // The procedural dice are ordinary meshes on classic bodies, not model bodies on the hull.
            expect(batch.dice[0].body.modelDie).toBe(true);
            for (const die of batch.dice.slice(1)) {
                expect(die.mesh.isMesh).toBe(true);
                expect(die.type).toBe('d6');
                expect(die.body.modelDie).toBeFalsy();
            }
        });

        it('a replay shows its values on the flask and on the procedural dice alike', () => {
            const r = headlessRoller();
            const { batch, result } = rollToRest(r, [{ dice: 'd6', set: 'liquid-cube', rolled: 2 }, { dice: 'd6', set: 'liquid-cube', rolled: 5 }, { dice: 'd6', set: 'liquid-cube', rolled: 3 }]);
            expect(batch.dice.map((d) => !!d.model)).toEqual([true, false, false]);
            expect(result.results.map((x) => x.visible)).toEqual([2, 5, 3]);
        });

        it('a design without liquid is not capped: every die rolls as the model', () => {
            const r = headlessRoller();
            const { batch } = rollToRest(r, [{ dice: 'd6', set: 'cube-design' }, { dice: 'd6', set: 'cube-design' }]);
            expect(batch.dice.map((d) => !!d.model)).toEqual([true, true]);
        });

        it('reset() fades the glass from its own opacity, the opaque parts from 1', async () => {
            const frames = [];
            vi.stubGlobal('requestAnimationFrame', (cb) => { frames.push(cb); return frames.length; });
            const now = vi.spyOn(performance, 'now');
            now.mockReturnValue(0);
            const r = headlessRoller();
            r.dice.push(die);
            r._ensureAnimating = () => {};
            r.isAnimating = true;
            const glass = die.mesh.getObjectByName('liquid-shell-outer').material;
            const cork = die.mesh.getObjectByName('stopper').material;
            const done = r.reset();
            expect(glass.opacity).toBeCloseTo(0.35, 6);                       // the first frame, no time passed
            expect(cork.opacity).toBeCloseTo(1, 6);
            now.mockReturnValue(250);
            frames.shift()();
            expect(glass.opacity).toBeGreaterThan(0);
            expect(glass.opacity).toBeLessThan(0.35);
            expect(cork.opacity).toBeGreaterThan(0);
            expect(cork.opacity).toBeLessThan(1);
            expect(glass.opacity / cork.opacity).toBeCloseTo(0.35, 6);
            now.mockReturnValue(600);
            frames.shift()();
            await done;
            expect(glass.opacity).toBe(0);
            now.mockRestore();
            vi.unstubAllGlobals();
        });
    });
});
