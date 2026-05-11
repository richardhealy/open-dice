import * as THREE from 'three';

/**
 * Necrotic effect: curving dark waveforms snake inward toward the die from the surrounding
 * space, accelerating as they close, while small bright "soul" motes drift in alongside
 * them. When a wave's head reaches the die it's consumed — the die is draining energy
 * from the air around it.
 *
 * The waves are the centerpiece. Each one is a moving "head" that walks toward the die
 * with a sinusoidal perpendicular wobble; behind the head, a trailing line geometry
 * traces the head's recent positions, so the visible line naturally curves wherever the
 * head curved. The result reads as a sine-wave of dark energy being pulled in.
 *
 * Souls are simple: small soft glow sprites drifting straight inward with a slight
 * tangential wobble. No face/skull texture — they're just abstract motes.
 *
 * Two implementation notes:
 *   - Wave lines use additive blending with a saturated purple. Pure dark colors are
 *     invisible against the dark scene; saturated mid-tone purples tint the background
 *     to read as "necromantic" while still being visible.
 *   - Each wave's trail starts as N copies of the spawn point, so initially the line
 *     renders as a single point and progressively extends as the head moves. This gives
 *     a natural "wave appearing and stretching out" feel without special-casing.
 */

let soulTextureCache = null;

function buildSoulTexture() {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const cx = size / 2;
    const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
    g.addColorStop(0.00, 'rgba(255, 255, 255, 1.0)');
    g.addColorStop(0.35, 'rgba(230, 215, 255, 0.65)');
    g.addColorStop(1.00, 'rgba(180, 130, 230, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
}

function getSoulTexture() {
    if (!soulTextureCache) soulTextureCache = buildSoulTexture();
    return soulTextureCache;
}

/**
 * @param {Object} [options]
 * @param {number} [options.waveColor=0x9b3acc]      Saturated necrotic purple.
 * @param {number} [options.soulColor=0xe8d6ff]      Pale ghost white.
 * @param {number} [options.waveEmissionRate=6]
 * @param {number} [options.soulEmissionRate=20]
 * @param {number} [options.waveTrailLength=20]      Number of segments in each wave line.
 * @param {number} [options.waveSpeed=1.6]           Base inward drift.
 * @param {number} [options.waveAccel=1.8]           Multiplier as the wave closes.
 * @param {number} [options.waveLifetime=1800]       Max ms before culling — usually consumed earlier.
 * @param {number} [options.waveWobble=0.45]         Perpendicular oscillation amplitude.
 * @param {number} [options.waveFrequency=4]         Oscillations per second.
 * @param {number} [options.soulSize=0.18]
 * @param {number} [options.soulSpeed=1.5]
 * @param {number} [options.soulAccel=2.2]
 * @param {number} [options.soulLifetime=1500]
 * @param {number} [options.spawnRadius=2.0]
 * @param {number} [options.consumeRadius=0.22]      Wave/soul vanishes inside this distance.
 */
export function necrotic(options = {}) {
    const {
        waveColor = 0x9b3acc,
        soulColor = 0xe8d6ff,
        waveEmissionRate = 6,
        soulEmissionRate = 20,
        waveTrailLength = 20,
        waveSpeed = 1.6,
        waveAccel = 1.8,
        waveLifetime = 1800,
        waveWobble = 0.45,
        waveFrequency = 4,
        soulSize = 0.18,
        soulSpeed = 1.5,
        soulAccel = 2.2,
        soulLifetime = 1500,
        spawnRadius = 2.0,
        consumeRadius = 0.22,
    } = options;

    return {
        scope: 'die',
        create({ die, roller }) {
            const scene = roller.scene;
            const waveGroup = new THREE.Group();
            const soulGroup = new THREE.Group();
            scene.add(waveGroup, soulGroup);
            const soulTexture = getSoulTexture();

            const waves = [];
            const souls = [];

            let lastTime = performance.now();
            let wAcc = 0, sAcc = 0;
            let emitting = true;
            let killed = false;

            // Random offset on a sphere of `spawnRadius`, slightly above horizon so things
            // don't spawn under the floor.
            function randomSpawnOffset(out) {
                const phi = Math.random() * Math.PI * 2;
                const cosTheta = -0.4 + Math.random() * 1.4;
                const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
                out.x = sinTheta * Math.cos(phi) * spawnRadius;
                out.y = cosTheta * spawnRadius;
                out.z = sinTheta * Math.sin(phi) * spawnRadius;
                return out;
            }
            const _offset = new THREE.Vector3();

            function spawnWave() {
                randomSpawnOffset(_offset);
                const start = new THREE.Vector3(
                    die.body.position.x + _offset.x,
                    die.body.position.y + _offset.y,
                    die.body.position.z + _offset.z,
                );
                // Trail array: N positions, initially all at the spawn point. As the head
                // advances, we shift the array so the freshest position is at index 0.
                const trail = new Array(waveTrailLength);
                for (let i = 0; i < waveTrailLength; i++) trail[i] = start.clone();

                const positions = new Float32Array(waveTrailLength * 3);
                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

                const material = new THREE.LineBasicMaterial({
                    color: waveColor,
                    transparent: true, opacity: 0,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                });
                const line = new THREE.Line(geometry, material);
                waveGroup.add(line);

                waves.push({
                    head: start.clone(),
                    trail, positions, geometry, material, line,
                    age: 0,
                    wobbleSeed: Math.random() * Math.PI * 2,
                });
            }

            function spawnSoul() {
                const material = new THREE.SpriteMaterial({
                    map: soulTexture, color: soulColor,
                    transparent: true, opacity: 0,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                });
                const sprite = new THREE.Sprite(material);
                randomSpawnOffset(_offset);
                sprite.position.set(
                    die.body.position.x + _offset.x,
                    die.body.position.y + _offset.y,
                    die.body.position.z + _offset.z,
                );
                const baseSize = soulSize * (0.6 + Math.random() * 0.8);
                sprite.scale.setScalar(baseSize);
                souls.push({
                    sprite, material, baseSize,
                    age: 0,
                    wobbleSeed: Math.random() * Math.PI * 2,
                });
                soulGroup.add(sprite);
            }

            function disposeAll() {
                for (const w of waves) {
                    w.material.dispose();
                    w.geometry.dispose();
                }
                for (const s of souls) s.material.dispose();
                waves.length = souls.length = 0;
                scene.remove(waveGroup);
                scene.remove(soulGroup);
            }

            // Scratch vectors reused per frame to avoid GC churn.
            const _dir = new THREE.Vector3();
            const _perp = new THREE.Vector3();
            const _up = new THREE.Vector3(0, 1, 0);

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
                        wAcc += dt * waveEmissionRate;
                        sAcc += dt * soulEmissionRate;
                        while (wAcc >= 1) { spawnWave(); wAcc -= 1; }
                        while (sAcc >= 1) { spawnSoul(); sAcc -= 1; }
                    }

                    const tNow = now / 1000;
                    const dieX = die.body.position.x;
                    const dieY = die.body.position.y;
                    const dieZ = die.body.position.z;

                    // Waves: head advances inward with a perpendicular sine wobble; trail
                    // tracks the head's recent positions so the visible curve traces the
                    // head's path. The trail length grows naturally as the head moves
                    // (it starts as N copies of the spawn point).
                    for (let i = waves.length - 1; i >= 0; i--) {
                        const w = waves[i];
                        w.age += dt * 1000;
                        const dx = dieX - w.head.x;
                        const dy = dieY - w.head.y;
                        const dz = dieZ - w.head.z;
                        const dist = Math.hypot(dx, dy, dz);
                        if (dist < consumeRadius || w.age >= waveLifetime) {
                            waveGroup.remove(w.line);
                            w.material.dispose();
                            w.geometry.dispose();
                            waves.splice(i, 1);
                            continue;
                        }
                        _dir.set(dx / dist, dy / dist, dz / dist);
                        // Build a stable perpendicular axis (in the XZ plane mostly) by
                        // crossing with world-up. Fall back if the wave is nearly vertical.
                        _perp.crossVectors(_dir, _up);
                        if (_perp.lengthSq() < 1e-4) _perp.set(1, 0, 0);
                        else _perp.normalize();

                        const closeness = Math.max(0, 1 - dist / spawnRadius);
                        const speed = waveSpeed * (1 + waveAccel * closeness);
                        const wobble = Math.sin(tNow * waveFrequency + w.wobbleSeed) * waveWobble;

                        w.head.x += _dir.x * speed * dt + _perp.x * wobble * dt;
                        w.head.y += _dir.y * speed * dt + _perp.y * wobble * dt;
                        w.head.z += _dir.z * speed * dt + _perp.z * wobble * dt;

                        // Shift the trail: oldest position drops, head joins at index 0.
                        for (let j = w.trail.length - 1; j > 0; j--) {
                            w.trail[j].copy(w.trail[j - 1]);
                        }
                        w.trail[0].copy(w.head);

                        // Pack into the line's position attribute and flag it dirty.
                        for (let j = 0; j < w.trail.length; j++) {
                            const t = w.trail[j];
                            w.positions[j * 3] = t.x;
                            w.positions[j * 3 + 1] = t.y;
                            w.positions[j * 3 + 2] = t.z;
                        }
                        w.geometry.attributes.position.needsUpdate = true;

                        // Opacity: short attack-in, then gentle taper as the head approaches
                        // the die (reads as the energy being absorbed).
                        const lifeT = w.age / waveLifetime;
                        const fade = Math.min(1, dist / 0.4);
                        w.material.opacity = lifeT < 0.12
                            ? (lifeT / 0.12) * fade * 0.95
                            : fade * 0.95;
                    }

                    // Souls: simple inward drift with a slight tangential drift so they
                    // don't fly in along perfectly straight lines. Fade as they near the die.
                    for (let i = souls.length - 1; i >= 0; i--) {
                        const s = souls[i];
                        s.age += dt * 1000;
                        const dx = dieX - s.sprite.position.x;
                        const dy = dieY - s.sprite.position.y;
                        const dz = dieZ - s.sprite.position.z;
                        const dist = Math.hypot(dx, dy, dz);
                        if (s.age >= soulLifetime || dist < consumeRadius) {
                            soulGroup.remove(s.sprite);
                            s.material.dispose();
                            souls.splice(i, 1);
                            continue;
                        }
                        const closeness = Math.max(0, 1 - dist / spawnRadius);
                        const speed = soulSpeed * (1 + soulAccel * closeness);
                        const wob = Math.sin(tNow * 2.5 + s.wobbleSeed) * 0.3;
                        const tx = -dz, tz = dx;
                        const tlen = Math.hypot(tx, tz) || 1;
                        s.sprite.position.x += (dx / dist) * speed * dt + (tx / tlen) * wob * dt;
                        s.sprite.position.y += (dy / dist) * speed * dt;
                        s.sprite.position.z += (dz / dist) * speed * dt + (tz / tlen) * wob * dt;
                        // Subtle size pulse so the souls feel alive.
                        const lifeT = s.age / soulLifetime;
                        const pulse = 1 + Math.sin(tNow * 5 + s.wobbleSeed) * 0.15;
                        s.sprite.scale.setScalar(s.baseSize * pulse);
                        const fade = Math.min(1, dist / 0.4);
                        s.material.opacity = lifeT < 0.1 ? (lifeT / 0.1) * fade : fade;
                    }

                    if (!emitting && waves.length === 0 && souls.length === 0) {
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
