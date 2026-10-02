import * as THREE from 'three';
import { easeOutCubic } from './base.js';

/**
 * One frame of the glow: the material's own emissive (its base colour times its base
 * intensity) plus the pulse colour scaled by `value`, written with emissiveIntensity 1 so
 * the sum is exact. Materials with no emissive of their own (classic Phong: black) get
 * exactly colour × value, as this effect always produced. Materials that rely on their
 * emissive — a gem's inner glow, Ember's lit numerals — are never driven below it, so the
 * die does not darken while the pulse decays.
 */
const scaledPulse = new THREE.Color();

export function glowFrame(material, baseEmissive, pulseColor, value) {
    // three r130's Color has no addScaledVector; scale into a scratch colour and add.
    scaledPulse.copy(pulseColor).multiplyScalar(Math.max(0, value));
    material.emissive.copy(baseEmissive).add(scaledPulse);
    material.emissiveIntensity = 1;
}

/**
 * Pulse an emissive color across every face material on the die. Spikes fast at ~15%
 * then decays — a quick "ding" attack, slow release.
 *
 * @param {Object}  [options]
 * @param {number}  [options.color=0xffd166]   Emissive hex color.
 * @param {number}  [options.duration=900]     Total duration in ms.
 * @param {number}  [options.intensity=1.2]    Peak `emissiveIntensity` value.
 */
export function glow(options = {}) {
    const { color = 0xffd166, duration = 900, intensity = 1.2 } = options;
    return {
        scope: 'die',
        create(ctx) {
            const { die } = ctx;
            const materials = (Array.isArray(die.mesh.material) ? die.mesh.material : [die.mesh.material])
                .filter((m) => m.emissive);
            const originalEmissive = materials.map((m) => m.emissive.getHex());
            const originalIntensity = materials.map((m) => m.emissiveIntensity ?? 1);
            const baseEmissive = materials.map((m, i) => m.emissive.clone().multiplyScalar(originalIntensity[i]));
            const pulseColor = new THREE.Color(color);
            const startTime = performance.now();
            return {
                update() {
                    const t = Math.min((performance.now() - startTime) / duration, 1);
                    const pulse = t < 0.15 ? t / 0.15 : 1 - easeOutCubic((t - 0.15) / 0.85);
                    const value = Math.max(0, pulse) * intensity;
                    materials.forEach((m, i) => glowFrame(m, baseEmissive[i], pulseColor, value));

                    if (t >= 1) {
                        materials.forEach((m, i) => {
                            m.emissive.setHex(originalEmissive[i]);
                            m.emissiveIntensity = originalIntensity[i];
                        });
                        return true;
                    }
                    return false;
                }
            };
        }
    };
}
