/**
 * Apply a decaying random offset to the camera position. Scoped 'once' because shaking
 * the camera multiple times from concurrent matched dice would just stack into noise.
 *
 * Camera is orthographic top-down (looking straight down the Y axis), so the shake lives
 * on the X/Z plane.
 *
 * @param {Object}  [options]
 * @param {number}  [options.intensity=0.3]   Max offset magnitude in world units.
 * @param {number}  [options.duration=500]    Total duration in ms.
 */
export function screenShake(options = {}) {
    const { intensity = 0.3, duration = 500 } = options;
    return {
        scope: 'once',
        create(ctx) {
            const { roller } = ctx;
            const camera = roller.camera;
            const originalX = camera.position.x;
            const originalZ = camera.position.z;
            const startTime = performance.now();
            return {
                update() {
                    const t = Math.min((performance.now() - startTime) / duration, 1);
                    const decay = 1 - t;
                    camera.position.x = originalX + (Math.random() - 0.5) * intensity * decay;
                    camera.position.z = originalZ + (Math.random() - 0.5) * intensity * decay;
                    if (t >= 1) {
                        camera.position.x = originalX;
                        camera.position.z = originalZ;
                        return true;
                    }
                    return false;
                }
            };
        }
    };
}
