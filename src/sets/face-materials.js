import * as THREE from 'three';
import { createFaceTexture, createD4FaceTexture } from '../face-texture.js';
import { CLASSIC, resolveSet } from './index.js';
import { createEdgeMaterial, createFaceMaterial } from './materials.js';
import { paintFace, paintNormalMap, TEXTURE_SIZE } from './face-painter.js';
import { cacheKey, getOrCreateTexture, getTextureAnisotropy } from './texture-cache.js';
import { isNumeralFontReady, ensureNumeralFont } from './fonts/numerals.js';
import { createCanvas } from './canvas-factory.js';

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
    texture.anisotropy = getTextureAnisotropy();
    texture.needsUpdate = true;
    return texture;
}

/** The validator hands the builder an array of decor layers; a hand-built set may still pass one object. */
function decorLayers(set) {
    if (!set.decor) return [];
    return (Array.isArray(set.decor) ? set.decor : [set.decor]).filter(Boolean);
}

/** Emblems in object form; a bare art id string is numeral-coloured and never metal or glowing. */
function emblemObjects(set) {
    return set.emblems ? Object.values(set.emblems).filter((e) => e && typeof e === 'object') : [];
}

/**
 * Every image source a set paints with: the body image, the normal image and the
 * decoration image layers, each once, in that order. Preload these through the roller's
 * `DecalRegistry` so the first paint never shows a fallback.
 */
export function collectSetImages(set) {
    const out = [];
    const add = (spec) => { if (spec && spec.src && !out.includes(spec.src)) out.push(spec.src); };
    add(set.body.image);
    add(set.body.normalImage);
    for (const layer of decorLayers(set)) add(layer.image);
    return out;
}

/**
 * How many of the set's images the registry holds right now. Part of every cache key, so a
 * face painted before its images arrived is never served once they have.
 */
function loadedImageCount(set, decalRegistry) {
    if (!decalRegistry) return 0;
    return collectSetImages(set).filter((src) => !!decalRegistry.get(src)).length;
}

/** MR map: inlay numerals, a metal decor layer (art or image) or a metal emblem; colour layers are dielectric. */
function needsMrMap(set) {
    if (set.numeral.style === 'inlay') return true;
    if (decorLayers(set).some((layer) => !!layer.metal)) return true;
    return emblemObjects(set).some((emblem) => !!emblem.metal);
}

/** Emissive map: glow numerals, a glowing body pattern, a glowing colour layer or a glowing emblem. */
function needsEmissiveMap(set) {
    if (set.numeral.style === 'glow' || set.body.emissive) return true;
    if (decorLayers(set).some((layer) => !layer.metal && layer.glow > 0)) return true;
    return emblemObjects(set).some((emblem) => emblem.glow > 0);
}

const failedImages = new Set();

/** A failed image warns once per source; the fallback painted without it stays. */
function loadImage(decalRegistry, src) {
    return decalRegistry.load(src).catch((err) => {
        if (!failedImages.has(src)) {
            failedImages.add(src);
            console.warn(`open-dice-dnd: image "${src}" failed to load; painting without it.`, err);
        }
        return null;
    });
}

/**
 * Add the generated relief to an image normal map, in place. Both are tangent-space
 * normals encoded as rgb = n * 0.5 + 0.5, so the slopes add (R and G: base + relief - 128)
 * and the depths multiply (B). This is what a `lighter` composite of the two would be if a
 * canvas held signed slopes; drawn literally, `lighter` would double the flat (128, 128, 255)
 * base and lose every slope facing the negative axes.
 * @param {Uint8ClampedArray} base    the image's pixels, RGBA; receives the result
 * @param {Uint8ClampedArray} relief  the generated normal map's pixels, RGBA
 */
export function blendNormalPixels(base, relief) {
    for (let i = 0; i < base.length; i += 4) {
        base[i] = base[i] + relief[i] - 128;
        base[i + 1] = base[i + 1] + relief[i + 1] - 128;
        base[i + 2] = Math.round((base[i + 2] * relief[i + 2]) / 255);
    }
}

/** The image centre-cropped to a square and scaled to the canvas, like a `cover` body image. */
function drawCover(ctx, img, ts) {
    const w = img.width || img.naturalWidth || ts;
    const h = img.height || img.naturalHeight || ts;
    const side = Math.min(w, h);
    ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, ts, ts);
}

