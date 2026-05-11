import * as THREE from 'three';

/**
 * Leave a fading particle trail behind the die as it tumbles. Each emitted sphere is
 * dropped at the die's current position and shrinks/fades over a short lifetime.
 *
 * Roll-time effect — attach via the dice config:
 *
 *   roll([{ dice: 'd6', rolled: 6, effects: [trail({ color: 0x66ccff })] }])
 *
 * Emission stops once the die settles; remaining particles complete their lifetimes
 * before the effect signals done.
 *
 * @param {Object}    [options]
 * @param {number}    [options.color=0x66ccff]
 * @param {number}    [options.emissionRate=40]      Particles per second.
 * @param {number}    [options.particleLifetime=450] ms
 * @param {number}    [options.particleSize=0.18]
 * @param {number}    [options.startOpacity=0.85]
 */
export function trail(options = {}) {
    const {
        color = 0x66ccff,
        emissionRate = 40,
        particleLifetime = 450,
        particleSize = 0.18,
        startOpacity = 0.85,
    } = options;

    return {
        scope: 'die',
        create({ die, roller }) {
            const scene = roller.scene;
            const group = new THREE.Group();
            scene.add(group);
            const sharedGeometry = new THREE.SphereGeometry(particleSize, 6, 6);
            const particles = [];

            let lastTime = performance.now();
            let accumulator = 0;
            let emitting = true;
            let killed = false;

            function spawn() {
                const material = new THREE.MeshBasicMaterial({
                    color, transparent: true, opacity: startOpacity,
                    blending: THREE.AdditiveBlending, depthWrite: false,
                });
                const mesh = new THREE.Mesh(sharedGeometry, material);
                mesh.position.copy(die.body.position);
                particles.push({ mesh, material, age: 0 });
                group.add(mesh);
            }

            function disposeAll() {
                for (const p of particles) p.material.dispose();
                particles.length = 0;
                scene.remove(group);
                sharedGeometry.dispose();
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

                    for (let i = particles.length - 1; i >= 0; i--) {
                        const p = particles[i];
                        p.age += dt * 1000;
                        if (p.age >= particleLifetime) {
                            group.remove(p.mesh);
                            p.material.dispose();
                            particles.splice(i, 1);
                            continue;
                        }
                        const lifeT = p.age / particleLifetime;
                        p.material.opacity = startOpacity * (1 - lifeT);
                        p.mesh.scale.setScalar(1 - lifeT * 0.7);
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
