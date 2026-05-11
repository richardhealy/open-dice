import * as THREE from 'three';

/**
 * Shared procedural sprite textures for particle effects. Generated once on first use
 * and cached on the module — they're tiny canvases, safe to keep around for the page's
 * lifetime.
 *
 * Using a soft radial gradient (instead of a solid disc) is what makes additive-blended
 * particles read as fire/glow rather than as "default Three.js dots". When multiple
 * gradient sprites overlap, their bright cores stack into a hot center while their soft
 * edges feather together — same physics as a real candle flame on a camera sensor.
 */

let firePuffCache = null;
let sparkCache = null;

function makeCanvas(size, drawer) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    drawer(canvas.getContext('2d'), size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
}

/**
 * Bright white-hot center fading through warm yellow to transparent. Intended to be
 * additively blended and tinted at runtime via SpriteMaterial.color.
 */
export function getFirePuffTexture() {
    if (firePuffCache) return firePuffCache;
    firePuffCache = makeCanvas(128, (ctx, size) => {
        const cx = size / 2;
        const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
        g.addColorStop(0.00, 'rgba(255, 255, 255, 1.0)');
        g.addColorStop(0.18, 'rgba(255, 235, 190, 0.95)');
        g.addColorStop(0.45, 'rgba(255, 140, 70, 0.55)');
        g.addColorStop(0.80, 'rgba(180, 40, 0, 0.18)');
        g.addColorStop(1.00, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
    });
    return firePuffCache;
}

/**
 * Tighter highlight with a more pronounced central core — for sparks/embers rather than
 * flame. Sharper falloff so individual particles read as distinct points of light.
 */
export function getSparkTexture() {
    if (sparkCache) return sparkCache;
    sparkCache = makeCanvas(96, (ctx, size) => {
        const cx = size / 2;
        const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
        g.addColorStop(0.00, 'rgba(255, 255, 255, 1.0)');
        g.addColorStop(0.12, 'rgba(255, 240, 200, 0.9)');
        g.addColorStop(0.40, 'rgba(255, 160, 80, 0.4)');
        g.addColorStop(1.00, 'rgba(255, 80, 0, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
    });
    return sparkCache;
}
