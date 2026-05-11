import * as THREE from 'three';

/**
 * Splat effects — drip particles fly off the tumbling die, hit the floor, and leave
 * persistent floor decals that slowly shrink and fade. Acid splats additionally emit a
 * slow stream of smoke wisps from each puddle while it's alive, like the floor is
 * being eaten.
 *
 * Two factories share the underlying machinery via `createSplatEffect`:
 *   - `bloodSplat()` — deep red drips, no smoke
 *   - `acidSplat()`  — bright green drips + sickly smoke
 *
 * Both attach via the dice config:
 *   roll([{ dice: 'd20', effects: [bloodSplat()] }])
 *
 * Drips bleed off as long as the die is moving. Splats persist for several seconds
 * after the die settles, then fade. The effect completes when every drip has landed,
 * every splat has faded, and any smoke from those splats has dispersed.
 */

const SPLAT_VARIANTS = 8;
let splatTexturePool = null;
let smokeTextureCache = null;
let sharedPlaneGeo = null;
let sharedDripGeo = null;

function getSharedPlaneGeometry() {
    if (!sharedPlaneGeo) sharedPlaneGeo = new THREE.PlaneGeometry(1, 1);
    return sharedPlaneGeo;
}
function getSharedDripGeometry(size) {
    if (!sharedDripGeo) sharedDripGeo = new THREE.SphereGeometry(size, 6, 6);
    return sharedDripGeo;
}

/**
 * Build one organic splat texture: a central irregular blob plus satellite droplets and
 * a few thin "spray" specks at varying distances. White on transparent so any tint can
 * be applied via the material's color.
 */
