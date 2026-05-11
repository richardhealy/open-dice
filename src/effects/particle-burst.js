import * as THREE from 'three';
import { getSparkTexture } from './sprite-texture.js';

/**
 * One-shot burst of glowing spark sprites from the die. Each particle is a billboard
 * with a radial-gradient texture, additively blended, with random direction biased
 * upward, gravity, drag, and a tail-of-light effect (subtle scale stretch in the direction
 * of motion).
 *
 * Use this for sparks/embers on impact moments. For sustained flame, see fire(). For
 * confetti/celebration, see confetti().
 *
 * @param {Object}  [options]
 * @param {number}  [options.color=0xffd166]    Base tint applied to the gradient sprite.
 * @param {number}  [options.count=40]
 * @param {number}  [options.duration=1100]     ms
 * @param {number}  [options.spread=3.5]        Initial speed magnitude.
 * @param {number}  [options.gravity=8]         Downward acceleration (world units / s²).
 * @param {number}  [options.drag=0.6]          Air drag coefficient (per-second decay).
 * @param {number}  [options.particleSize=0.4]  Sprite world size at unit scale.
 */
export function particleBurst(options = {}) {
    const {
        color = 0xffd166, count = 40, duration = 1100,
        spread = 3.5, gravity = 8, drag = 0.6, particleSize = 0.4,
    } = options;
    return {
        scope: 'die',
        create({ die, roller }) {
            const scene = roller.scene;
            const group = new THREE.Group();
            scene.add(group);
            const texture = getSparkTexture();
            const particles = [];

            for (let i = 0; i < count; i++) {
                const material = new THREE.SpriteMaterial({
                    map: texture,
                    color,
                    transparent: true,
                    opacity: 1,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                });
                const sprite = new THREE.Sprite(material);
                sprite.position.copy(die.body.position);
                sprite.position.y += 0.2;
                const baseSize = particleSize * (0.6 + Math.random() * 0.7);
                sprite.scale.setScalar(baseSize);
                // Uniform direction on the sphere, biased upward.
                const phi = Math.random() * Math.PI * 2;
                const cosTheta = Math.random() * 2 - 1;
                const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
                const speed = (0.4 + Math.random() * 0.6) * spread;
                particles.push({
                    sprite, material, baseSize,
                    vx: sinTheta * Math.cos(phi) * speed,
                    vy: Math.abs(cosTheta) * speed * 1.1,
                    vz: sinTheta * Math.sin(phi) * speed,
                });
                group.add(sprite);
            }

            const startTime = performance.now();
            let lastTime = startTime;
            let disposed = false;

            function disposeAll() {
                if (disposed) return;
                disposed = true;
                scene.remove(group);
                particles.forEach(p => p.material.dispose());
            }

            return {
                update() {
                    if (disposed) return true;
                    const now = performance.now();
                    const dt = (now - lastTime) / 1000;
                    lastTime = now;
                    const t = Math.min((now - startTime) / duration, 1);

                    // Opacity attack-decay: 15% attack so first frame isn't a hard pop,
                    // 85% decay over the rest. Sparks fade as they cool.
                    let opacity;
                    if (t < 0.05) opacity = t / 0.05;
                    else opacity = 1 - (t - 0.05) / 0.95;

                    particles.forEach(p => {
                        p.sprite.position.x += p.vx * dt;
                        p.sprite.position.y += p.vy * dt;
                        p.sprite.position.z += p.vz * dt;
                        p.vx *= 1 - dt * drag;
                        p.vy -= gravity * dt;
                        p.vz *= 1 - dt * drag;
                        p.material.opacity = opacity;
                        // Tiny size pulse so distant frame doesn't look static.
                        const sizeMul = 1 + Math.sin(t * Math.PI) * 0.25;
                        p.sprite.scale.setScalar(p.baseSize * sizeMul);
                    });

                    if (t >= 1) {
                        disposeAll();
                        return true;
                    }
                    return false;
                },
                cleanup: disposeAll,
            };
        }
    };
}
