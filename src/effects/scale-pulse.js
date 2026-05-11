/**
 * Smoothly scale the die's mesh up and back to original size. Sine curve so it eases
 * in/out automatically. Only the mesh scales — the physics body is untouched.
 *
 * @param {Object}  [options]
 * @param {number}  [options.peak=1.25]      Peak scale multiplier.
 * @param {number}  [options.duration=500]   Total duration in ms.
 */
export function scalePulse(options = {}) {
    const { peak = 1.25, duration = 500 } = options;
    return {
        scope: 'die',
        create(ctx) {
            const { die } = ctx;
            const originalScale = die.mesh.scale.clone();
            const startTime = performance.now();
            return {
                update() {
                    const t = Math.min((performance.now() - startTime) / duration, 1);
                    const s = 1 + (peak - 1) * Math.sin(t * Math.PI);
                    die.mesh.scale.set(s, s, s);
                    if (t >= 1) {
                        die.mesh.scale.copy(originalScale);
                        return true;
                    }
                    return false;
                }
            };
        }
    };
}
