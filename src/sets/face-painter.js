import { createCanvas, createPath2D } from './canvas-factory.js';
import { FACE_FRAMES, frameRadius, applyFrameTransform } from './face-frame.js';
import { METALS, FAMILY_DEFAULTS } from './materials.js';
import { pattern, hashSeed } from './noise.js';
import { heightToNormal } from './normal-map.js';
import { getDecor } from './decor/index.js';
import { NUMERAL_FONT_FAMILY, NUMERAL_FONT_FALLBACK } from './fonts/numerals.js';
import { drawDecalImage, drawD4CornerDecal, isUnderlined } from '../face-texture.js';
import { hexToRgb, rgbToHex, shade } from './color.js';

/** Same size the classic path uses (calculateTextureSize(...) * 2). */
export const TEXTURE_SIZE = 256;
/** Numeral height as a fraction of the canvas; matches today's ts/3 pt Arial (114 px at 256). */
export const NUMERAL_SIZE = 0.445;
/** d4 corner numeral height; matches today's ts/5 pt (68 px at 256). */
export const CORNER_SIZE = 0.266;
/** d4 corner numerals sit this fraction of the canvas above the centre, as today. */
export const CORNER_OFFSET = 0.3;
/**
 * Body colours are painted this much darker than stated. The table's ambient and key lights
 * (shared with classic dice, so they cannot change) plus the environment lift a physically
 * based albedo by roughly 1.5x; this brings a stated colour back to itself on screen.
 */
export const BODY_EXPOSURE = -0.38;

export { hexToRgb, rgbToHex, shade };

/**
 * Inlay numerals are gilded paint rather than mirror metal: a pure metal has no diffuse
 * response, so gold numerals went dark on every face not catching the key light. Partly
 * metallic and rougher, they keep a gold colour under ambient light and still glint.
 */
export const INLAY_ROUGHNESS = 0.4;
export const INLAY_METALNESS = 0.55;

/** Packed metal-roughness colour: three reads roughness from G and metalness from B. */
export function mrColor(roughness, metalness) {
    return `rgb(0, ${Math.round(roughness * 255)}, ${Math.round(metalness * 255)})`;
}

function fontString(set, px) {
    const family = set.numeral.font === NUMERAL_FONT_FAMILY ? NUMERAL_FONT_FALLBACK : set.numeral.font;
    return `${set.numeral.weight} ${Math.round(px)}px ${family}`;
}

/**
 * The body pattern is seeded per (set, type) and identical on every face, so it is computed
 * once: a canvas of blended colour for the albedo and the raw values for the relief map.
 */
const patternCache = new Map();

