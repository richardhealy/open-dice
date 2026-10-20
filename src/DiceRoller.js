import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createDie, getDieValue, dieMaterials } from './dice.js';
import { loadModel, loadSetModels, isModelSettled } from './models/loader.js';
import { DecalRegistry } from './decal-registry.js';
import { SoundManager } from './sound-manager.js';
import { glow, scalePulse, haloRing, runEffectsRules } from './effects/index.js';
import { modelDiceAllowance } from './models/throw-allowance.js';
import { resolveSet, CLASSIC } from './sets/index.js';
import { prepareDiceSets } from './sets/prepare.js';
import { collectSetImages } from './sets/face-materials.js';
import { collectSetDecalSources } from './sets/decals.js';
import { setTextureAnisotropy } from './sets/texture-cache.js';
import { resolvePixelRatio, clampPixelRatioToBuffer } from './pixel-ratio.js';
import { ClassicTextureCache } from './classic-textures.js';
import { PLACEHOLDER_MATERIAL } from './sets/face-materials.js';
import { GRAVITY_Y, SOLVER_ITERATIONS, CONTACT, applyThrow, isDieSettled, trackRestSteps } from './physics-config.js';
import { describeWorld, readState, STATE_SIZE } from './physics-sim.js';
import { predict, warmPrediction } from './prediction.js';

const DIE_TYPES = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

/** Resolves in the browser's next idle period (requestIdleCallback), or after a zero timeout without it. */
function whenIdle() {
    return new Promise((resolve) => {
        if (typeof requestIdleCallback === 'function') requestIdleCallback(() => resolve(), { timeout: 1000 });
        else setTimeout(resolve, 0);
    });
}

// Collisions below this impact speed are too quiet to be audible without distortion.
// Above ~12 the cap kicks in.
const COLLIDE_MIN_IMPACT = 1.5;
const COLLIDE_MAX_IMPACT = 12;
// Throttle per die — without this, dice rolling against the floor trigger dozens of
// micro-contacts per second and the playback becomes a buzz instead of distinct clacks.
const COLLIDE_COOLDOWN_MS = 60;


/**
 * DiceRoller - A 3D dice rolling engine
 * @class
 */
export class DiceRoller {
    /**
     * Creates a new DiceRoller instance
     * @param {Object} options - Configuration options
     * @param {HTMLElement} options.container - The DOM element to render the canvas in
     * @param {number} [options.width] - Canvas width (defaults to container width)
     * @param {number} [options.height] - Canvas height (defaults to container height)
     * @param {number} [options.throwSpeed=15] - Initial throw speed
     * @param {number} [options.throwSpin=20] - Initial throw spin
     * @param {Function} [options.onRollComplete] - Callback when dice settle (main rolls only)
     * @param {string} [options.set] - Default dice set id for every die (see setDefaultSet)
     * @param {number} [options.pixelRatio] - Canvas pixel ratio; defaults to the device ratio capped at 2. Pass 1 to opt out.
     */
    constructor(options = {}) {
        if (!options.container) {
            throw new Error('DiceRoller requires a container element');
        }

        this.container = options.container;
        this.width = options.width || this.container.clientWidth;
        this.height = options.height || this.container.clientHeight;
        this.throwSpeed = options.throwSpeed || 15;
        this.throwSpin = options.throwSpin || 20;
        this._pixelRatioOption = options.pixelRatio;
        this.pixelRatio = resolvePixelRatio(options.pixelRatio, typeof window !== 'undefined' ? window.devicePixelRatio : 1);
        // Rendering stops while nothing on the table can change (see _shouldIdle); reset()'s fade
        // holds it open because it empties this.dice before the dice have faded.
        this._animationHolds = 0;
        this.onRollComplete = options.onRollComplete || null;
        // Fires once per batch as it settles, with the same {total, variances, results}
        // object plus a reference to the batch dice. Lets callers schedule per-die effects
        // (e.g. glow on a crit) without polling the engine.
        this.onBatchSettled = options.onBatchSettled || null;
        // Declarative rules: `[{ match, play }, ...]`. Evaluated against each per-die result
        // when a batch settles; matching effects are scheduled onto `this.effects`.
        this.effectRules = options.effects || null;
        this.effects = [];
        // Default dice set for dice that do not name their own. Resolved per roll, so a set
        // registered later still works (see _setFor).
        this.defaultSet = options.set || null;
        this._setAssetsReady = false;
        this._setAssetsPromise = null;
        // A roll that waits for set assets must not spawn if a later roll() wiped the table
        // meanwhile, or if the roller was destroyed. isRolling() counts the wait.
        this._rollGeneration = 0;
        this._pendingSetRolls = 0;
        this._destroyed = false;
        // Roll predictions run one at a time (each sees the dice the one before spawned) and,
        // with a Web Worker, off the main thread. While one runs, isRolling() is true and the
        // live world does not step. A table wipe (roll(), reset()) bumps the epoch, and a
        // prediction that finishes after one is dropped, as if its dice had spawned just before.
        this._pendingPredictions = 0;
        this._predictionQueue = Promise.resolve();
        this._tableEpoch = 0;
        // The recorded throw being played back (see _replayStep).
        this._replay = null;
        // Dice reset() is fading out: off the table but still in the physics world.
        this._fadingDice = [];
        // Classic face textures shared by this roller's dice, and those of dice that have left
        // the table, released once the next batch is built so a repeated roll reuses them.
        this._classicTextures = new ClassicTextureCache();
        this._retiredTextures = [];

        this.dice = [];
        this.diceBatches = [];
        this.lastTime = undefined;
        this.animationFrameId = null;
        this.isAnimating = false;
        this.decalRegistry = new DecalRegistry();
        this.soundManager = new SoundManager({ volume: options.soundVolume ?? 1 });
        if (options.sounds && options.sounds.length > 0) {
            this.soundManager.preload(options.sounds);
        }

        this._initScene();
        this._initPhysics();
        warmPrediction();

        this._boundResizeHandler = this._handleResize.bind(this);
        window.addEventListener('resize', this._boundResizeHandler);
    }

