import * as THREE from 'three';

/**
 * Radiant effect: golden god-rays radiate outward from the die in all directions, bright
 * sparkles flash around it, and a soft pulsing halo sits on the floor beneath it. The
 * visual opposite of necrotic — celestial, clean, and bright rather than dark and inward.
 *
 * Three streams:
 *   - Rays: elongated sprites positioned just past the die's center, rotated so each
 *     ray's "bright base" points toward the die and its faded tip points outward. The
 *     rays grow longer over their lifetime, mimicking a sunburst.
 *   - Sparkles: 4-pointed star sprites scattered around the die that scale up, spin,
 *     and fade quickly — pinpoint highlights.
 *   - Halo: a single persistent ring-textured plane on the floor below the die that
 *     fades in while the effect emits, gently pulses, and fades out when emission ends.
 *
 * The rays use a textured sprite (not a plane mesh) so they always face the camera; the
 * orientation math accounts for the top-down ortho view (`camera.up = (0, 0, -1)`).
 */

let rayTextureCache = null;
let sparkleTextureCache = null;
let haloTextureCache = null;
let sharedPlaneGeo = null;

function buildRayTexture() {
    // Tall narrow sprite. Bright at canvas BOTTOM (which after THREE's flipY becomes
    // sprite -Y end) and fades to nothing at canvas TOP (sprite +Y end). With our
    // rotation math below, the bright end ends up pointing inward toward the die.
    const w = 32;
    const h = 256;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    const xGrad = ctx.createLinearGradient(0, 0, w, 0);
    xGrad.addColorStop(0.00, 'rgba(255, 255, 255, 0)');
    xGrad.addColorStop(0.45, 'rgba(255, 255, 255, 1)');
    xGrad.addColorStop(0.55, 'rgba(255, 255, 255, 1)');
    xGrad.addColorStop(1.00, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = xGrad;
    ctx.fillRect(0, 0, w, h);

    const yGrad = ctx.createLinearGradient(0, 0, 0, h);
    yGrad.addColorStop(0.00, 'rgba(255, 255, 255, 0)');     // outer tip (faded)
    yGrad.addColorStop(0.55, 'rgba(255, 255, 255, 0.85)');
    yGrad.addColorStop(1.00, 'rgba(255, 255, 255, 1)');     // base (bright, near die)
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = yGrad;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
}

function buildSparkleTexture() {
    // Classic 4-point star: horizontal bar + vertical bar + bright core dot.
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const cx = size / 2;

    const armThickness = 3;
    const hGrad = ctx.createLinearGradient(0, cx, size, cx);
    hGrad.addColorStop(0.00, 'rgba(255, 255, 255, 0)');
    hGrad.addColorStop(0.50, 'rgba(255, 255, 255, 1)');
    hGrad.addColorStop(1.00, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = hGrad;
    ctx.fillRect(0, cx - armThickness / 2, size, armThickness);

    const vGrad = ctx.createLinearGradient(cx, 0, cx, size);
    vGrad.addColorStop(0.00, 'rgba(255, 255, 255, 0)');
    vGrad.addColorStop(0.50, 'rgba(255, 255, 255, 1)');
    vGrad.addColorStop(1.00, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = vGrad;
    ctx.fillRect(cx - armThickness / 2, 0, armThickness, size);

    // Bright soft core dot.
    const coreRadius = size * 0.22;
    const cGrad = ctx.createRadialGradient(cx, cx, 0, cx, cx, coreRadius);
    cGrad.addColorStop(0.00, 'rgba(255, 255, 255, 1)');
    cGrad.addColorStop(1.00, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = cGrad;
    ctx.beginPath();
    ctx.arc(cx, cx, coreRadius, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
}

function buildHaloTexture() {
    // Ring: bright outer edge, dim inner. Drawn as a radial gradient that peaks near the
    // rim and falls off both inward (so the center is empty) and outward.
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const cx = size / 2;
    const grad = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
    grad.addColorStop(0.00, 'rgba(255, 255, 255, 0)');
    grad.addColorStop(0.60, 'rgba(255, 255, 255, 0.1)');
    grad.addColorStop(0.85, 'rgba(255, 255, 255, 0.9)');
    grad.addColorStop(1.00, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
}

function getRayTexture() { if (!rayTextureCache) rayTextureCache = buildRayTexture(); return rayTextureCache; }
function getSparkleTexture() { if (!sparkleTextureCache) sparkleTextureCache = buildSparkleTexture(); return sparkleTextureCache; }
function getHaloTexture() { if (!haloTextureCache) haloTextureCache = buildHaloTexture(); return haloTextureCache; }
function getSharedPlaneGeometry() {
    if (!sharedPlaneGeo) sharedPlaneGeo = new THREE.PlaneGeometry(1, 1);
    return sharedPlaneGeo;
}

/**
 * @param {Object} [options]
 * @param {number} [options.rayColor=0xffe9a0]
 * @param {number} [options.sparkleColor=0xffffff]
 * @param {number} [options.haloColor=0xffd870]
 * @param {number} [options.rayEmissionRate=10]
 * @param {number} [options.sparkleEmissionRate=32]
 * @param {number} [options.rayLength=1.9]
 * @param {number} [options.rayWidth=0.13]
 * @param {number} [options.rayLifetime=800]
 * @param {number} [options.sparkleSize=0.3]
 * @param {number} [options.sparkleLifetime=520]
 * @param {number} [options.haloSize=1.6]
 */
export function radiant(options = {}) {
    const {
        rayColor = 0xffe9a0,
        sparkleColor = 0xffffff,
        haloColor = 0xffd870,
        rayEmissionRate = 10,
        sparkleEmissionRate = 32,
        rayLength = 1.9,
        rayWidth = 0.13,
        rayLifetime = 800,
        sparkleSize = 0.3,
        sparkleLifetime = 520,
        haloSize = 1.6,
    } = options;

    return {
        scope: 'die',
        create({ die, roller }) {
            const scene = roller.scene;
            const rayGroup = new THREE.Group();
            const sparkleGroup = new THREE.Group();
            const haloGroup = new THREE.Group();
            scene.add(rayGroup, sparkleGroup, haloGroup);
            const rayTexture = getRayTexture();
            const sparkleTexture = getSparkleTexture();
            const haloTexture = getHaloTexture();
            const planeGeo = getSharedPlaneGeometry();

            // Persistent ground halo — single mesh, fades in while emitting, fades out
            // when emission stops. Pulses softly throughout.
            const haloMaterial = new THREE.MeshBasicMaterial({
                map: haloTexture, color: haloColor,
                transparent: true, opacity: 0,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            });
            const halo = new THREE.Mesh(planeGeo, haloMaterial);
            halo.rotation.x = -Math.PI / 2;
            halo.scale.setScalar(haloSize);
            haloGroup.add(halo);

            const rays = [];
            const sparkles = [];

            let lastTime = performance.now();
            let rAcc = 0, sAcc = 0;
            let emitting = true;
            let killed = false;
            let haloOpacity = 0;

            function spawnRay() {
                const material = new THREE.SpriteMaterial({
                    map: rayTexture, color: rayColor,
                    transparent: true, opacity: 0,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                });
                const sprite = new THREE.Sprite(material);
                // Random outward direction in the XZ plane.
                const angle = Math.random() * Math.PI * 2;
                const length = rayLength * (0.7 + Math.random() * 0.6);
                const width = rayWidth * (0.7 + Math.random() * 0.6);
                // Sprite centered between the die and the outer tip.
                sprite.position.set(
                    die.body.position.x + Math.cos(angle) * length * 0.5,
                    die.body.position.y + 0.2,
                    die.body.position.z + Math.sin(angle) * length * 0.5,
                );
                sprite.scale.set(width, length, 1);
                // With camera.up = (0, 0, -1), screen +Y = world -Z. To get the sprite's
                // bright end (at -Y of the sprite) pointing INWARD (toward die),
                // material.rotation needs to be `π/2 - angle`. Derived in the comments
                // above buildRayTexture — empirically verified for α=0, π/2, π.
                material.rotation = Math.PI / 2 - angle;

                rays.push({
                    sprite, material, angle,
                    baseLength: length, baseWidth: width,
                    age: 0,
                });
                rayGroup.add(sprite);
            }

            function spawnSparkle() {
                const material = new THREE.SpriteMaterial({
                    map: sparkleTexture, color: sparkleColor,
                    transparent: true, opacity: 0,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                    rotation: Math.random() * Math.PI,
                });
                const sprite = new THREE.Sprite(material);
                const phi = Math.random() * Math.PI * 2;
                const cosTheta = Math.random() * 2 - 1;
                const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
                const r = 0.3 + Math.random() * 0.9;
                sprite.position.set(
                    die.body.position.x + sinTheta * Math.cos(phi) * r,
                    die.body.position.y + cosTheta * r * 0.7 + 0.3,
                    die.body.position.z + sinTheta * Math.sin(phi) * r,
                );
                const baseSize = sparkleSize * (0.6 + Math.random() * 0.8);
                sprite.scale.setScalar(baseSize);
                sparkles.push({ sprite, material, baseSize, age: 0 });
                sparkleGroup.add(sprite);
            }

            function disposeAll() {
                for (const r of rays) r.material.dispose();
                for (const s of sparkles) s.material.dispose();
                rays.length = sparkles.length = 0;
                haloMaterial.dispose();
                scene.remove(rayGroup);
                scene.remove(sparkleGroup);
                scene.remove(haloGroup);
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
                        rAcc += dt * rayEmissionRate;
                        sAcc += dt * sparkleEmissionRate;
                        while (rAcc >= 1) { spawnRay(); rAcc -= 1; }
                        while (sAcc >= 1) { spawnSparkle(); sAcc -= 1; }
                    }

                    // Halo follows the die in XZ, sits just above floor, pulses softly.
                    halo.position.x = die.body.position.x;
                    halo.position.z = die.body.position.z;
                    halo.position.y = 0.04;
                    if (emitting) haloOpacity = Math.min(0.65, haloOpacity + dt * 2.2);
                    else haloOpacity = Math.max(0, haloOpacity - dt * 1.6);
                    const pulse = 1 + Math.sin(now / 180) * 0.08;
                    haloMaterial.opacity = haloOpacity * pulse;
                    halo.scale.setScalar(haloSize * pulse);

                    // Rays: grow longer over life, drift outward to follow their growing
                    // length, fade quickly at the end.
                    for (let i = rays.length - 1; i >= 0; i--) {
                        const r = rays[i];
                        r.age += dt * 1000;
                        if (r.age >= rayLifetime) {
                            rayGroup.remove(r.sprite);
                            r.material.dispose();
                            rays.splice(i, 1);
                            continue;
                        }
                        const lifeT = r.age / rayLifetime;
                        const lenMul = 1 + lifeT * 0.6;
                        const widMul = 1 - lifeT * 0.35;
                        r.sprite.scale.set(r.baseWidth * widMul, r.baseLength * lenMul, 1);
                        // Sprite position is the midpoint between die and outer tip.
                        const offset = (r.baseLength * lenMul) * 0.5;
                        r.sprite.position.x = die.body.position.x + Math.cos(r.angle) * offset;
                        r.sprite.position.z = die.body.position.z + Math.sin(r.angle) * offset;
                        r.sprite.position.y = die.body.position.y + 0.2;
                        r.material.opacity = lifeT < 0.1
                            ? (lifeT / 0.1) * 0.9
                            : (1 - lifeT) * 0.9;
                    }

                    // Sparkles: scale up, spin, fade.
                    for (let i = sparkles.length - 1; i >= 0; i--) {
                        const s = sparkles[i];
                        s.age += dt * 1000;
                        if (s.age >= sparkleLifetime) {
                            sparkleGroup.remove(s.sprite);
                            s.material.dispose();
                            sparkles.splice(i, 1);
                            continue;
                        }
                        const lifeT = s.age / sparkleLifetime;
                        const scaleMul = 1 + Math.sin(lifeT * Math.PI) * 0.7;
                        s.sprite.scale.setScalar(s.baseSize * scaleMul);
                        s.material.rotation += 3.5 * dt;
                        s.material.opacity = lifeT < 0.15
                            ? (lifeT / 0.15)
                            : 1 - (lifeT - 0.15) / 0.85;
                    }

                    if (!emitting && rays.length === 0 && sparkles.length === 0 && haloOpacity <= 0) {
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
