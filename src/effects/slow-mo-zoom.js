import { easeOutCubic } from './base.js';

/**
 * Pan-and-zoom the orthographic camera in on the matched die, hold, then return. Three
 * phases: ramp-in, hold, ramp-out. Combined holdRatio = total time spent at peak.
 *
 * Scoped 'once' — only the first matching die in a batch gets the zoom focus.
 *
 * @param {Object}  [options]
 * @param {number}  [options.duration=1200]    Total duration in ms.
 * @param {number}  [options.zoomLevel=1.6]    Target `camera.zoom` value at peak.
 * @param {number}  [options.holdRatio=0.4]    Fraction of duration spent at peak zoom.
 */
export function slowMoZoom(options = {}) {
    const { duration = 1200, zoomLevel = 1.6, holdRatio = 0.4 } = options;
    return {
        scope: 'once',
        create(ctx) {
            const { die, roller } = ctx;
            const camera = roller.camera;
            const originalPos = camera.position.clone();
            const originalZoom = camera.zoom;
            const targetX = die.body.position.x;
            const targetZ = die.body.position.z;
            const startTime = performance.now();
            const rampLen = (1 - holdRatio) / 2;
            return {
                update() {
                    const t = Math.min((performance.now() - startTime) / duration, 1);
                    let amount;
                    if (t < rampLen) {
                        amount = easeOutCubic(t / rampLen);
                    } else if (t < rampLen + holdRatio) {
                        amount = 1;
                    } else {
                        amount = 1 - easeOutCubic((t - rampLen - holdRatio) / rampLen);
                    }
                    camera.position.x = originalPos.x + (targetX - originalPos.x) * amount;
                    camera.position.z = originalPos.z + (targetZ - originalPos.z) * amount;
                    camera.lookAt(camera.position.x, 0, camera.position.z);
                    camera.zoom = originalZoom + (zoomLevel - originalZoom) * amount;
                    camera.updateProjectionMatrix();

                    if (t >= 1) {
                        camera.position.copy(originalPos);
                        camera.zoom = originalZoom;
                        camera.lookAt(0, 0, 0);
                        camera.updateProjectionMatrix();
                        return true;
                    }
                    return false;
                }
            };
        }
    };
}
