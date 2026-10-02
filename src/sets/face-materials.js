import * as THREE from 'three';
import { createFaceTexture, createD4FaceTexture } from '../face-texture.js';
import { CLASSIC, resolveSet } from './index.js';
import { createEdgeMaterial, createFaceMaterial } from './materials.js';
import { paintFace, paintNormalMap } from './face-painter.js';
import { cacheKey, getOrCreateTexture } from './texture-cache.js';
import { isNumeralFontReady, ensureNumeralFont } from './fonts/numerals.js';

/** One material for every slot of a die that is never rendered (prediction bodies). */
export const PLACEHOLDER_MATERIAL = new THREE.MeshBasicMaterial({ color: 0x808080 });

export function materialCount(geometry) {
    let max = 0;
    for (const group of geometry.groups) max = Math.max(max, group.materialIndex);
    return max + 1;
}

function applyTuning(texture, tuning) {
    if (!tuning) return texture;
    if (tuning.flipY !== undefined) texture.flipY = tuning.flipY;
    if (tuning.generateMipmaps !== undefined) texture.generateMipmaps = tuning.generateMipmaps;
    if (tuning.linearFilter) {
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
    }
    if (tuning.clamp) {
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
    }
    return texture;
}

/** Everything about a face that changes its painting, as a cache key fragment. */
function faceKey(face, isSecret, decals, textOffsetY) {
    const text = face && face.text !== undefined && face.text !== null ? String(face.text) : '';
    const values = face && face.values ? face.values.join(',') : '';
    let decalPart = '';
    if (decals && !isSecret) {
        const keys = face && face.values ? face.values.map(String) : [text];
        decalPart = keys
            .filter((k) => k && decals[k] && decals[k].src)
            .map((k) => `${k}=${JSON.stringify(decals[k])}`)
            .join(',');
    }
    return cacheKey([text, values, isSecret ? 1 : 0, decalPart, textOffsetY]);
}

function canvasTexture(canvas) {
    const texture = new THREE.Texture(canvas);
    texture.needsUpdate = true;
    return texture;
}

/**
 * Classic paints one texture per slot per die, exactly as before dice sets: it is a fill
 * and a fillText, and caching it by colour would pin a texture for every colour pair a
 * table of players ever rolls (review I3).
 */
function buildClassicMaterials({ type, count, faces, colors, isSecret = false, decals = null, decalRegistry = null, textOffsetY = 0, textureTuning }) {
    const materials = [];
    for (let i = 0; i < count; i++) {
        const face = faces[i] || null;
        let texture;
        if (face && face.values) {
            texture = createD4FaceTexture({
                values: face.values, textColor: colors.textColor, backgroundColor: colors.backgroundColor, decals, decalRegistry,
            });
        } else {
            const text = face && face.text !== undefined && face.text !== null ? String(face.text) : '';
            const decal = (text && decals) ? decals[text] : null;
            texture = createFaceTexture({
                text, textColor: colors.textColor, backgroundColor: colors.backgroundColor, decal, decalRegistry, isSecret, textOffsetY,
            });
        }
        applyTuning(texture, textureTuning);
        materials.push(new THREE.MeshPhongMaterial({
            specular: 0x172022,
            color: colors.diceColor,
            shininess: 40,
            flatShading: true,
            map: texture,
        }));
    }
    return materials;
}

/** Albedo (+ MR, + emissive when the set needs them) for one face, cached and decal-aware. */
function faceTextures(set, type, face, isSecret, decals, decalRegistry, textOffsetY) {
    // Faces painted before the embedded font is usable fall back to a system serif; they are
    // keyed apart so the cache never serves them once the font has loaded (review I2), and
    // the load is kicked off here for callers that use createDie() without a roller.
    const fontReady = isNumeralFontReady();
    if (!fontReady) ensureNumeralFont();
    const fk = cacheKey([faceKey(face, isSecret, decals, textOffsetY), fontReady ? 'f1' : 'f0']);
    const modes = ['albedo'];
    if (set.numeral.style === 'inlay' || set.decor) modes.push('mr');
    if (set.numeral.style === 'glow') modes.push('emissive');

    const textures = {};
    const canvases = {};
    const pending = new Set();
    for (const mode of modes) {
        textures[mode] = getOrCreateTexture(cacheKey([set.id, type, mode, fk]), () => {
            const result = paintFace({ set, type, face, isSecret, decals, decalRegistry, textOffsetY, mode });
            canvases[mode] = result.canvas;
            result.pendingDecals.forEach((src) => pending.add(src));
            return canvasTexture(result.canvas);
        });
    }
    if (pending.size > 0 && decalRegistry) {
        Promise.all([...pending].map((src) => decalRegistry.load(src).catch(() => null))).then(() => {
            for (const mode of Object.keys(canvases)) {
                paintFace({ set, type, face, isSecret, decals, decalRegistry, textOffsetY, mode, canvas: canvases[mode] });
                textures[mode].needsUpdate = true;
            }
        });
    }
    return { map: textures.albedo, mr: textures.mr || null, emissive: textures.emissive || null };
}

function buildSetMaterials({ set, type, count, faces, isSecret = false, decals = null, decalRegistry = null, textOffsetY = 0 }) {
    const normal = getOrCreateTexture(cacheKey([set.id, type, 'normal']), () => {
        const canvas = paintNormalMap({ set, type });
        return canvas ? canvasTexture(canvas) : null;
    });
    const blank = set.edge.metal === 'none'
        ? faceTextures(set, type, null, false, null, null, 0).map
        : null;
    const materials = [createEdgeMaterial(set, blank)];
    for (let i = 1; i < count; i++) {
        const maps = faceTextures(set, type, faces[i] || null, isSecret, decals, decalRegistry, textOffsetY);
        materials.push(createFaceMaterial(set, { ...maps, normal }));
    }
    return materials;
}

/**
 * Build the material array for a die. `faces[i]` is `{ text }`, `{ values }` or null per
 * material index; `set` is an id, a resolved set, or undefined for classic; `visible: false`
 * returns placeholders without painting. See spec section 4.
 */
export function buildFaceMaterials(options) {
    const { geometry, visible = true } = options;
    const count = materialCount(geometry);
    if (!visible) return new Array(count).fill(PLACEHOLDER_MATERIAL);
    const set = resolveSet(options.set);
    if (set.id === CLASSIC) return buildClassicMaterials({ ...options, count });
    return buildSetMaterials({ ...options, set, count });
}
