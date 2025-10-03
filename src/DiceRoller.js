import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createDie, getDieValue } from './dice.js';

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
     * @param {Function} [options.onRollComplete] - Callback when dice settle
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

        // Internal state
        this.dice = [];
        this.invisibleDice = [];
        this.randomSeeds = [];
        this.allDiceSettled = false;
        this.found = false;
        this.closestIndexes = [];
        this.lastTime = undefined;
        this.animationFrameId = null;
        this.isAnimating = false;

        // Initialize Three.js scene
        this._initScene();
        
        // Initialize Cannon.js physics
        this._initPhysics();

        // Handle window resize
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

        // Floor
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
        // Remove existing walls
        if (this.walls) {
            this.walls.forEach(wall => this.world.removeBody(wall));
        }
        this.walls = [];

        const wallThickness = 2;
        const wallHeight = 20;
        const wallMaterial = new CANNON.Material('wall');
        
        const leftBound = -frustumSize * aspect / 2;
        const rightBound = frustumSize * aspect / 2;

        // Left Wall
        const leftWall = new CANNON.Body({
            mass: 0,
            shape: new CANNON.Box(new CANNON.Vec3(wallThickness / 2, wallHeight / 2, frustumSize / 2)),
            material: wallMaterial
        });
        leftWall.position.set(leftBound - wallThickness / 2, wallHeight / 2, 0);
        this.world.addBody(leftWall);
        this.walls.push(leftWall);

        // Right Wall
        const rightWall = new CANNON.Body({
            mass: 0,
            shape: new CANNON.Box(new CANNON.Vec3(wallThickness / 2, wallHeight / 2, frustumSize / 2)),
            material: wallMaterial
        });
        rightWall.position.set(rightBound + wallThickness / 2, wallHeight / 2, 0);
        this.world.addBody(rightWall);
        this.walls.push(rightWall);

        // Front Wall
        const frontWall = new CANNON.Body({
            mass: 0,
            shape: new CANNON.Box(new CANNON.Vec3(frustumSize * aspect / 2, wallHeight / 2, wallThickness / 2)),
            material: wallMaterial
        });
        frontWall.position.set(0, wallHeight / 2, topBound + wallThickness / 2);
        this.world.addBody(frontWall);
        this.walls.push(frontWall);

        // Back Wall
        const backWall = new CANNON.Body({
            mass: 0,
            shape: new CANNON.Box(new CANNON.Vec3(frustumSize * aspect / 2, wallHeight / 2, wallThickness / 2)),
            material: wallMaterial
        });
        backWall.position.set(0, wallHeight / 2, bottomBound - wallThickness / 2);
        this.world.addBody(backWall);
        this.walls.push(backWall);
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
     * Roll dice with the given configuration
     * @param {Array<Object>} diceConfig - Array of dice configurations
     * @param {string} diceConfig[].dice - Type of die (d4, d6, d8, d10, d12, d20, d100)
     * @param {number} [diceConfig[].rolled] - Optional target number for the roll
     * @returns {Promise<number>} Promise that resolves with the total roll result
     */
    roll(diceConfig) {
        return new Promise((resolve) => {
            this._lastDiceConfig = diceConfig;
            this._clearDice();
            this.allDiceSettled = false;

            if (this.floor) this.floor.material.opacity = 0.5;

            // Store the resolve callback
            this._rollResolve = resolve;

            if (this.found === false) {
                this.randomSeeds.length = 0;
                diceConfig.forEach((diceRoll) => {
                    const repeatCount = diceRoll.dice === "d100" ? 2 : 1;

                    for (let i = 0; i < repeatCount; i++) {
                        const die = this._createDieInstance(diceRoll.dice, false, i === 0);
                        if (!die) continue;

                        this.invisibleDice.push(die);

                        const rand = {
                            xPos: Math.random(),
                            yPos: Math.random(),
                            zPos: Math.random(),
                            rotAxis: [Math.random(), Math.random(), Math.random()],
                            rotAngle: Math.random(),
                            vel: [Math.random(), Math.random(), Math.random()],
                            angVel: [Math.random(), Math.random(), Math.random()],
                        };
                        this.randomSeeds.push(rand);

                        this._applyDiePhysics(die, rand);
                    }
                });
            } else {
                diceConfig.forEach((diceRoll) => {
                    const repeatCount = diceRoll.dice === "d100" ? 2 : 1;

                    for (let i = 0; i < repeatCount; i++) {
                        const die = this._createDieInstance(
                            diceRoll.dice, true, i === 0,
                            diceRoll.rolled, this.closestIndexes[0]
                        );
                        if (!die) continue;

                        if (i > 0 && diceRoll.dice === 'd100') {
                            die.isFirst = false;
                        } else {
                            die.isFirst = true;
                        }

                        die.closestIndex = this.closestIndexes[0];
                        die.targetNumber = diceRoll.rolled;
                        this.dice.push(die);

                        this.closestIndexes.shift();

                        const rand = this.randomSeeds.shift();
                        this._applyDiePhysics(die, rand);
                    }
                });
            }

            // Start animation if not already running
            if (!this.isAnimating) {
                this.isAnimating = true;
                this._animate();
            }
        });
    }

    /**
     * Create a die instance
     * @private
     */
    _createDieInstance(type, visible, isFirst, targetNumber, foundClosestIndex) {
        const die = createDie(type, visible, isFirst, targetNumber, foundClosestIndex, this.diceMaterial, this.scene, this.world);
        if (!die) return null;

        return die;
    }

    /**
     * Apply physics to a die
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
            new CANNON.Vec3(...rand.rotAxis).unit(),
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
     * Clear all dice from the scene
     * @private
     */
    _clearDice() {
        this.invisibleDice.forEach(d => {
            this.scene.remove(d.mesh);
            this.world.removeBody(d.body);
        });
        this.invisibleDice.length = 0;
        this.dice.forEach(d => {
            this.scene.remove(d.mesh);
            this.world.removeBody(d.body);
        });
        this.dice.length = 0;
    }

    /**
     * Reset dice with fade animation
     */
    reset() {
        return new Promise((resolve) => {
            this.found = false;
            this.closestIndexes.length = 0;
            
            this.invisibleDice.forEach(d => {
                this.scene.remove(d.mesh);
                this.world.removeBody(d.body);
            });
            this.invisibleDice.length = 0;

            const diceToFade = [...this.dice];
            this.dice.length = 0;

            if (diceToFade.length === 0) {
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
     * Get results of current dice roll
     * @private
     */
    _getResults() {
        let total = 0;
        this.dice.forEach((d) => {
            const result = getDieValue(d, this.up, d.targetNumber, d.closestIndex);
            total += result[0];
        });
        this.closestIndexes.length = 0;
        return total;
    }

    /**
     * Get closest indexes for invisible dice
     * @private
     */
    _getResultsClosestIndexes() {
        this.invisibleDice.forEach(d => {
            const result = getDieValue(d, this.up);
            this.closestIndexes.push(result[1]);
        });
    }

    /**
     * Animation loop
     * @private
     */
    _animate(time) {
        if (!this.isAnimating) return;

        this.animationFrameId = requestAnimationFrame(this._animate.bind(this));

        if (this.found === false) {
            if (this.lastTime !== undefined) {
                const speedFactor = 100000;
                const dt = (time - this.lastTime) / 1000 * speedFactor;
                this.world.step(1 / 60, dt, 999999999);
            }
            this.lastTime = time;

            this.invisibleDice.forEach(d => {
                d.mesh.position.copy(d.body.position);
                d.mesh.quaternion.copy(d.body.quaternion);
            });

            let settledCount = 0;
            this.invisibleDice.forEach(d => {
                const isSettled = d.body.velocity.lengthSquared() < 0.01 && 
                                d.body.angularVelocity.lengthSquared() < 0.01;
                if (isSettled) settledCount++;
            });

            if (this.invisibleDice.length > 0 && settledCount === this.invisibleDice.length && !this.allDiceSettled) {
                this._getResultsClosestIndexes();
                this.allDiceSettled = true;
                this.found = true;
                
                // Re-roll with found indexes
                const lastConfig = this._lastDiceConfig;
                if (lastConfig) {
                    this.roll(lastConfig).then(result => {
                        if (this._rollResolve) {
                            this._rollResolve(result);
                            this._rollResolve = null;
                        }
                    });
                }
            }
        } else {
            if (this.lastTime !== undefined) {
                const speedFactor = 1;
                const dt = (time - this.lastTime) / 1000 * speedFactor;
                this.world.step(1 / 60, dt, 2);
            }
            this.lastTime = time;

            this.dice.forEach(d => {
                d.mesh.position.copy(d.body.position);
                d.mesh.quaternion.copy(d.body.quaternion);
            });

            let settledCount = 0;
            this.dice.forEach(d => {
                const isSettled = d.body.velocity.lengthSquared() < 0.01 && 
                                d.body.angularVelocity.lengthSquared() < 0.01;
                if (isSettled) settledCount++;
            });

            if (this.dice.length > 0 && settledCount === this.dice.length && !this.allDiceSettled) {
                this.allDiceSettled = true;
                const total = this._getResults();
                this.found = false;
                
                if (this.onRollComplete) {
                    this.onRollComplete(total);
                }
                
                if (this._rollResolve) {
                    this._rollResolve(total);
                    this._rollResolve = null;
                }
            }
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

