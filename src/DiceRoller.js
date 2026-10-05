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
import { GRAVITY_Y, SOLVER_ITERATIONS, CONTACT, applyThrow, isDieSettled, trackRestSteps } from './physics-config.js';

const DIE_TYPES = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

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
     * The roll() prediction runs in this.world (the live physics world)
     * rather than an isolated temp world: a clone of the dice config is
     * stepped to rest in the live world with the same RNG seeds the
     * visible spawn will use, the resting face is captured, the invisible
     * bodies are removed, and the visible dice are then spawned with the
     * same seeds. Same world + same seeds + same integrator = same
     * trajectory, so the predicted face is the face that lands up.
     * Variances are zero by construction on a plain roll() — this is the
     * v1.1 contract restored.
     *
     * addDice() keeps its temp-world prediction because the live world is
     * occupied by in-flight dice we can't disturb.
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

        // Classic rolls stay synchronous up to the spawn (so isRolling() is true as soon as
        // roll() returns). Only the first roll that uses a set waits for the font and the
        // environment map, a few milliseconds once, and a roll with a model die waits until
        // that model has loaded (or failed), so the prediction and the visible die match.
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
        const { closestIndexes, seeds } = this._preSimulateInLiveWorld(diceConfig);

        return new Promise((resolve) => {
            this._spawnBatch(diceConfig, 'main', closestIndexes, seeds, (result) => {
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
        });
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
        return this._pendingSetRolls > 0 || this.diceBatches.some(b => !b.resolved && b.dice.length > 0);
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
     * Waits for any unresolved batches to settle first, then runs the new
     * batch's prediction in the live world with the existing settled dice
     * present (their state is snapshotted and restored around the
     * prediction so they aren't permanently disturbed). Same world + same
     * seeds + same integrator as the visible spawn that follows = same
     * trajectory, so `variances` is empty by construction — equivalent
     * guarantee to roll() but without wiping the scene.
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

        const { closestIndexes, seeds } = this._preSimulateInLiveWorld(diceConfig);

        return new Promise((resolve) => {
            this._spawnBatch(diceConfig, 'added', closestIndexes, seeds, resolve);
            this._ensureAnimating();
        });
    }

    /**
     * Resolves once every batch currently tracked in `this.diceBatches` is
     * marked resolved (i.e. its dice have all settled and its callback has
     * fired). No-op when the scene is idle. Polls at 50ms — cheap, and the
     * typical wait is ~1-2s while live dice come to rest.
     * @private
     */
    _waitForAllBatchesResolved() {
        if (!this.diceBatches.some(b => !b.resolved)) return Promise.resolve();
        return new Promise((resolve) => {
            const check = () => {
                if (!this.diceBatches.some(b => !b.resolved)) resolve();
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
     * Spawn visible dice into the live world, track as a batch. The caller
     * supplies pre-computed `closestIndexes` (face index each die will land
     * on) and `seeds` (RNG seeds used by `_applyDiePhysics` to reproduce
     * the predicted trajectory).
     * @private
     */
    _spawnBatch(diceConfig, type, closestIndexes, seeds, onResolve) {
        const batchDice = [];
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
                    { set: this._setFor(diceRoll), model: allowed[k] }
                );
                if (!die) { cidx++; continue; }

                die.isFirst = !(i > 0 && diceRoll.dice === 'd100');
                die.closestIndex = closestIndex;
                die.targetNumber = diceRoll.rolled;

                this._applyDiePhysics(die, seeds[cidx]);
                this._attachCollisionSound(die);
                this.dice.push(die);
                batchDice.push(die);

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
        return batch;
    }

    /**
     * Pre-simulate in the LIVE world (this.world). Used by both roll() and
     * addDice(): the visible spawn that follows reuses the same world, the
     * same RNG seeds, and the same integrator, so the predicted face is the
     * face that lands up. Variances are zero by construction.
     *
     * Any dice already in this.dice (e.g. from a prior addDice batch) are
     * snapshotted before the prediction and restored after, so the
     * prediction can collide with them realistically without permanently
     * disturbing their state.
     * @private
     */
    _preSimulateInLiveWorld(diceConfig) {
        // Snapshot existing dice so the prediction's collisions don't
        // permanently move them. Resolved + settled dice will be at rest
        // (addDice waits on _waitForAllBatchesResolved before calling
        // this), so the snapshot captures their final orientation/position
        // and the restore brings them back to it exactly.
        const snapshots = this.dice.map(d => ({
            die: d,
            position: d.body.position.clone(),
            quaternion: d.body.quaternion.clone(),
            velocity: d.body.velocity.clone(),
            angularVelocity: d.body.angularVelocity.clone(),
        }));

        const dice = [];
        const seeds = [];
        // One liquid flask per design and type in a throw (models/throw-allowance.js); the
        // visible dice are spawned with the same choice, so each predicts with its own body.
        const allowed = modelDiceAllowance(diceConfig, (d) => this._setFor(d));
        // Whatever happens below, prediction bodies leave the world and existing dice go back
        // where they were: a die that fails to build must not leave an invisible body behind.
        try {
            diceConfig.forEach((diceRoll, k) => {
                const repeatCount = diceRoll.dice === 'd100' ? 2 : 1;
                for (let i = 0; i < repeatCount; i++) {
                    // Spawn into this.world without adding to the scene — these
                    // are prediction-only bodies; nothing should be rendered.
                    // The die's design rides along so a model die predicts with its model's hull,
                    // the very body the visible die will have.
                    const die = createDie(
                        diceRoll.dice, false, i === 0,
                        diceRoll.rolled, null,
                        this.diceMaterial, null, this.world,
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

            const maxSteps = 5000;
            const minSteps = 60;
            for (let step = 0; step < maxSteps; step++) {
                this.world.step(1 / 60);
                if (step < minSteps) continue;
                const allSettled = dice.every(d => !d || this._isBodySettled(d.body));
                if (allSettled) break;
            }

            const closestIndexes = dice.map(d => {
                if (!d) return null;
                d.mesh.quaternion.copy(d.body.quaternion);
                return getDieValue(d, this.up)[1];
            });
            return { closestIndexes, seeds };
        } finally {
            // Remove the prediction bodies from the world so they don't
            // collide with the visible dice we're about to spawn with the
            // same seeds.
            for (const d of dice) {
                if (d && d.body) this.world.removeBody(d.body);
            }

            // Restore existing dice to their pre-prediction state. They'll
            // experience the same collisions again when the visible new dice
            // are spawned with the same seeds, so they end up in the same
            // final state — preserving determinism for both batches.
            for (const snap of snapshots) {
                snap.die.body.position.copy(snap.position);
                snap.die.body.quaternion.copy(snap.quaternion);
                snap.die.body.velocity.copy(snap.velocity);
                snap.die.body.angularVelocity.copy(snap.angularVelocity);
                snap.die.body.force.setZero();
                snap.die.body.torque.setZero();
            }
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
            if (this.soundManager.sounds.length === 0) return;
            const now = performance.now();
            if (now - die._lastCollideSound < COLLIDE_COOLDOWN_MS) return;
            const impact = Math.abs(event.contact.getImpactVelocityAlongNormal());
            if (impact < COLLIDE_MIN_IMPACT) return;
            die._lastCollideSound = now;
            const vol = Math.min(1, impact / COLLIDE_MAX_IMPACT);
            this.soundManager.play(vol);
        });
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
        this.dice.forEach(d => {
            this.scene.remove(d.mesh);
            this.world.removeBody(d.body);
        });
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
            const diceToFade = [...this.dice];
            this.dice.length = 0;
            this.diceBatches.length = 0;

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
            this.world.step(1 / 60, dt, 2);
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

        this.renderer.render(this.scene, this.camera);

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

        if (this.renderer && this.renderer.domElement && this.renderer.domElement.parentNode) {
            this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }

        if (this.renderer) {
            this.renderer.dispose();
        }
    }
}
