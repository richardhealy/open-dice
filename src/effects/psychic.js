import * as THREE from 'three';

/**
 * Psychic effect: ethereal glow orbs drift outward from the die in slow spiral paths,
 * and expanding concentric rings pulse outward at intervals — a "thought-wave" feel.
 * Multi-color (purples, pinks, pale cyans) drawn from a configurable palette so the
 * whole effect shifts in tone over time.
 *
 * Distinct from fire/blood by:
 *   - No floor decals — psychic energy doesn't touch the ground.
 *   - Orbs follow sinusoidal spiral paths, not ballistic trajectories.
 *   - Concentric rings (flat tori) expand outward from the die position, fading as they
 *     grow — a sonar-ping look.
 *   - Color palette rotation, so successive particles read as a shifting energy field.
 *
 * @param {Object}    [options]
 * @param {number[]}  [options.palette]            Hex array; each particle picks one at spawn.
 * @param {number}    [options.orbRate=16]
 * @param {number}    [options.orbSize=0.5]
 * @param {number}    [options.orbLifetime=1700]
 * @param {number}    [options.ringRate=2.2]       Rings per second.
 * @param {number}    [options.ringLifetime=1300]
 * @param {number}    [options.ringStartRadius=0.6]
 * @param {number}    [options.ringEndRadius=2.8]
 * @param {number}    [options.spiralStrength=0.5] Strength of the orbital wobble.
 */

let orbTextureCache = null;
let ringGeometryCache = null;

