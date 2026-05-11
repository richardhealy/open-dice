import * as THREE from 'three';

/**
 * Thunder effect: heavy concussive shockwave rings expand outward across the floor from
 * the die, with warm-toned dust particles kicked up and slowly settling. Different from
 * psychic's airy rings — slower emission, thicker tubes, weighter palette, and dust
 * grounded in the floor plane to sell the concussive feel.
 *
 * Two streams:
 *   - Shockwaves: flat torus meshes laid horizontal on the floor, scaling rapidly from
 *     a small ring to a large one over ~750ms while fading.
 *   - Dust: small soft sprites near the die's position that drift upward briefly and
 *     fade. Tinted earthy-brown so the effect reads as concussive impact.
 *
 * No camera shake — that's a separate composable effect (`screenShake`). For cross-die
 * arcs between settled dice, see the `electric` effect.
 */

let dustTextureCache = null;
let sharedRingGeometry = null;

function buildDustTexture() {
    const size = 96;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const cx = size / 2;
    const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
    g.addColorStop(0.00, 'rgba(255, 255, 255, 1.0)');
    g.addColorStop(0.50, 'rgba(220, 220, 220, 0.45)');
    g.addColorStop(1.00, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
}

function getDustTexture() {
    if (!dustTextureCache) dustTextureCache = buildDustTexture();
    return dustTextureCache;
}

function getSharedRingGeometry() {
    if (!sharedRingGeometry) sharedRingGeometry = new THREE.TorusGeometry(1, 0.08, 8, 56);
    return sharedRingGeometry;
}

/**
 * @param {Object} [options]
 * @param {number} [options.ringColor=0xf5c87d]
 * @param {number} [options.dustColor=0xc8a878]
 * @param {number} [options.ringRate=1.6]            Rings per second (slow, heavy).
 * @param {number} [options.ringLifetime=750]
 * @param {number} [options.ringStartRadius=0.5]
 * @param {number} [options.ringEndRadius=3.4]
 * @param {number} [options.dustRate=22]
 * @param {number} [options.dustLifetime=950]
 * @param {number} [options.dustSize=0.45]
 */
export function thunder(options = {}) {
    const {
        ringColor = 0xf5c87d,
        dustColor = 0xc8a878,
        ringRate = 1.6,
        ringLifetime = 750,
        ringStartRadius = 0.5,
        ringEndRadius = 3.4,
        dustRate = 22,
        dustLifetime = 950,
        dustSize = 0.45,
    } = options;

    return {
        scope: 'die',
        create({ die, roller }) {
            const scene = roller.scene;
            const ringGroup = new THREE.Group();
            const dustGroup = new THREE.Group();
            scene.add(ringGroup, dustGroup);
            const ringGeometry = getSharedRingGeometry();
            const dustTexture = getDustTexture();

            const rings = [];
            const dusts = [];

            let lastTime = performance.now();
            let rAcc = 0, dAcc = 0;
            let emitting = true;
            let killed = false;

            function spawnRing() {
                const material = new THREE.MeshBasicMaterial({
                    color: ringColor,
                    transparent: true, opacity: 0.95,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                });
                const mesh = new THREE.Mesh(ringGeometry, material);
                mesh.position.set(die.body.position.x, 0.04, die.body.position.z);
                mesh.rotation.x = Math.PI / 2;
                mesh.scale.setScalar(ringStartRadius);
                ringGroup.add(mesh);
                rings.push({ mesh, material, age: 0 });
            }

            function spawnDust() {
                const material = new THREE.SpriteMaterial({
                    map: dustTexture, color: dustColor,
                    transparent: true, opacity: 0,
                    blending: THREE.NormalBlending,
                    depthWrite: false,
                });
                const sprite = new THREE.Sprite(material);
                sprite.position.copy(die.body.position);
                sprite.position.x += (Math.random() - 0.5) * 0.6;
                sprite.position.z += (Math.random() - 0.5) * 0.6;
                sprite.position.y = 0.1 + Math.random() * 0.2;
                const baseSize = dustSize * (0.6 + Math.random() * 0.8);
                sprite.scale.setScalar(baseSize);
                dusts.push({
                    sprite, material, baseSize,
                    age: 0,
                    vy: 0.3 + Math.random() * 0.5,
                    vx: (Math.random() - 0.5) * 0.4,
                    vz: (Math.random() - 0.5) * 0.4,
                });
                dustGroup.add(sprite);
            }

            function disposeAll() {
                for (const r of rings) r.material.dispose();
                for (const d of dusts) d.material.dispose();
                rings.length = dusts.length = 0;
                scene.remove(ringGroup);
                scene.remove(dustGroup);
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
                        rAcc += dt * ringRate;
                        dAcc += dt * dustRate;
                        while (rAcc >= 1) { spawnRing(); rAcc -= 1; }
                        while (dAcc >= 1) { spawnDust(); dAcc -= 1; }
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
                        r.material.opacity = 0.95 * (1 - eased);
                    }

                    for (let i = dusts.length - 1; i >= 0; i--) {
                        const d = dusts[i];
                        d.age += dt * 1000;
                        if (d.age >= dustLifetime) {
                            dustGroup.remove(d.sprite);
                            d.material.dispose();
                            dusts.splice(i, 1);
                            continue;
                        }
                        d.sprite.position.x += d.vx * dt;
                        d.sprite.position.y += d.vy * dt;
                        d.sprite.position.z += d.vz * dt;
                        d.vy *= 1 - dt * 0.8;
                        d.vx *= 1 - dt * 0.5;
                        d.vz *= 1 - dt * 0.5;
                        const lifeT = d.age / dustLifetime;
                        d.sprite.scale.setScalar(d.baseSize * (1 + lifeT * 0.8));
                        d.material.opacity = lifeT < 0.15
                            ? (lifeT / 0.15) * 0.55
                            : (1 - lifeT) * 0.55;
                    }

                    if (!emitting && rings.length === 0 && dusts.length === 0) {
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