    /**
     * Initialize Three.js scene
     * @private
     */
    _initScene() {
        this.scene = new THREE.Scene();

        const frustumSize = 18;
        const aspect = this.width / this.height;
        let leftBound = -frustumSize * aspect / 2;
        let rightBound = frustumSize * aspect / 2;
        let topBound = frustumSize / 2;
        let bottomBound = -frustumSize / 2;
        this.up = new THREE.Vector3(0, 1, 0);

        this.camera = new THREE.OrthographicCamera(
            leftBound, rightBound, topBound, bottomBound, 1, 100
        );
        this.camera.position.set(0, 30, 0);
        this.camera.up.set(0, 0, -1);
        this.camera.lookAt(0, 0, 0);
        this.camera.updateProjectionMatrix();

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.pixelRatio = clampPixelRatioToBuffer(this.pixelRatio, this.width, this.height, this.renderer.capabilities.maxTextureSize);
        this.renderer.setPixelRatio(this.pixelRatio);
        this.renderer.setSize(this.width, this.height);
        // Set textures are filtered anisotropically so numerals stay sharp on tilted faces.
        setTextureAnisotropy(this.renderer.capabilities.getMaxAnisotropy());
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(ambientLight);

        this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        this.directionalLight.position.set(5, 10, 12);
        this.directionalLight.castShadow = true;
        this.directionalLight.shadow.mapSize.width = 2048;
        this.directionalLight.shadow.mapSize.height = 2048;
        this.directionalLight.shadow.bias = -0.0001;

        this.directionalLight.shadow.camera.left = leftBound;
        this.directionalLight.shadow.camera.right = rightBound;
        this.directionalLight.shadow.camera.top = topBound;
        this.directionalLight.shadow.camera.bottom = bottomBound;
        this.directionalLight.shadow.camera.near = 0.5;
        this.directionalLight.shadow.camera.far = 100;
        this.scene.add(this.directionalLight);

        const floorGeometry = new THREE.PlaneGeometry(50, 50, 1, 1);
        const floorMaterial = new THREE.ShadowMaterial({ opacity: 0.5 });
        this.floor = new THREE.Mesh(floorGeometry, floorMaterial);
        this.floor.rotation.x = -Math.PI / 2;
        this.floor.position.y = -0.05;
        this.floor.receiveShadow = true;
        this.scene.add(this.floor);
    }

