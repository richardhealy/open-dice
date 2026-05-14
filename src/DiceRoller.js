import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createDie, getDieValue } from './dice.js';
import { DecalRegistry } from './decal-registry.js';
import { SoundManager } from './sound-manager.js';
import { glow, scalePulse, haloRing, runEffectsRules } from './effects/index.js';

// Collisions below this impact speed are too quiet to be audible without distortion.
// Above ~12 the cap kicks in.
const COLLIDE_MIN_IMPACT = 1.5;
const COLLIDE_MAX_IMPACT = 12;
// Throttle per die — without this, dice rolling against the floor trigger dozens of
// micro-contacts per second and the playback becomes a buzz instead of distinct clacks.
const COLLIDE_COOLDOWN_MS = 60;

const SETTLED_THRESHOLD = 0.01;

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
        this.onRollComplete = options.onRollComplete || null;
        // Fires once per batch as it settles, with the same {total, variances, results}
        // object plus a reference to the batch dice. Lets callers schedule per-die effects
        // (e.g. glow on a crit) without polling the engine.
        this.onBatchSettled = options.onBatchSettled || null;
        // Declarative rules: `[{ match, play }, ...]`. Evaluated against each per-die result
        // when a batch settles; matching effects are scheduled onto `this.effects`.
        this.effectRules = options.effects || null;
        this.effects = [];

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
        this.renderer.setSize(this.width, this.height);
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
        this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -50, 0) });
        this.world.broadphase = new CANNON.NaiveBroadphase();
        this.world.solver.iterations = 30;

        this.diceMaterial = new CANNON.Material('dice');
        const floorPhysicsMaterial = new CANNON.Material('floor');

        this.world.addContactMaterial(new CANNON.ContactMaterial(
            this.diceMaterial, floorPhysicsMaterial,
            { friction: 0.2, restitution: 0.4 }
        ));
        this.world.addContactMaterial(new CANNON.ContactMaterial(
            this.diceMaterial, this.diceMaterial,
            { friction: 0.1, restitution: 0.5 }
        ));
        this.world.addContactMaterial(new CANNON.ContactMaterial(
            this.diceMaterial, new CANNON.Material('wall'),
            { friction: 0.1, restitution: 0.8 }
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

        this.renderer.setSize(this.width, this.height);
        this._updatePhysicsWalls(frustumSize, aspect, topBound, bottomBound);
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
        return this.diceBatches.some(b => !b.resolved && b.dice.length > 0);
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
        diceConfig.forEach((diceRoll) => {
            const repeatCount = diceRoll.dice === 'd100' ? 2 : 1;
            for (let i = 0; i < repeatCount; i++) {
                const closestIndex = closestIndexes[cidx];
                const die = createDie(
                    diceRoll.dice, true, i === 0,
                    diceRoll.rolled, closestIndex,
                    this.diceMaterial, this.scene, this.world,
                    diceRoll.diceColor, diceRoll.textColor, diceRoll.backgroundColor,
                    diceRoll.isSecret, diceRoll.decals, this.decalRegistry
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
        diceConfig.forEach((diceRoll) => {
            const repeatCount = diceRoll.dice === 'd100' ? 2 : 1;
            for (let i = 0; i < repeatCount; i++) {
                // Spawn into this.world without adding to the scene — these
                // are prediction-only bodies; nothing should be rendered.
                const die = createDie(
                    diceRoll.dice, false, i === 0,
                    diceRoll.rolled, null,
                    this.diceMaterial, null, this.world,
                    diceRoll.diceColor, diceRoll.textColor, diceRoll.backgroundColor,
                    diceRoll.isSecret
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

        return { closestIndexes, seeds };
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
        return body.velocity.lengthSquared() < SETTLED_THRESHOLD &&
               body.angularVelocity.lengthSquared() < SETTLED_THRESHOLD;
    }

    /**
     * Apply throw physics (position, orientation, velocity, angular velocity) to a die
     * based on a deterministic seed.
     * @private
     */
    _applyDiePhysics(die, rand) {
        const margin = 2;
        const frustumSize = 18;
        const aspect = this.width / this.height;
        const leftBound = -frustumSize * aspect / 2;

        const xPos = leftBound + margin + (rand.xPos * 4);
        const yPos = 4 + rand.yPos * 4;
        const zPos = (rand.zPos - 0.5) * (frustumSize * 0.9);
        die.body.position.set(xPos, yPos, zPos);
        die.mesh.position.copy(die.body.position);

        die.body.quaternion.setFromAxisAngle(
            new CANNON.Vec3(rand.rotAxis[0], rand.rotAxis[1], rand.rotAxis[2]).unit(),
            rand.rotAngle * Math.PI * 2
        );
        die.mesh.quaternion.copy(die.body.quaternion);

        die.body.velocity.set(
            (0.8 + 0.8 * rand.vel[0]) * this.throwSpeed,
            (rand.vel[1] * 0.2) * this.throwSpeed * 0.5,
            (rand.vel[2] - 0.5) * this.throwSpeed
        );

        die.body.angularVelocity.set(
            (rand.angVel[0] - 0.5) * this.throwSpin * 1.5,
            (rand.angVel[1] - 0.5) * this.throwSpin * 1.5,
            (rand.angVel[2] - 0.5) * this.throwSpin * 1.5
        );
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
                resolve();
                return;
            }

            const fadeDuration = 500;
            const startTime = performance.now();

            const fade = () => {
                const elapsedTime = performance.now() - startTime;
                const progress = Math.min(elapsedTime / fadeDuration, 1);

                const easedProgress = 1 - Math.pow(1 - progress, 3);
                const opacity = 1 - easedProgress;

                if (this.floor) this.floor.material.opacity = 0.5 * (1 - easedProgress);

                diceToFade.forEach(d => {
                    if (Array.isArray(d.mesh.material)) {
                        d.mesh.material.forEach(m => {
                            m.transparent = true;
                            m.opacity = opacity;
                        });
                    } else {
                        d.mesh.material.transparent = true;
                        d.mesh.material.opacity = opacity;
                    }
                });

                if (progress < 1) {
                    requestAnimationFrame(fade);
                } else {
                    diceToFade.forEach(d => {
                        this.scene.remove(d.mesh);
                        this.world.removeBody(d.body);
                    });
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

    /** @private */
    _ensureAnimating() {
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

        this.animationFrameId = requestAnimationFrame(this._animate.bind(this));

        if (this.lastTime !== undefined) {
            const dt = (time - this.lastTime) / 1000;
            this.world.step(1 / 60, dt, 2);
        }
        this.lastTime = time;

        this.dice.forEach(d => {
            d.mesh.position.copy(d.body.position);
            d.mesh.quaternion.copy(d.body.quaternion);
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
