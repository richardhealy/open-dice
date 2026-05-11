import { easeOutCubic } from './base.js';

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
            const materials = Array.isArray(die.mesh.material) ? die.mesh.material : [die.mesh.material];
            const originalEmissive = materials.map(m => m.emissive ? m.emissive.getHex() : null);
            const originalIntensity = materials.map(m => m.emissiveIntensity ?? 1);
            materials.forEach((m) => { if (m.emissive) m.emissive.setHex(color); });
            const startTime = performance.now();
            return {
                update() {
                    const t = Math.min((performance.now() - startTime) / duration, 1);
                    const pulse = t < 0.15 ? t / 0.15 : 1 - easeOutCubic((t - 0.15) / 0.85);
                    const value = Math.max(0, pulse) * intensity;
                    materials.forEach((m) => { if (m.emissive) m.emissiveIntensity = value; });

                    if (t >= 1) {
                        materials.forEach((m, i) => {
                            if (m.emissive && originalEmissive[i] != null) m.emissive.setHex(originalEmissive[i]);
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