    /**
     * Initialize Cannon.js physics world
     * @private
     */
    _initPhysics() {
        this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, GRAVITY_Y, 0) });
        this.world.broadphase = new CANNON.NaiveBroadphase();
        this.world.solver.iterations = SOLVER_ITERATIONS;
        trackRestSteps(this.world);
        this.world.addEventListener('postStep', () => this._replayStep());

        this.diceMaterial = new CANNON.Material('dice');
        const floorPhysicsMaterial = new CANNON.Material('floor');

        this.world.addContactMaterial(new CANNON.ContactMaterial(
            this.diceMaterial, floorPhysicsMaterial, { ...CONTACT.diceFloor }
        ));
        this.world.addContactMaterial(new CANNON.ContactMaterial(
            this.diceMaterial, this.diceMaterial, { ...CONTACT.diceDice }
        ));
        this.world.addContactMaterial(new CANNON.ContactMaterial(
            this.diceMaterial, new CANNON.Material('wall'), { ...CONTACT.diceWall }
        ));

        const floorBody = new CANNON.Body({
            mass: 0,
            material: floorPhysicsMaterial,
            shape: new CANNON.Plane()
        });
        floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
        this.world.addBody(floorBody);

        const frustumSize = 18;
        const aspect = this.width / this.height;
        const topBound = frustumSize / 2;
        const bottomBound = -frustumSize / 2;
        this._updatePhysicsWalls(frustumSize, aspect, topBound, bottomBound);
    }

    /**
     * Update physics walls based on viewport
     * @private
     */
    _updatePhysicsWalls(frustumSize, aspect, topBound, bottomBound) {
        if (this.walls) {
            this.walls.forEach(wall => this.world.removeBody(wall));
        }
        this.walls = [];

        const wallThickness = 2;
        const wallHeight = 20;
        const wallMaterial = new CANNON.Material('wall');

        const leftBound = -frustumSize * aspect / 2;
        const rightBound = frustumSize * aspect / 2;

        const addWall = (pos, halfExt) => {
            const wall = new CANNON.Body({
                mass: 0,
                shape: new CANNON.Box(new CANNON.Vec3(halfExt[0], halfExt[1], halfExt[2])),
                material: wallMaterial
            });
            wall.position.set(pos[0], pos[1], pos[2]);
            this.world.addBody(wall);
            this.walls.push(wall);
        };

        addWall(
            [leftBound - wallThickness / 2, wallHeight / 2, 0],
            [wallThickness / 2, wallHeight / 2, frustumSize / 2]
        );
        addWall(
            [rightBound + wallThickness / 2, wallHeight / 2, 0],
            [wallThickness / 2, wallHeight / 2, frustumSize / 2]
        );
        addWall(
            [0, wallHeight / 2, topBound + wallThickness / 2],
            [frustumSize * aspect / 2, wallHeight / 2, wallThickness / 2]
        );
        addWall(
            [0, wallHeight / 2, bottomBound - wallThickness / 2],
            [frustumSize * aspect / 2, wallHeight / 2, wallThickness / 2]
        );
    }

    /**
     * Handle window resize
     * @private
     */
    _handleResize() {
        this.width = this.container.clientWidth;
        this.height = this.container.clientHeight;

        const frustumSize = 18;
        let aspect = this.width / this.height;
        let leftBound = -frustumSize * aspect / 2;
        let rightBound = frustumSize * aspect / 2;
        let topBound = frustumSize / 2;
        let bottomBound = -frustumSize / 2;

        this.camera.left = leftBound;
        this.camera.right = rightBound;
        this.camera.top = topBound;
        this.camera.bottom = bottomBound;
        this.camera.updateProjectionMatrix();

        if (this.directionalLight) {
            this.directionalLight.shadow.camera.left = leftBound;
            this.directionalLight.shadow.camera.right = rightBound;
            this.directionalLight.shadow.camera.top = topBound;
            this.directionalLight.shadow.camera.bottom = bottomBound;
            this.directionalLight.shadow.camera.updateProjectionMatrix();
        }

        // The display may have changed density (window moved between screens, browser zoom).
        const device = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
        this.pixelRatio = clampPixelRatioToBuffer(resolvePixelRatio(this._pixelRatioOption, device), this.width, this.height, this.renderer.capabilities.maxTextureSize);
        this.renderer.setPixelRatio(this.pixelRatio);
        this.renderer.setSize(this.width, this.height);
        this._updatePhysicsWalls(frustumSize, aspect, topBound, bottomBound);
        // An idle table keeps its last frame; redraw it at the new size.
        if (!this.isAnimating) this.renderer.render(this.scene, this.camera);
    }

    /**
     * Roll dice — clears any existing dice and starts a new roll.
     *
     * The prediction steps an exact copy of the live physics world (same
     * bodies in the same order, same RNG seeds the visible dice use) to
     * rest, off the main thread when Web Workers are available, and records
     * every step. The resting face is captured, the visible dice are spawned
     * with the target painted on it, and the recording is played back step
     * by step: the visible dice move exactly as the prediction did, so the
     * predicted face is the face that lands up. Variances are zero by
     * construction on a plain roll() — the v1.1 contract.
     *
     * @param {Array<Object>} diceConfig - Array of dice configurations
     * @param {string} diceConfig[].dice - Type of die (d4, d6, d8, d10, d12, d20, d100)
     * @param {number} [diceConfig[].rolled] - Optional target number for the roll
     * @returns {Promise<number>} Resolves with the total of this batch (backward compatible)
     */
    roll(diceConfig) {
        this._clearDice();
        if (this.floor) this.floor.material.opacity = 0.5;
        this.lastTime = undefined;

        // isRolling() is true as soon as roll() returns. Only the first roll that uses a set
        // waits for the font and the environment map, a few milliseconds once, and a roll with
        // a model die waits until that model has loaded (or failed), so the prediction and the
        // visible die match.
        const generation = ++this._rollGeneration;
        if (this._needsSetAssets(diceConfig)) {
            this._pendingSetRolls++;
            return Promise.all([this._ensureSetAssets(), this._ensureModels(diceConfig)]).then(() => {
                this._pendingSetRolls--;
                // A later roll() wiped the table while we waited, or the roller is gone: never
                // spawn. The promise stays pending, exactly as a wiped batch's promise always has.
                if (this._destroyed || generation !== this._rollGeneration) return new Promise(() => {});
                return this._startRoll(diceConfig);
            });
        }
        return this._startRoll(diceConfig);
    }

    /** Predict, spawn and resolve one main batch. @private */
    _startRoll(diceConfig) {
        const epoch = this._tableEpoch;
        return this._predictAndSpawn(diceConfig, epoch, (prediction) => new Promise((resolve) => {
            // Rendering starts fresh with the dice, as it did when the prediction blocked.
            this.lastTime = undefined;
            this._spawnBatch(diceConfig, 'main', prediction, (result) => {
                // Pass the full result as a second arg so callers can read variances/results
                // without breaking the original `total`-only callback signature. Wrapped
                // in try/catch so a buggy callback can't take down the animate loop.
                if (this.onRollComplete) {
                    try { this.onRollComplete(result.total, result); }
                    catch (e) { console.error('onRollComplete threw:', e); }
                }
                resolve(result.total);
            });
            this._ensureAnimating();
        }));
    }

    /**
     * Queue a prediction for `diceConfig` behind any earlier one, then spawn with `spawn`
     * (which returns the batch's promise). `epoch` is the table the dice are meant for (null:
     * whatever table is there when the prediction starts). If the table is wiped or the
     * roller destroyed before the dice spawn, they never do and the promise stays pending,
     * as a wiped batch's promise always has. A failed prediction rejects.
     * @private
     */
    _predictAndSpawn(diceConfig, epoch, spawn) {
        this._pendingPredictions++;
        const task = this._predictionQueue.then(async () => {
            try {
                if (this._destroyed || (epoch !== null && epoch !== this._tableEpoch)) return null;
                const startEpoch = this._tableEpoch;
                const prediction = await this._predict(diceConfig);
                if (this._destroyed || startEpoch !== this._tableEpoch) return null;
                return { done: spawn(prediction) };
            } finally {
                this._pendingPredictions--;
            }
        });
        this._predictionQueue = task.catch(() => {});
        return task.then((spawned) => (spawned ? spawned.done : new Promise(() => {})));
    }

    /**
     * Re-evaluate every die currently in the scene (across all batches) and return the
     * combined results. Useful after `addDice()` to detect dice that were knocked off
     * their authoritative orientation by the new dice's collisions.
     *
     * @returns {{total: number, variances: Array, results: Array}}
     */
    getCurrentResults() {
        return this._computeBatchResults(this.dice);
    }

    /**
     * True if any batch is still unresolved — i.e. there are dice in the scene that
     * haven't settled yet. Callers can use this to decide whether a fresh `roll()` (which
     * wipes everything) is appropriate, or whether to add to the in-flight scene via
     * `addDice()` instead.
     */
    isRolling() {
        return this._pendingSetRolls > 0 || this._pendingPredictions > 0 || this.diceBatches.some(b => !b.resolved && b.dice.length > 0);
    }

    /**
     * Schedule an effect using an effect spec from the effects module. Most callers will
     * want to use `effects: [...]` constructor rules instead — this is for ad-hoc, "fire
     * this effect now in response to something the engine doesn't know about" cases.
     *
     * @param {Object}  spec - An effect spec (e.g. `glow({ color: 0xff0000 })`).
     * @param {Object}  [die] - The die to apply the effect to. May be omitted for
     *                          'once'-scoped effects like screenShake.
     * @param {Object}  [extras] - Optional per-die or batch result, for effects that read
     *                             from `ctx.result` or `ctx.batchResult`.
     */
    playEffect(spec, die, extras = {}) {
        if (!spec || typeof spec.create !== 'function') return null;
        const ctx = { die, result: extras.result, batchResult: extras.batchResult, roller: this };
        const effect = spec.create(ctx);
        if (effect && typeof effect.update === 'function') {
            this.effects.push(effect);
            this._ensureAnimating();
            return effect;
        }
        return null;
    }

    /** Convenience imperative shortcuts that wrap their factories. */
    glow(die, options) { return this.playEffect(glow(options), die); }
    scalePulse(die, options) { return this.playEffect(scalePulse(options), die); }
    haloRing(die, options) { return this.playEffect(haloRing(options), die); }

    /**
     * Replace the active rule set at runtime.
     */
    setEffectRules(rules) {
        this.effectRules = rules;
    }

    /** Change the default dice set for later rolls. Pass null to return to classic dice. */
    setDefaultSet(id) {
        this.defaultSet = id || null;
    }

    /**
     * Prepare dice sets ahead of the first roll: loads the numeral font, installs the
     * environment map, loads every image the listed sets reference (body, normal and
     * decoration images) and paints every face of every die type for them, so the first
     * roll does no painting and never shows an image's fallback. Optional; rolls work without it.
     * Only the listed sets are loaded. The painting runs one die type at a time in idle
     * time (requestIdleCallback, else a timeout), so preloading never holds up the page.
     * @param {string[]} ids
     */
    async preloadSets(ids = []) {
        await this._ensureSetAssets();
        const sets = ids.map((id) => resolveSet(id)).filter((set) => set.id !== CLASSIC);
        await loadSetModels(sets);
        const images = [...new Set(sets.flatMap((set) => [...collectSetImages(set), ...collectSetDecalSources(set)]))];
        if (images.length > 0) await this.decalRegistry.preload(images);
        for (const set of sets) {
            for (const type of DIE_TYPES) {
                const halves = type === 'd100' ? [true, false] : [true];
                for (const isFirst of halves) {
                    await whenIdle();
                    if (this._destroyed) return;
                    const die = createDie(type, true, isFirst, undefined, undefined, this.diceMaterial, null, null,
                        null, null, null, false, null, this.decalRegistry, { set });
                    dieMaterials(die).forEach((m) => m.dispose());
                }
            }
        }
    }

    /** Resolved set for one die config: die.set, then the roller default, then classic. @private */
    _setFor(diceRoll) {
        return resolveSet(diceRoll.set || this.defaultSet);
    }

    /** The model entries the dice of this config roll as (a design's model for the die's type). @private */
    _modelsFor(diceConfig) {
        const models = [];
        for (const d of diceConfig) {
            const set = this._setFor(d);
            const model = set.models ? set.models[d.dice] : null;
            if (model) models.push(model);
        }
        return models;
    }

    /**
     * True when this config has a non-classic die and the font/environment are not ready, or
     * a model die whose model has not finished loading. @private
     */
    _needsSetAssets(diceConfig) {
        if (this._modelsFor(diceConfig).some((m) => !isModelSettled(m.src))) return true;
        if (this._setAssetsReady) return false;
        return diceConfig.some((d) => this._setFor(d).id !== CLASSIC);
    }

    /** Load the models this config's dice roll as; resolves when each has loaded or failed. @private */
    _ensureModels(diceConfig) {
        return Promise.all(this._modelsFor(diceConfig).map((m) => loadModel(m.src)));
    }

    /** Load the numeral font and install the environment map, once per roller. @private */
    _ensureSetAssets() {
        if (!this._setAssetsPromise) {
            this._setAssetsPromise = prepareDiceSets({ renderer: this.renderer, scene: this.scene }).then(() => {
                this._setAssetsReady = true;
            });
        }
        return this._setAssetsPromise;
    }

    /**
     * Add dice to a scene that may already contain previously-rolled dice.
     *
     * Waits for any unresolved batches to settle first, then predicts the
     * new batch in a copy of the live world with the existing dice present,
     * so the prediction collides with them realistically. The recording
     * covers the existing dice too, and the playback moves them exactly as
     * the prediction did, so `variances` is empty by construction —
     * equivalent guarantee to roll() but without wiping the scene.
     *
     * @param {Array<Object>} diceConfig - Array of dice configurations
     * @returns {Promise<{total: number, variances: Array, results: Array}>}
     */
    async addDice(diceConfig) {
        // Wait for any unresolved batches to finish settling so the
        // snapshot we're about to take is of dice at rest. This serializes
        // rapid-fire addDice calls behind their predecessors — desirable
        // for spectator-side replay, where rolls arrive over the wire and
        // should stack visually rather than crash through each other.
        await this._waitForAllBatchesResolved();
        if (this._needsSetAssets(diceConfig)) await Promise.all([this._ensureSetAssets(), this._ensureModels(diceConfig)]);
        if (this._destroyed) return new Promise(() => {});

        return this._predictAndSpawn(diceConfig, null, (prediction) => new Promise((resolve) => {
            this._spawnBatch(diceConfig, 'added', prediction, resolve);
            this._ensureAnimating();
        }));
    }

    /**
     * Resolves once every batch currently tracked in `this.diceBatches` is
     * marked resolved (i.e. its dice have all settled and its callback has
     * fired) and no prediction is in flight (its dice are about to spawn).
     * No-op when the scene is idle. Polls at 50ms — cheap, and the typical
     * wait is ~1-2s while live dice come to rest.
     * @private
     */
    _waitForAllBatchesResolved() {
        const busy = () => this._pendingPredictions > 0 || this.diceBatches.some(b => !b.resolved);
        if (!busy()) return Promise.resolve();
        return new Promise((resolve) => {
            const check = () => {
                if (!busy()) resolve();
                else setTimeout(check, 50);
            };
            check();
        });
    }

    /**
     * Preload decal images so they render on the first roll without a brief text fallback.
     * Recommended to await before calling `roll()` with decals.
     *
     * @param {string[]} srcs - Array of image URLs/paths to preload.
     * @returns {Promise} Resolves once every src has either loaded or failed.
     */
    preloadDecals(srcs) {
        return this.decalRegistry.preload(srcs);
    }

    /**
     * Spawn visible dice into the live world, track as a batch, and play the
     * prediction back. `prediction` comes from `_predict`: `closestIndexes`
     * (face index each die will land on), `seeds` (RNG seeds used by
     * `_applyDiePhysics` to put each die in its predicted starting state),
     * and the `recording` of the throw with the dice it covers.
     * @private
     */
    _spawnBatch(diceConfig, type, prediction, onResolve) {
        const { closestIndexes, seeds } = prediction;
        if (prediction.live) this._applyPredictionSideEffects(prediction);
        const batchDice = [];
        // The replay moves the dice already on the table (recorded first) and these.
        const replayed = prediction.recorded ? prediction.recorded.slice() : null;
        let cidx = 0;
        // One liquid flask per design and type in a throw; the prediction made the same choice.
        const allowed = modelDiceAllowance(diceConfig, (d) => this._setFor(d));
        diceConfig.forEach((diceRoll, k) => {
            const repeatCount = diceRoll.dice === 'd100' ? 2 : 1;
            for (let i = 0; i < repeatCount; i++) {
                const closestIndex = closestIndexes[cidx];
                const die = createDie(
                    diceRoll.dice, true, i === 0,
                    diceRoll.rolled, closestIndex,
                    this.diceMaterial, this.scene, this.world,
                    diceRoll.diceColor, diceRoll.textColor, diceRoll.backgroundColor,
                    diceRoll.isSecret, diceRoll.decals, this.decalRegistry,
                    { set: this._setFor(diceRoll), model: allowed[k], classicTextures: this._classicTextures }
                );
                if (!die) { cidx++; continue; }

                die.isFirst = !(i > 0 && diceRoll.dice === 'd100');
                die.closestIndex = closestIndex;
                die.targetNumber = diceRoll.rolled;

                this._applyDiePhysics(die, seeds[cidx]);
                this._attachCollisionSound(die);
                this.dice.push(die);
                batchDice.push(die);
                if (replayed && prediction.slots[cidx] != null) replayed[prediction.slots[cidx]] = die;

                // Roll-time effects declared on this die's config (e.g. `fire()`).
                // They attach at spawn and self-terminate once the die settles + their
                // residual particles fade.
                if (Array.isArray(diceRoll.effects)) {
                    for (const spec of diceRoll.effects) {
                        this.playEffect(spec, die);
                    }
                }
                cidx++;
            }
        });

        const batch = { dice: batchDice, type, resolved: false, resolve: onResolve };
        this.diceBatches.push(batch);
        if (replayed) this._startReplay(prediction.recording, replayed);
        // The new dice hold the textures they share with the dice that left; the rest go now.
        this._releaseRetiredTextures();
        return batch;
    }

    /**
     * Free what dice that left the table own on the GPU: their materials (classic, design and
     * model-die materials, labels, liquid) are disposed now; the classic face textures they
     * hold are released after the next batch is built (_releaseRetiredTextures), so dice of the
     * same look reuse them. Nothing shared is disposed: the shared geometry of each die type,
     * the placeholder material, design and label textures (texture-cache.js) and a model's own
     * geometry and textures stay. Only call it once the dice are out of the scene.
     * @private
     */
    _retireDice(dice) {
        for (const d of dice) {
            for (const material of dieMaterials(d)) {
                if (material === PLACEHOLDER_MATERIAL) continue;
                if (material.map && this._classicTextures.owns(material.map)) this._retiredTextures.push(material.map);
                material.dispose();
            }
        }
    }

    /** Drop the retired dice's references to classic textures; a texture no die holds is disposed. @private */
    _releaseRetiredTextures() {
        const textures = this._retiredTextures;
        this._retiredTextures = [];
        for (const texture of textures) this._classicTextures.release(texture);
    }

    /**
     * Predict a throw of `diceConfig`. Hidden prediction dice are built with
     * the same bodies the visible dice will have and thrown with fresh seeds;
     * the live world, those bodies and the dice already on the table are
     * described as plain data (physics-sim.js) and stepped to rest, in a Web
     * Worker when available, recording every step. Any replay still running
     * finishes first, so its dice join the description where they are now.
     * The live world itself is never stepped by a prediction.
     *
     * Resolves with `{ closestIndexes, seeds, recording, recorded, slots }`:
     * `recorded` are the dice already on the table, in recording order, and
     * `slots[cidx]` is the recording index of the cidx-th new die (null for
     * a die that could not be built).
     * @private
     */
    _predict(diceConfig) {
        this._finishReplay();
        const dice = [];
        const seeds = [];
        // One liquid flask per design and type in a throw (models/throw-allowance.js); the
        // visible dice are spawned with the same choice, so each predicts with its own body.
        const allowed = modelDiceAllowance(diceConfig, (d) => this._setFor(d));
        diceConfig.forEach((diceRoll, k) => {
            const repeatCount = diceRoll.dice === 'd100' ? 2 : 1;
            for (let i = 0; i < repeatCount; i++) {
                // Prediction-only dice: never in the scene nor in the live world.
                // The die's design rides along so a model die predicts with its model's hull,
                // the very body the visible die will have.
                const die = createDie(
                    diceRoll.dice, false, i === 0,
                    diceRoll.rolled, null,
                    this.diceMaterial, null, null,
                    diceRoll.diceColor, diceRoll.textColor, diceRoll.backgroundColor,
                    diceRoll.isSecret, null, null,
                    { set: this._setFor(diceRoll), model: allowed[k] }
                );
                const seed = this._generateRandomSeed();
                seeds.push(seed);
                if (!die) {
                    dice.push(null);
                    continue;
                }
                die.isFirst = !(i > 0 && diceRoll.dice === 'd100');
                this._applyDiePhysics(die, seed);
                dice.push(die);
            }
        });

        // Bodies already moving in the world: dice on the table (addDice) and dice reset() is
        // still fading out. With none, the throw is played back from the recording. With any,
        // the visible dice simulate live in the world, exactly as they always did, and the
        // prediction only tells which face lands (see _applyPredictionSideEffects).
        const onTable = this.world.bodies.filter((b) => b.type === CANNON.Body.DYNAMIC);
        const live = onTable.length > 0;
        const added = dice.filter(Boolean).map((d) => d.body);
        const slots = [];
        let next = onTable.length;
        for (const d of dice) slots.push(d ? next++ : null);
        const desc = describeWorld(this.world, {
            added,
            record: [...onTable, ...added],
            watch: added,
        });

        return predict(desc).then((recording) => {
            const last = (recording.steps - 1) * recording.bodies * STATE_SIZE;
            const closestIndexes = dice.map((d, cidx) => {
                if (!d) return null;
                readState(d.body, recording.states, last + slots[cidx] * STATE_SIZE);
                d.mesh.quaternion.copy(d.body.quaternion);
                return getDieValue(d, this.up)[1];
            });
            return { closestIndexes, seeds, recording, slots, live, onTable, recorded: live ? null : [] };
        });
    }

    /**
     * A live throw (dice already moving in the world) starts from the world the old in-world
     * prediction left behind, so the visible dice move exactly as they always did:
     * - dice on the table were put back where they were, but kept the world inertia and the
     *   rest count the prediction's last step gave them;
     * - dice fading out after reset() were not put back: they stay where the prediction
     *   pushed them, at rest;
     * - the collisions those dice took during the prediction played their sounds at once.
     * @private
     */
    _applyPredictionSideEffects(prediction) {
        const { recording, onTable } = prediction;
        const states = recording.states;
        const last = (recording.steps - 1) * recording.bodies * STATE_SIZE;
        const owners = new Map([...this.dice, ...this._fadingDice].map((d) => [d.body, d]));
        const saved = new CANNON.Quaternion();
        onTable.forEach((body, i) => {
            const at = last + i * STATE_SIZE;
            const die = owners.get(body);
            if (die && this.dice.includes(die)) {
                saved.copy(body.quaternion);
                body.quaternion.set(states[at + 3], states[at + 4], states[at + 5], states[at + 6]);
                body.updateInertiaWorld();
                body.quaternion.copy(saved);
                body.restSteps = states[at + 13];
            } else {
                readState(body, states, at);
                body.updateInertiaWorld();
                body.force.setZero();
                body.torque.setZero();
            }
        });
        const events = recording.events;
        for (let e = 0; e < events.length; e += 3) {
            const body = onTable[events[e + 1]];
            const die = body ? owners.get(body) : null;
            if (die && die._lastCollideSound !== undefined) this._playImpact(die, events[e + 2]);
        }
    }

    /**
     * Play a recorded throw: the dice leave the live world and, after every
     * physics step the live world takes (so pacing, substeps and frame timing
     * are what they always were), take their next recorded state and play the
     * collision sounds recorded for that step. `dice[i]` is the die of the
     * recording's i-th body. @private
     */
    _startReplay(recording, dice) {
        this._finishReplay();
        for (const d of dice) {
            if (d && d.body.world) this.world.removeBody(d.body);
        }
        this._replay = { recording, dice, cursor: 0, event: 0 };
        if (recording.steps === 0) this._finishReplay();
    }

    /** One physics step of the replay (the live world's postStep). @private */
    _replayStep() {
        const replay = this._replay;
        if (!replay) return;
        const { recording, dice } = replay;
        const step = replay.cursor++;
        const base = step * recording.bodies * STATE_SIZE;
        for (let i = 0; i < dice.length; i++) {
            if (dice[i]) readState(dice[i].body, recording.states, base + i * STATE_SIZE);
        }
        const events = recording.events;
        while (replay.event < events.length && events[replay.event] === step + 1) {
            const die = dice[events[replay.event + 1]];
            if (die) this._playImpact(die, events[replay.event + 2]);
            replay.event += 3;
        }
        if (replay.cursor >= recording.steps) this._finishReplay();
    }

    /**
     * End the replay: its dice still on the table rejoin the live world, in
     * their recorded order and state, and simulate on from there, exactly as
     * the prediction's world would have. @private
     */
    _finishReplay() {
        const replay = this._replay;
        if (!replay) return;
        this._replay = null;
        for (const d of replay.dice) {
            if (!d || d.body.world || !this.dice.includes(d)) continue;
            // The world inertia the last integration step would have left.
            d.body.updateInertiaWorld();
            d.body.aabbNeedsUpdate = true;
            this.world.addBody(d.body);
        }
    }

    /**
     * Wire up a per-die `collide` listener that plays a randomized impact sound, scaled by
     * the contact's impact velocity and throttled so a settling die doesn't buzz.
     * @private
     */
    _attachCollisionSound(die) {
        die._lastCollideSound = 0;
        die.body.addEventListener('collide', (event) => {
            this._playImpact(die, Math.abs(event.contact.getImpactVelocityAlongNormal()));
        });
    }

    /** The collision sound for one impact of `die` (live, or replayed from a recording). @private */
    _playImpact(die, impact) {
        if (this.soundManager.sounds.length === 0) return;
        const now = performance.now();
        if (now - die._lastCollideSound < COLLIDE_COOLDOWN_MS) return;
        if (impact < COLLIDE_MIN_IMPACT) return;
        die._lastCollideSound = now;
        const vol = Math.min(1, impact / COLLIDE_MAX_IMPACT);
        this.soundManager.play(vol);
    }

    /** @private */
    _generateRandomSeed() {
        return {
            xPos: Math.random(),
            yPos: Math.random(),
            zPos: Math.random(),
            rotAxis: [Math.random(), Math.random(), Math.random()],
            rotAngle: Math.random(),
            vel: [Math.random(), Math.random(), Math.random()],
            angVel: [Math.random(), Math.random(), Math.random()],
        };
    }

    /** @private */
    _isBodySettled(body) {
        return isDieSettled(body);
    }

    /**
     * Apply throw physics (position, orientation, velocity, angular velocity) to a die
     * based on a deterministic seed.
     * @private
     */
    _applyDiePhysics(die, rand) {
        applyThrow(die.body, rand, { aspect: this.width / this.height, throwSpeed: this.throwSpeed, throwSpin: this.throwSpin });
        die.mesh.position.copy(die.body.position);
        die.mesh.quaternion.copy(die.body.quaternion);
    }

    /**
     * Clear all dice from scene/world and drop any unresolved batches.
     * @private
     */
    _clearDice() {
        this._tableEpoch++;
        this._replay = null;
        this.dice.forEach(d => {
            this.scene.remove(d.mesh);
            this.world.removeBody(d.body);
        });
        this._retireDice(this.dice);
        this.dice.length = 0;
        this.diceBatches.length = 0;
        // Tear down any active effects — scene-attached ones (haloRing, particles,
        // fire, trail) need their geometry/materials removed and disposed, otherwise
        // they keep referencing dice that no longer exist.
        for (const effect of this.effects) {
            if (typeof effect.cleanup === 'function') effect.cleanup();
        }
        this.effects.length = 0;
    }

    /**
     * Reset dice with fade animation
     */
    reset() {
        return new Promise((resolve) => {
            // A throw still playing back goes on in the live world while it fades, as it
            // always has; a prediction still running never spawns.
            this._finishReplay();
            this._tableEpoch++;
            const diceToFade = [...this.dice];
            this.dice.length = 0;
            this.diceBatches.length = 0;
            this._fadingDice.push(...diceToFade);

            if (diceToFade.length === 0) {
                if (this.floor) this.floor.material.opacity = 0;
                if (!this.isAnimating && this.renderer) this.renderer.render(this.scene, this.camera);
                resolve();
                return;
            }

            // Keep the loop rendering while the dice fade; it idles again once they are gone.
            this._animationHolds++;
            this._ensureAnimating();

            const fadeDuration = 500;
            const startTime = performance.now();

            const fade = () => {
                const elapsedTime = performance.now() - startTime;
                const progress = Math.min(elapsedTime / fadeDuration, 1);

                const easedProgress = 1 - Math.pow(1 - progress, 3);
                const opacity = 1 - easedProgress;

                if (this.floor) this.floor.material.opacity = 0.5 * (1 - easedProgress);

                diceToFade.forEach(d => {
                    dieMaterials(d).forEach(m => {
                        // Fade from the material's own opacity: glass (0.35) must not pop opaque first.
                        if (m.userData.baseOpacity === undefined) m.userData.baseOpacity = m.opacity;
                        m.transparent = true;
                        m.opacity = m.userData.baseOpacity * opacity;
                    });
                });

                if (progress < 1) {
                    requestAnimationFrame(fade);
                } else {
                    diceToFade.forEach(d => {
                        this.scene.remove(d.mesh);
                        this.world.removeBody(d.body);
                    });
                    this._fadingDice = this._fadingDice.filter((d) => !diceToFade.includes(d));
                    if (!this._destroyed) this._retireDice(diceToFade);
                    this._animationHolds--;
                    resolve();
                }
            };
            fade();
        });
    }

    /**
     * Compute authoritative + visible result for a batch.
     * - authoritative: predetermined target value (what was painted on the die's closestIndex face)
     * - visible: the value reported by `getDieValue` based on the actual settled orientation
     * Variances are emitted when collisions with other live dice rotated the die so a face
     * other than the predetermined one is up.
     * @private
     */
    _computeBatchResults(dice) {
        let total = 0;
        const variances = [];
        const results = [];
        dice.forEach(d => {
            const authoritative = this._authoritativeValue(d);
            const visible = getDieValue(d, this.up, d.targetNumber, d.closestIndex)[0];
            total += authoritative;
            results.push({
                type: d.type,
                value: authoritative,
                visible,
                target: d.targetNumber,
            });
            if (visible !== authoritative) {
                variances.push({ type: d.type, expected: authoritative, visible });
            }
        });
        return { total, variances, results };
    }

    /**
     * Value the die would report if its predetermined face were up — i.e. the
     * server-authoritative result regardless of how the live animation settled.
     * @private
     */
    _authoritativeValue(d) {
        if (d.targetNumber == null) {
            // No target supplied; authoritative === whatever face naturally lands up.
            return getDieValue(d, this.up)[0];
        }
        if (d.type === 'd100') {
            return d.isFirst
                ? d.targetNumber % 10
                : d.targetNumber - (d.targetNumber % 10);
        }
        return d.targetNumber;
    }

    /**
     * True when nothing on the table can change: every die at rest, every batch resolved,
     * no effect running, no roll waiting for assets and no fade in progress. The loop stops
     * then; the canvas keeps its last frame, and roll(), addDice(), playEffect() and reset()
     * start it again. Before this the loop ran for the life of the page.
     * @private
     */
    _shouldIdle() {
        if (this._pendingSetRolls > 0 || this._animationHolds > 0) return false;
        if (this.effects.length > 0) return false;
        if (this.diceBatches.some((b) => !b.resolved && b.dice.length > 0)) return false;
        return this.dice.every((d) => this._isBodySettled(d.body));
    }

    /** @private */
    _ensureAnimating() {
        if (this._destroyed) return;
        if (!this.isAnimating) {
            this.isAnimating = true;
            this.lastTime = undefined;
            this._animate();
        }
    }

    /**
     * Single-phase animation loop. Steps physics, syncs meshes, and checks each pending
     * batch independently — so a batch resolves when its own dice settle, regardless of
     * dice added later.
     * @private
     */
    _animate(time) {
        if (!this.isAnimating) return;

        let dt = 0;
        if (this.lastTime !== undefined) {
            dt = (time - this.lastTime) / 1000;
            // While a prediction runs the table holds still, as it did when the prediction
            // blocked the page; the dice already there are part of it.
            if (this._pendingPredictions === 0) this.world.step(1 / 60, dt, 2);
        }
        this.lastTime = time;

        this.dice.forEach(d => {
            d.mesh.position.copy(d.body.position);
            d.mesh.quaternion.copy(d.body.quaternion);
            // A model die's liquid sloshes with the body's change in velocity (models/liquid.js).
            if (d.liquid) d.liquid.tick(d.body, dt);
        });

        for (const batch of this.diceBatches) {
            if (batch.resolved || batch.dice.length === 0) continue;
            const allSettled = batch.dice.every(d => this._isBodySettled(d.body));
            if (allSettled) {
                batch.resolved = true;
                const result = this._computeBatchResults(batch.dice);
                // Fire effects FIRST (rules + imperative hook) so they're queued before
                // the promise resolves — otherwise user code that fires its own effects
                // from `await` would run a frame behind.
                if (this.effectRules) {
                    runEffectsRules(this.effectRules, batch, result, this);
                }
                if (this.onBatchSettled) {
                    try { this.onBatchSettled(batch, result, this); }
                    catch (e) { console.error('onBatchSettled threw:', e); }
                }
                batch.resolve(result);
            }
        }

        // Tick active effects; drop the ones that finished this frame.
        if (this.effects.length > 0) {
            this.effects = this.effects.filter(e => !e.update());
        }

        // A roll() empties the table and then waits for its prediction: keep the last frame
        // (the previous dice) on screen until the new dice spawn, as when the prediction blocked.
        const holdFrame = this._pendingPredictions > 0 && this.dice.length === 0
            && this.effects.length === 0 && this._animationHolds === 0;
        if (!holdFrame) this.renderer.render(this.scene, this.camera);

        if (this._shouldIdle()) {
            this.isAnimating = false;
            this.animationFrameId = null;
            return;
        }
        this.animationFrameId = requestAnimationFrame(this._animate.bind(this));
    }

    /**
     * Update throw speed
     * @param {number} speed - New throw speed
     */
    setThrowSpeed(speed) {
        this.throwSpeed = speed;
    }

    /**
     * Update throw spin
     * @param {number} spin - New throw spin
     */
    setThrowSpin(spin) {
        this.throwSpin = spin;
    }

    /**
     * Destroy the dice roller instance and clean up resources
     */
    destroy() {
        this._destroyed = true;
        this.isAnimating = false;

        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }

        window.removeEventListener('resize', this._boundResizeHandler);

        this._clearDice();
        this._releaseRetiredTextures();
        this._classicTextures.clear();

        if (this.renderer && this.renderer.domElement && this.renderer.domElement.parentNode) {
            this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }

        if (this.renderer) {
            this.renderer.dispose();
        }
    }
}