function getPattern(set, type) {
    const key = `${set.id}|${type}`;
    let entry = patternCache.get(key);
    if (entry) return entry;
    const ts = TEXTURE_SIZE;
    const { kind, color2, scale, contrast } = set.body.texture;
    const seed = hashSeed(`${set.id}:${type}`);
    const base = hexToRgb(shade(set.body.color, BODY_EXPOSURE));
    const second = hexToRgb(shade(color2, BODY_EXPOSURE));
    const canvas = createCanvas(ts);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(ts, ts);
    const data = img.data;
    const values = new Float32Array(ts * ts);
    for (let y = 0; y < ts; y++) {
        for (let x = 0; x < ts; x++) {
            const v = pattern(kind, seed, x / ts, y / ts, scale);
            const t = v * contrast;
            const i = y * ts + x;
            values[i] = v;
            data[i * 4] = base[0] + (second[0] - base[0]) * t;
            data[i * 4 + 1] = base[1] + (second[1] - base[1]) * t;
            data[i * 4 + 2] = base[2] + (second[2] - base[2]) * t;
            data[i * 4 + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);
    entry = { canvas, values };
    patternCache.set(key, entry);
    return entry;
}

export function clearPatternCache() {
    patternCache.clear();
}

export const _clearPatternCacheForTests = clearPatternCache;

function paintDepth(ctx, ts, set, type) {
    const R = frameRadius(FACE_FRAMES[type], ts);
    const c = ts / 2;
    const depth = ctx.createRadialGradient(c, c, R * 0.15, c, c, R);
    const [r, g, b] = hexToRgb(shade(set.body.depthColor, BODY_EXPOSURE));
    depth.addColorStop(0, 'rgba(0,0,0,0)');
    depth.addColorStop(1, `rgba(${r},${g},${b},0.85)`);
    ctx.fillStyle = depth;
    ctx.fillRect(0, 0, ts, ts);
    // A soft highlight up-left of centre suggests a polished dome.
    const sheen = ctx.createRadialGradient(ts * 0.38, ts * 0.36, 0, ts * 0.38, ts * 0.36, R * 0.55);
    sheen.addColorStop(0, 'rgba(255,255,255,0.08)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, ts, ts);
}

function fillBase(ctx, ts, set, type, mode) {
    if (mode === 'albedo') {
        ctx.fillStyle = shade(set.body.color, BODY_EXPOSURE);
        ctx.fillRect(0, 0, ts, ts);
        if (set.body.texture) ctx.drawImage(getPattern(set, type).canvas, 0, 0);
        if (FAMILY_DEFAULTS[set.family].depthGradient) paintDepth(ctx, ts, set, type);
    } else if (mode === 'mr') {
        ctx.fillStyle = mrColor(set.body.roughness, set.body.metalness);
        ctx.fillRect(0, 0, ts, ts);
    } else {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, ts, ts);
    }
}

/** The validator hands the painter an array of layers; a hand-built set may still pass one object. */
function decorLayers(set) {
    if (!set.decor) return [];
    return Array.isArray(set.decor) ? set.decor : [set.decor];
}

function paintDecor(ctx, ts, set, type, mode) {
    if (mode === 'emissive') return;
    // Metal art layers only for now; colour, glow and image layers arrive with the layer painter.
    for (const layer of decorLayers(set)) {
        if (layer.art && layer.metal) paintMetalArt(ctx, ts, layer, type, mode);
    }
}

function paintMetalArt(ctx, ts, layer, type, mode) {
    const frame = FACE_FRAMES[type];
    const paths = getDecor(layer.art, frame.shape);
    const metal = METALS[layer.metal];
    const colour = mode === 'albedo' ? metal.color
        : mode === 'mr' ? mrColor(metal.roughness, metal.metalness)
        : '#ffffff';
    ctx.save();
    applyFrameTransform(ctx, frame, ts);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const p of paths) {
        const path = createPath2D(p.d);
        if (p.fill) {
            ctx.fillStyle = colour;
            ctx.fill(path);
        } else {
            ctx.strokeStyle = colour;
            ctx.lineWidth = p.stroke;
            ctx.stroke(path);
        }
    }
    if (mode === 'albedo') {
        // A thin darker line down each band gives the flat gold an edge to catch the eye.
        ctx.strokeStyle = shade(metal.color, -0.45);
        ctx.globalAlpha = 0.55;
        for (const p of paths) {
            if (p.fill) continue;
            ctx.lineWidth = p.stroke * 0.25;
            ctx.stroke(createPath2D(p.d));
        }
        ctx.globalAlpha = 1;
    }
    ctx.restore();
}

function drawUnderline(ctx, text, x, y, sizePx, colour) {
    if (!isUnderlined(text)) return;
    const width = ctx.measureText(text).width;
    const underlineY = y + sizePx * 0.37;
    ctx.beginPath();
    ctx.strokeStyle = colour;
    ctx.lineWidth = Math.max(2, sizePx * 0.045);
    ctx.moveTo(x - width / 2, underlineY);
    ctx.lineTo(x + width / 2, underlineY);
    ctx.stroke();
}

/**
 * Draw one numeral (or '?') in the set's style for the given map mode. Height maps never
 * carry numerals; MR maps carry them only for the inlay style; emissive maps only for glow.
 */
export function paintNumeral(ctx, text, { x, y, sizePx, set, mode }) {
    const { style, color } = set.numeral;
    if (mode === 'height') return;
    if (mode === 'mr' && style !== 'inlay') return;
    if (mode === 'emissive' && style !== 'glow') return;
    ctx.save();
    ctx.font = fontString(set, sizePx);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const glyph = (fill, dx = 0, dy = 0) => {
        ctx.fillStyle = fill;
        ctx.fillText(text, x + dx, y + dy);
        drawUnderline(ctx, text, x + dx, y + dy, sizePx, fill);
    };
    if (mode === 'mr') {
        glyph(mrColor(INLAY_ROUGHNESS, INLAY_METALNESS));
    } else if (mode === 'emissive') {
        glyph(set.numeral.glow.color);
    } else if (style === 'engraved') {
        // Light edge low-right, dark edge up-left: reads as a cut under the key light.
        const o = Math.max(1, sizePx * 0.012);
        glyph(shade(color, 0.55), o, o);
        glyph(shade(color, -0.6), -o, -o);
        glyph(color);
    } else if (style === 'inlay') {
        const metal = METALS[set.numeral.metal];
        glyph(shade(metal.color, -0.5), 0, Math.max(1, sizePx * 0.015));
        glyph(metal.color);
    } else if (style === 'glow') {
        glyph(set.numeral.glow.color);
    } else {
        glyph(color);
    }
    ctx.restore();
}

function decalFor(decals, decalRegistry, value, isSecret) {
    if (isSecret || !decals || !value) return { decal: null, image: null };
    const decal = decals[value];
    if (!decal || !decal.src || !decalRegistry) return { decal: null, image: null };
    return { decal, image: decalRegistry.get(decal.src) || null };
}

function paintSingle(ctx, ts, { set, face, isSecret, decals, decalRegistry, textOffsetY, mode }, pending) {
    const value = String(face.text);
    const { decal, image } = decalFor(decals, decalRegistry, value, isSecret);
    if (image) {
        if (mode === 'albedo') drawDecalImage(ctx, image, decal, ts);
        return;
    }
    if (decal) pending.push(decal.src);
    paintNumeral(ctx, isSecret ? '?' : value, {
        x: ts / 2, y: ts / 2 + textOffsetY, sizePx: ts * NUMERAL_SIZE * set.numeral.scale, set, mode,
    });
}

function paintCorners(ctx, ts, { set, face, isSecret, decals, decalRegistry, mode }, pending) {
    ctx.save();
    for (let i = 0; i < face.values.length; i++) {
        const value = String(face.values[i]);
        const { decal, image } = decalFor(decals, decalRegistry, value, isSecret);
        if (image) {
            if (mode === 'albedo') drawD4CornerDecal(ctx, image, decal, ts);
        } else {
            if (decal) pending.push(decal.src);
            paintNumeral(ctx, isSecret ? '?' : value, {
                x: ts / 2, y: ts / 2 - ts * CORNER_OFFSET, sizePx: ts * CORNER_SIZE * set.numeral.scale, set, mode,
            });
        }
        ctx.translate(ts / 2, ts / 2);
        ctx.rotate((Math.PI * 2) / 3);
        ctx.translate(-ts / 2, -ts / 2);
    }
    ctx.restore();
}

/**
 * Paint one face canvas for a set.
 * @param {object} opts
 * @param {object} opts.set           resolved set
 * @param {string} opts.type          die type, for the face frame and the pattern seed
 * @param {object|null} opts.face     { text } | { values: [a, b, c] } | null (blank)
 * @param {'albedo'|'mr'|'emissive'|'height'} [opts.mode='albedo']
 * @param {object} [opts.canvas]      repaint this canvas instead of creating one
 * @returns {{ canvas: object, pendingDecals: string[] }}  decal sources not loaded yet
 */
export function paintFace({ set, type, face, isSecret = false, decals = null, decalRegistry = null, textOffsetY = 0, mode = 'albedo', canvas = null }) {
    const ts = TEXTURE_SIZE;
    const target = canvas || createCanvas(ts);
    const ctx = target.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    fillBase(ctx, ts, set, type, mode);
    paintDecor(ctx, ts, set, type, mode);
    const pending = [];
    if (face && face.values) {
        paintCorners(ctx, ts, { set, face, isSecret, decals, decalRegistry, mode }, pending);
    } else if (face && face.text !== undefined && face.text !== null && String(face.text) !== '') {
        paintSingle(ctx, ts, { set, face, isSecret, decals, decalRegistry, textOffsetY, mode }, pending);
    }
    return { canvas: target, pendingDecals: pending };
}

/**
 * The relief map shared by every face of a (set, type): decoration bands raised by
 * `decor.relief`, body texture raised by `body.normalStrength`. Null when neither applies.
 */
export function paintNormalMap({ set, type }) {
    const ts = TEXTURE_SIZE;
    const relief = decorLayers(set).reduce((max, layer) => Math.max(max, layer.art && layer.metal ? layer.relief : 0), 0);
    const textureStrength = set.body.texture ? set.body.normalStrength : 0;
    if (relief <= 0 && textureStrength <= 0) return null;

    const height = new Uint8ClampedArray(ts * ts);
    if (textureStrength > 0) {
        const { values } = getPattern(set, type);
        for (let i = 0; i < ts * ts; i++) height[i] = values[i] * textureStrength * 160;
    }
    if (relief > 0) {
        const { canvas } = paintFace({ set, type, face: null, mode: 'height' });
        const ctx = canvas.getContext('2d');
        if ('filter' in ctx) {
            // Soften the band edges so the relief reads as a rounded bevel, not a cliff.
            ctx.filter = 'blur(1.5px)';
            ctx.drawImage(canvas, 0, 0);
            ctx.filter = 'none';
        }
        const data = ctx.getImageData(0, 0, ts, ts).data;
        for (let i = 0; i < ts * ts; i++) height[i] = Math.min(255, height[i] + data[i * 4] * relief);
    }

    const pixels = heightToNormal(height, ts, ts, 2.5);
    const out = createCanvas(ts);
    const octx = out.getContext('2d');
    const img = octx.createImageData(ts, ts);
    img.data.set(pixels);
    octx.putImageData(img, 0, 0);
    return out;
}