/**
 * The normal map for a (set, type): the generated relief (decoration and body texture) as
 * today, or, when the set has a loaded normal image, that image as the base with the
 * generated relief blended over it. `target` repaints an existing canvas (image arrival).
 * Null when nothing applies.
 */
function paintNormalCanvas(set, type, img, target = null) {
    const generated = paintNormalMap({ set, type });
    if (!img) return generated;
    const ts = TEXTURE_SIZE;
    const out = target || createCanvas(ts);
    const ctx = out.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    drawCover(ctx, img, ts);
    if (generated) {
        const base = ctx.getImageData(0, 0, ts, ts);
        const relief = generated.getContext('2d').getImageData(0, 0, ts, ts).data;
        blendNormalPixels(base.data, relief);
        ctx.putImageData(base, 0, 0);
    }
    return out;
}

/**
 * The shared normal texture of a (set, type), cached per images loaded. A normal image still
 * loading is fetched and the texture's canvas repainted when it arrives; without a registry,
 * or when nothing paints a map before the image arrives, the next build picks it up.
 */
function normalTexture(set, type, decalRegistry) {
    const spec = set.body.normalImage;
    const img = spec && decalRegistry ? decalRegistry.get(spec.src) || null : null;
    return getOrCreateTexture(cacheKey([set.id, type, 'normal', `img:${loadedImageCount(set, decalRegistry)}`]), () => {
        const canvas = paintNormalCanvas(set, type, img);
        if (!canvas) return null;
        const texture = canvasTexture(canvas);
        if (spec && !img && decalRegistry) {
            loadImage(decalRegistry, spec.src).then((loaded) => {
                if (!loaded) return;
                paintNormalCanvas(set, type, loaded, canvas);
                texture.needsUpdate = true;
            });
        }
        return texture;
    });
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

/** Albedo (+ MR, + emissive when the set needs them) for one face, cached, decal- and image-aware. */
function faceTextures(set, type, face, isSecret, decals, decalRegistry, textOffsetY) {
    // Faces painted before the embedded font is usable fall back to a system serif; they are
    // keyed apart so the cache never serves them once the font has loaded (review I2), and
    // the load is kicked off here for callers that use createDie() without a roller. Images
    // still loading are keyed apart the same way (img:<n>).
    const fontReady = isNumeralFontReady();
    if (!fontReady) ensureNumeralFont();
    const fk = cacheKey([faceKey(face, isSecret, decals, textOffsetY), fontReady ? 'f1' : 'f0', `img:${loadedImageCount(set, decalRegistry)}`]);
    const modes = ['albedo'];
    if (needsMrMap(set)) modes.push('mr');
    if (needsEmissiveMap(set)) modes.push('emissive');

    const textures = {};
    const canvases = {};
    const pending = new Set();
    for (const mode of modes) {
        textures[mode] = getOrCreateTexture(cacheKey([set.id, type, mode, fk]), () => {
            const result = paintFace({ set, type, face, isSecret, decals, decalRegistry, textOffsetY, mode });
            canvases[mode] = result.canvas;
            result.pendingImages.forEach((src) => pending.add(src));
            return canvasTexture(result.canvas);
        });
    }
    // Body, decoration and decal images still loading: fetch them and repaint every map of
    // this face when they arrive. Without a registry there is nothing to load into, so the
    // fallback stands and nothing is scheduled.
    if (pending.size > 0 && decalRegistry) {
        Promise.all([...pending].map((src) => loadImage(decalRegistry, src))).then((loaded) => {
            if (!loaded.some(Boolean)) return;
            for (const mode of Object.keys(canvases)) {
                paintFace({ set, type, face, isSecret, decals, decalRegistry, textOffsetY, mode, canvas: canvases[mode] });
                textures[mode].needsUpdate = true;
            }
        });
    }
    return { map: textures.albedo, mr: textures.mr || null, emissive: textures.emissive || null };
}

function buildSetMaterials({ set, type, count, faces, isSecret = false, decals = null, decalRegistry = null, textOffsetY = 0 }) {
    const normal = normalTexture(set, type, decalRegistry);
    const blank = set.edge.metal === 'none'
        ? faceTextures(set, type, null, false, null, decalRegistry, 0).map
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
