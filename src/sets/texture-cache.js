/**
 * Module-level cache of painted face textures. Textures are plain THREE.Texture objects
 * wrapping canvases; sharing one across meshes and renderers is safe (each renderer
 * uploads its own copy). Keyed by set id, die type, map kind and the face description.
 */
import { clearPatternCache, clearPatternCacheFor } from './face-painter.js';

const cache = new Map();
let anisotropy = 1;

/** Anisotropic filtering level for set textures; DiceRoller sets the renderer's maximum. */
export function setTextureAnisotropy(value) {
    anisotropy = Math.max(1, Math.floor(Number(value) || 1));
}

export function getTextureAnisotropy() {
    return anisotropy;
}

export function cacheKey(parts) {
    return parts.map((p) => (p === undefined || p === null ? '' : String(p))).join('|');
}

export function getOrCreateTexture(key, create) {
    let texture = cache.get(key);
    if (!texture) {
        texture = create();
        cache.set(key, texture);
    }
    return texture;
}

/** Dispose every cached texture. Dice still on screen re-upload theirs on the next frame. */
export function clearDiceSetCaches() {
    for (const texture of cache.values()) {
        if (texture && typeof texture.dispose === 'function') texture.dispose();
    }
    cache.clear();
    clearPatternCache();
}

/** Dispose and forget every cached texture of one set, so a replaced definition repaints. */
export function evictSetTextures(id) {
    for (const [key, texture] of [...cache.entries()]) {
        if (!key.startsWith(`${id}|`)) continue;
        if (texture && typeof texture.dispose === 'function') texture.dispose();
        cache.delete(key);
    }
    clearPatternCacheFor(id);
}

export function cacheSize() {
    return cache.size;
}