function buildSplatTexture() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const cx = size / 2;
    ctx.fillStyle = 'white';

    // Main body — 3-4 overlapping ellipses offset around the center.
    const lobes = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < lobes; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = (i === 0 ? 0 : 0.04 + Math.random() * 0.1) * size;
        const rx = (0.16 + Math.random() * 0.14) * size;
        const ry = (0.16 + Math.random() * 0.14) * size;
        const rot = Math.random() * Math.PI;
        ctx.beginPath();
        ctx.ellipse(cx + Math.cos(angle) * dist, cx + Math.sin(angle) * dist, rx, ry, rot, 0, Math.PI * 2);
        ctx.fill();
    }

    // Mid-range satellite droplets — clearly separated from the main blob.
    const drops = 6 + Math.floor(Math.random() * 8);
    for (let i = 0; i < drops; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = (0.22 + Math.random() * 0.18) * size;
        const r = (0.015 + Math.random() * 0.055) * size;
        ctx.beginPath();
        ctx.ellipse(cx + Math.cos(angle) * dist, cx + Math.sin(angle) * dist, r, r * (0.7 + Math.random() * 0.6), 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // Tiny far-flung specks for the spray look.
    const specks = 10 + Math.floor(Math.random() * 14);
    for (let i = 0; i < specks; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = (0.32 + Math.random() * 0.14) * size;
        const r = (0.005 + Math.random() * 0.018) * size;
        ctx.beginPath();
        ctx.ellipse(cx + Math.cos(angle) * dist, cx + Math.sin(angle) * dist, r, r, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
}

function getSplatTextureVariant() {
    if (!splatTexturePool) {
        splatTexturePool = [];
        for (let i = 0; i < SPLAT_VARIANTS; i++) splatTexturePool.push(buildSplatTexture());
    }
    return splatTexturePool[Math.floor(Math.random() * splatTexturePool.length)];
}

function getSmokeTexture() {
    if (smokeTextureCache) return smokeTextureCache;
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const cx = size / 2;
    const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
    g.addColorStop(0.00, 'rgba(255, 255, 255, 1.0)');
    g.addColorStop(0.45, 'rgba(220, 220, 220, 0.5)');
    g.addColorStop(1.00, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    smokeTextureCache = new THREE.CanvasTexture(canvas);
    smokeTextureCache.minFilter = THREE.LinearFilter;
    smokeTextureCache.needsUpdate = true;
    return smokeTextureCache;
}

function createSplatEffect(config) {
    const {
        color,
        smokeColor = null,                  // null disables smoke entirely
        emissionRate = 28,
        dripSize = 0.11,
        dripGravity = 14,
        dripEjectionSpeed = 1.6,
        splatBaseSize = 0.85,
        splatLifetime = 5500,
        smokeRatePerSplat = 3.5,
        smokeLifetime = 1300,
        smokeSize = 0.55,
        floorY = 0.05,                      // dripping particle is considered "landed" below this
    } = config;

    return {
        scope: 'die',
        create({ die, roller }) {
            const scene = roller.scene;
            const dripGroup = new THREE.Group();
            const splatGroup = new THREE.Group();
            const smokeGroup = new THREE.Group();
            scene.add(dripGroup, splatGroup, smokeGroup);

            const dripGeometry = getSharedDripGeometry(dripSize);
            const splatGeometry = getSharedPlaneGeometry();
            const smokeTexture = smokeColor != null ? getSmokeTexture() : null;

            const drips = [];
            const splats = [];
            const smokes = [];

            let lastTime = performance.now();
            let dripAccumulator = 0;
            let emitting = true;
            let killed = false;

            function spawnDrip() {
                const material = new THREE.MeshBasicMaterial({
                    color, transparent: true, opacity: 0.95, depthWrite: false,
                });
                const mesh = new THREE.Mesh(dripGeometry, material);
                mesh.position.copy(die.body.position);
                mesh.position.x += (Math.random() - 0.5) * 0.35;
                mesh.position.z += (Math.random() - 0.5) * 0.35;
                // Eject mostly outward in the XZ plane, with a small upward kick so a few
                // drips lift before falling. Most splash sideways.
                drips.push({
                    mesh, material,
                    vx: (Math.random() - 0.5) * 2 * dripEjectionSpeed,
                    vy: 0.5 + Math.random() * dripEjectionSpeed,
                    vz: (Math.random() - 0.5) * 2 * dripEjectionSpeed,
                });
                dripGroup.add(mesh);
            }

            function spawnSplat(x, z) {
                const material = new THREE.MeshBasicMaterial({
                    map: getSplatTextureVariant(),
                    color, transparent: true, opacity: 0.1,
                    depthWrite: false,
                });
                const baseSize = splatBaseSize * (0.55 + Math.random() * 0.85);
                const mesh = new THREE.Mesh(splatGeometry, material);
                // Lift slightly off the floor (which sits at y = -0.05) so the decal
                // renders cleanly without z-fighting.
                mesh.position.set(x, 0.02, z);
                mesh.rotation.x = -Math.PI / 2;
                mesh.rotation.z = Math.random() * Math.PI * 2;
                mesh.scale.setScalar(baseSize * 0.3);   // starts small, splashes outward
                splatGroup.add(mesh);
                splats.push({
                    mesh, material, baseSize,
                    age: 0,
                    nextSmokeIn: smokeColor != null
                        ? Math.random() * (1 / smokeRatePerSplat)
                        : null,
                });
            }

            function spawnSmoke(x, z) {
                const material = new THREE.SpriteMaterial({
                    map: smokeTexture, color: smokeColor,
                    transparent: true, opacity: 0,
                    blending: THREE.NormalBlending,
                    depthWrite: false,
                });
                const sprite = new THREE.Sprite(material);
                sprite.position.set(
                    x + (Math.random() - 0.5) * 0.25,
                    0.15,
                    z + (Math.random() - 0.5) * 0.25,
                );
                const baseScale = smokeSize * (0.6 + Math.random() * 0.6);
                sprite.scale.setScalar(baseScale);
                smokeGroup.add(sprite);
                smokes.push({
                    sprite, material, baseScale,
                    age: 0,
                    vy: 0.6 + Math.random() * 0.5,
                    wobbleSeed: Math.random() * Math.PI * 2,
                });
            }

            function disposeAll() {
                for (const d of drips) d.material.dispose();
                for (const s of splats) s.material.dispose();
                for (const sm of smokes) sm.material.dispose();
                drips.length = splats.length = smokes.length = 0;
                scene.remove(dripGroup);
                scene.remove(splatGroup);
                scene.remove(smokeGroup);
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
                        dripAccumulator += dt * emissionRate;
                        while (dripAccumulator >= 1) {
                            spawnDrip();
                            dripAccumulator -= 1;
                        }
                    }

                    // Drips: ballistic with gravity; land when they reach the floor.
                    for (let i = drips.length - 1; i >= 0; i--) {
                        const d = drips[i];
                        d.mesh.position.x += d.vx * dt;
                        d.mesh.position.y += d.vy * dt;
                        d.mesh.position.z += d.vz * dt;
                        d.vy -= dripGravity * dt;
                        if (d.mesh.position.y <= floorY) {
                            spawnSplat(d.mesh.position.x, d.mesh.position.z);
                            dripGroup.remove(d.mesh);
                            d.material.dispose();
                            drips.splice(i, 1);
                        }
                    }

                    // Splats: short splash-in, long hold, fade out near end of life.
                    for (let i = splats.length - 1; i >= 0; i--) {
                        const s = splats[i];
                        s.age += dt * 1000;
                        if (s.age >= splatLifetime) {
                            splatGroup.remove(s.mesh);
                            s.material.dispose();
                            splats.splice(i, 1);
                            continue;
                        }
                        const lifeT = s.age / splatLifetime;
                        if (s.age < 120) {
                            // Splash phase — scale out and ramp up opacity.
                            const u = s.age / 120;
                            const eased = 1 - Math.pow(1 - u, 3);
                            s.mesh.scale.setScalar(s.baseSize * (0.3 + 0.7 * eased));
                            s.material.opacity = 0.9 * eased;
                        } else if (lifeT > 0.75) {
                            // Fade out in the last 25% of life. Slight extra shrinkage.
                            const fadeT = (lifeT - 0.75) / 0.25;
                            s.material.opacity = 0.9 * (1 - fadeT);
                            s.mesh.scale.setScalar(s.baseSize * (1 - fadeT * 0.2));
                        } else {
                            s.material.opacity = 0.9;
                            s.mesh.scale.setScalar(s.baseSize);
                        }

                        // Emit smoke from acid splats at random-ish intervals.
                        if (smokeColor != null && s.nextSmokeIn != null) {
                            s.nextSmokeIn -= dt;
                            if (s.nextSmokeIn <= 0 && lifeT < 0.85) {
                                spawnSmoke(s.mesh.position.x, s.mesh.position.z);
                                s.nextSmokeIn = (0.5 + Math.random()) / smokeRatePerSplat;
                            }
                        }
                    }

                    // Smoke: rises with wobble, grows, fades.
                    const tNow = now / 1000;
                    for (let i = smokes.length - 1; i >= 0; i--) {
                        const sm = smokes[i];
                        sm.age += dt * 1000;
                        if (sm.age >= smokeLifetime) {
                            smokeGroup.remove(sm.sprite);
                            sm.material.dispose();
                            smokes.splice(i, 1);
                            continue;
                        }
                        const lifeT = sm.age / smokeLifetime;
                        sm.sprite.position.y += sm.vy * dt;
                        sm.sprite.position.x += Math.sin(tNow * 2 + sm.wobbleSeed) * 0.15 * dt;
                        sm.sprite.position.z += Math.cos(tNow * 2 + sm.wobbleSeed * 1.3) * 0.15 * dt;
                        sm.sprite.scale.setScalar(sm.baseScale * (1 + lifeT * 1.6));
                        sm.material.opacity = lifeT < 0.2
                            ? (lifeT / 0.2) * 0.55
                            : (1 - lifeT) * 0.55;
                    }

                    if (!emitting && drips.length === 0 && splats.length === 0 && smokes.length === 0) {
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

/**
 * Bleed effect: deep red drips fly off the rolling die and leave irregular blood
 * splats wherever they hit the floor. Splats fade after a few seconds.
 *
 * @param {Object} [options]  See `createSplatEffect` for tunables (passed through).
 */
export function bloodSplat(options = {}) {
    return createSplatEffect({
        color: 0x8b0000,
        emissionRate: 26,
        dripSize: 0.11,
        dripEjectionSpeed: 1.7,
        splatBaseSize: 0.85,
        splatLifetime: 5500,
        ...options,
    });
}

/**
 * Acid effect: bright green drips that leave caustic puddles. Each puddle slowly
 * fizzes off pale-green smoke wisps until it dissipates.
 *
 * @param {Object} [options]  See `createSplatEffect` for tunables.
 */
export function acidSplat(options = {}) {
    return createSplatEffect({
        color: 0x9bcc00,
        smokeColor: 0xaecf8e,
        emissionRate: 22,
        dripSize: 0.1,
        dripEjectionSpeed: 1.6,
        splatBaseSize: 0.8,
        splatLifetime: 6500,
        smokeRatePerSplat: 3.2,
        smokeLifetime: 1300,
        smokeSize: 0.55,
        ...options,
    });
}
