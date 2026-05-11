import * as THREE from 'three';
import { getFirePuffTexture } from './sprite-texture.js';

/**
 * Continuously emit flame particles from the die while it's in motion. Each particle is
 * an additively-blended billboard sprite using a radial-gradient texture, tinted across
 * the white-hot → yellow → orange → ember-red palette as it ages. Sprites wobble
 * sinusoidally, slow as they cool (heat loss → velocity decay), and pulse in size before
 * fading out.
 *
 * Attach via the dice config:
 *   roll([{ dice: 'd20', rolled: 20, effects: [fire()] }])
 *
 * Once the die settles, emission stops and existing flames complete their lifetimes
 * before the effect signals done.
 *
 * @param {Object} [options]
 * @param {number} [options.emissionRate=110]    Particles per second.
 * @param {number} [options.particleLifetime=700] ms
 * @param {number} [options.particleSize=0.65]   Sprite world-units at unit scale.
 * @param {number} [options.spread=0.35]         Horizontal jitter around die.
 * @param {number} [options.rise=2.4]            Base upward velocity.
 * @param {number} [options.wobble=0.5]          Sideways oscillation amplitude.
 * @param {number} [options.coolFactor=0.6]      Velocity decay coefficient.
 */
export function fire(options = {}) {
    const {
        emissionRate = 110,
        particleLifetime = 700,
        particleSize = 0.65,
        spread = 0.35,
        rise = 2.4,
        wobble = 0.5,
        coolFactor = 0.6,
    } = options;

    return {
        scope: 'die',
        create({ die, roller }) {
            const scene = roller.scene;
            const group = new THREE.Group();
            scene.add(group);
            const texture = getFirePuffTexture();
            const particles = [];

            let lastTime = performance.now();
            let accumulator = 0;
            let emitting = true;
            let killed = false;

            function spawn() {
                const material = new THREE.SpriteMaterial({
                    map: texture,
                    transparent: true,
                    opacity: 0,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                    color: 0xffffff,
                });
                const sprite = new THREE.Sprite(material);
                sprite.position.copy(die.body.position);
                sprite.position.x += (Math.random() - 0.5) * spread;
                sprite.position.z += (Math.random() - 0.5) * spread;
                sprite.position.y += 0.15;
                const baseSize = particleSize * (0.7 + Math.random() * 0.6);
                sprite.scale.setScalar(baseSize);
                particles.push({
                    sprite, material,
                    age: 0,
                    baseSize,
                    vx: (Math.random() - 0.5) * 0.6,
                    vy: rise + (Math.random() - 0.5) * 0.8,
                    vz: (Math.random() - 0.5) * 0.6,
                    wobbleSeed: Math.random() * Math.PI * 2,
                });
                group.add(sprite);
            }

            function disposeAll() {
                for (const p of particles) p.material.dispose();
                particles.length = 0;
                scene.remove(group);
            }

            // RGB color stops for the flame palette. Lifetime ratio t ∈ [0, 1] from
            // newborn (white-hot) to dying (deep ember red). Linearly interpolated
            // between adjacent stops.
            const colorStops = [
                { t: 0.00, r: 1.00, g: 1.00, b: 1.00 }, // white core
                { t: 0.18, r: 1.00, g: 0.95, b: 0.65 }, // pale yellow
                { t: 0.40, r: 1.00, g: 0.65, b: 0.25 }, // saturated orange
                { t: 0.75, r: 0.95, g: 0.30, b: 0.05 }, // red-orange
                { t: 1.00, r: 0.55, g: 0.05, b: 0.00 }, // dim ember
            ];

            function tintForLife(t, target) {
                for (let i = 1; i < colorStops.length; i++) {
                    if (t <= colorStops[i].t) {
                        const a = colorStops[i - 1];
                        const b = colorStops[i];
                        const u = (t - a.t) / (b.t - a.t);
                        target.setRGB(a.r + (b.r - a.r) * u,
                                      a.g + (b.g - a.g) * u,
                                      a.b + (b.b - a.b) * u);
                        return;
                    }
                }
                const last = colorStops[colorStops.length - 1];
                target.setRGB(last.r, last.g, last.b);
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
                        accumulator += dt * emissionRate;
                        while (accumulator >= 1) {
                            spawn();
                            accumulator -= 1;
                        }
                    }

                    const tNow = now / 1000;
                    for (let i = particles.length - 1; i >= 0; i--) {
                        const p = particles[i];
                        p.age += dt * 1000;
                        if (p.age >= particleLifetime) {
                            group.remove(p.sprite);
                            p.material.dispose();
                            particles.splice(i, 1);
                            continue;
                        }
                        const lifeT = p.age / particleLifetime;

                        // Sinusoidal wobble — hot air convection. Each particle has its
                        // own phase offset so the column doesn't move in lockstep.
                        const wobx = Math.sin(tNow * 4.5 + p.wobbleSeed) * wobble * dt;
                        const wobz = Math.cos(tNow * 4.5 + p.wobbleSeed * 1.3) * wobble * dt;
                        p.sprite.position.x += p.vx * dt + wobx;
                        p.sprite.position.y += p.vy * dt;
                        p.sprite.position.z += p.vz * dt + wobz;

                        // Heat loss — vertical velocity bleeds off as the particle cools.
                        p.vy *= 1 - dt * coolFactor;

                        tintForLife(lifeT, p.material.color);

                        // Size: grows ~40% then settles back. Cooked-by-eye, looks like
                        // a flame puff puffing outward.
                        const sizeMul = 1 + Math.sin(lifeT * Math.PI) * 0.4;
                        p.sprite.scale.setScalar(p.baseSize * sizeMul);

                        // Opacity: fast attack (10% of life), hold, slow release (last
                        // 30%). Keeps the bright core visible long enough to be readable.
                        let opacity;
                        if (lifeT < 0.1) opacity = lifeT / 0.1;
                        else if (lifeT < 0.7) opacity = 1;
                        else opacity = (1 - lifeT) / 0.3;
                        p.material.opacity = opacity;
                    }

                    if (!emitting && particles.length === 0) {
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
