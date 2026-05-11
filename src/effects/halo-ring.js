import * as THREE from 'three';
import { easeOutCubic } from './base.js';

/**
 * Spawn a flat glowing torus beneath the die that expands, rises, and fades. The ring is
 * its own scene-attached mesh — it tracks the die's XZ position but doesn't inherit any
 * scale/material effects, so it can stack with glow and scalePulse cleanly.
 *
 * @param {Object}  [options]
 * @param {number}  [options.color=0xffd166]
 * @param {number}  [options.duration=1100]      Total duration in ms.
 * @param {number}  [options.startRadius=0.9]    Initial ring radius.
 * @param {number}  [options.endRadius=2.4]      Final radius.
 * @param {number}  [options.rise=0.6]           Vertical lift in world units.
 * @param {number}  [options.tubeRadius=0.08]    Torus tube thickness.
 */
export function haloRing(options = {}) {
    const {
        color = 0xffd166, duration = 1100, startRadius = 0.9, endRadius = 2.4,
        rise = 0.6, tubeRadius = 0.08,
    } = options;
    return {
        scope: 'die',
        create(ctx) {
            const { die, roller } = ctx;
            const scene = roller.scene;
            const ring = new THREE.Mesh(
                new THREE.TorusGeometry(startRadius, tubeRadius, 10, 48),
                new THREE.MeshBasicMaterial({
                    color, transparent: true, opacity: 0.9,
                    blending: THREE.AdditiveBlending, depthWrite: false,
                }),
            );
            ring.rotation.x = Math.PI / 2;
            ring.position.copy(die.body.position);
            scene.add(ring);
            const baseY = ring.position.y;
            const startTime = performance.now();
            let disposed = false;
            function disposeAll() {
                if (disposed) return;
                disposed = true;
                scene.remove(ring);
                ring.geometry.dispose();
                ring.material.dispose();
            }
            return {
                update() {
                    if (disposed) return true;
                    const t = Math.min((performance.now() - startTime) / duration, 1);
                    const eased = easeOutCubic(t);
                    ring.position.x = die.body.position.x;
                    ring.position.z = die.body.position.z;
                    ring.position.y = baseY + rise * eased;
                    const scale = 1 + ((endRadius / startRadius) - 1) * eased;
                    ring.scale.setScalar(scale);
                    ring.material.opacity = 0.9 * (1 - eased);
                    ring.rotation.z += 0.04;

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