function getOrbTexture() {
    if (orbTextureCache) return orbTextureCache;
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const cx = size / 2;
    const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
    g.addColorStop(0.00, 'rgba(255, 255, 255, 1.0)');
    g.addColorStop(0.30, 'rgba(225, 195, 255, 0.65)');
    g.addColorStop(0.65, 'rgba(160, 100, 230, 0.22)');
    g.addColorStop(1.00, 'rgba(80, 30, 150, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    orbTextureCache = new THREE.CanvasTexture(canvas);
    orbTextureCache.minFilter = THREE.LinearFilter;
    orbTextureCache.needsUpdate = true;
    return orbTextureCache;
}

function getRingGeometry() {
    if (ringGeometryCache) return ringGeometryCache;
    // Torus radius = 1 so we can scale uniformly per ring; thin tube.
    ringGeometryCache = new THREE.TorusGeometry(1, 0.04, 6, 48);
    return ringGeometryCache;
}

export function psychic(options = {}) {
    const {
        palette = [0xc6a0ff, 0xff8fd6, 0x80e6ff, 0xe0c0ff, 0xffaef0],
        orbRate = 16,
        orbSize = 0.5,
        orbLifetime = 1700,
        ringRate = 2.2,
        ringLifetime = 1300,
        ringStartRadius = 0.6,
        ringEndRadius = 2.8,
        spiralStrength = 0.5,
    } = options;

    return {
        scope: 'die',
        create({ die, roller }) {
            const scene = roller.scene;
            const orbGroup = new THREE.Group();
            const ringGroup = new THREE.Group();
            scene.add(orbGroup, ringGroup);
            const orbTexture = getOrbTexture();
            const ringGeometry = getRingGeometry();

            const orbs = [];
            const rings = [];

            let lastTime = performance.now();
            let oAcc = 0, rAcc = 0;
            let emitting = true;
            let killed = false;

            function pickColor() {
                return palette[Math.floor(Math.random() * palette.length)];
            }

            function spawnOrb() {
                const material = new THREE.SpriteMaterial({
                    map: orbTexture, color: pickColor(),
                    transparent: true, opacity: 0,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                });
                const sprite = new THREE.Sprite(material);
                sprite.position.copy(die.body.position);
                sprite.position.x += (Math.random() - 0.5) * 0.4;
                sprite.position.z += (Math.random() - 0.5) * 0.4;
                sprite.position.y += 0.2;
                const baseSize = orbSize * (0.55 + Math.random() * 0.85);
                sprite.scale.setScalar(baseSize);
                orbs.push({
                    sprite, material, baseSize,
                    age: 0,
                    // Slow base drift + a per-particle orbital phase that drives spiraling.
                    vx: (Math.random() - 0.5) * 0.6,
                    vy: 0.25 + Math.random() * 0.5,
                    vz: (Math.random() - 0.5) * 0.6,
                    spinPhase: Math.random() * Math.PI * 2,
                    spinRate: 1.5 + Math.random() * 1.5,
                });
                orbGroup.add(sprite);
            }

            function spawnRing() {
                const material = new THREE.MeshBasicMaterial({
                    color: pickColor(),
                    transparent: true, opacity: 0.85,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                });
                const mesh = new THREE.Mesh(ringGeometry, material);
                mesh.position.copy(die.body.position);
                mesh.rotation.x = Math.PI / 2;
                mesh.scale.setScalar(ringStartRadius);
                ringGroup.add(mesh);
                rings.push({ mesh, material, age: 0 });
            }

            function disposeAll() {
                for (const o of orbs) o.material.dispose();
                for (const r of rings) r.material.dispose();
                orbs.length = rings.length = 0;
                scene.remove(orbGroup);
                scene.remove(ringGroup);
            }

            return {
                update() {
                    if (killed) return true;
                    const now = performance.now();
                    const dt = (now - lastTime) / 1000;
                    lastTime = now;

                    if (emitting) {
                        const moving = die.body.velocity.lengthSquared() > 0.01
                                    || die.body.angularVelocity.lengthSquared() > 0.01;
                        if (!moving) emitting = false;
                    }
                    if (emitting) {
                        oAcc += dt * orbRate;
                        rAcc += dt * ringRate;
                        while (oAcc >= 1) { spawnOrb(); oAcc -= 1; }
                        while (rAcc >= 1) { spawnRing(); rAcc -= 1; }
                    }

                    const tNow = now / 1000;
                    for (let i = orbs.length - 1; i >= 0; i--) {
                        const o = orbs[i];
                        o.age += dt * 1000;
                        if (o.age >= orbLifetime) {
                            orbGroup.remove(o.sprite);
                            o.material.dispose();
                            orbs.splice(i, 1);
                            continue;
                        }
                        // Spiral motion: base drift + sinusoidal orbital component.
                        const spiralX = Math.sin(tNow * o.spinRate + o.spinPhase) * spiralStrength;
                        const spiralZ = Math.cos(tNow * o.spinRate + o.spinPhase) * spiralStrength;
                        o.sprite.position.x += (o.vx + spiralX) * dt;
                        o.sprite.position.y += o.vy * dt;
                        o.sprite.position.z += (o.vz + spiralZ) * dt;
                        const lifeT = o.age / orbLifetime;
                        // Pulse the size + fade in/out.
                        const pulse = 1 + Math.sin(lifeT * Math.PI * 2.5) * 0.25;
                        o.sprite.scale.setScalar(o.baseSize * pulse);
                        o.material.opacity = lifeT < 0.18
                            ? lifeT / 0.18 * 0.95
                            : (1 - lifeT) * 0.95 / 0.82;
                    }

                    for (let i = rings.length - 1; i >= 0; i--) {
                        const r = rings[i];
                        r.age += dt * 1000;
                        if (r.age >= ringLifetime) {
                            ringGroup.remove(r.mesh);
                            r.material.dispose();
                            rings.splice(i, 1);
                            continue;
                        }
                        const lifeT = r.age / ringLifetime;
                        const eased = 1 - Math.pow(1 - lifeT, 3);
                        const radius = ringStartRadius + (ringEndRadius - ringStartRadius) * eased;
                        r.mesh.scale.setScalar(radius);
                        r.material.opacity = 0.85 * (1 - eased);
                    }

                    if (!emitting && orbs.length === 0 && rings.length === 0) {
                        disposeAll();
                        return true;
                    }
                    return false;
                },
                cleanup() {
                    if (killed) return;
                    killed = true;
                    disposeAll();
                },
            };
        }
    };
}
