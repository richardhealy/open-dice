import { createCanvas, createPath2D } from './canvas-factory.js';
import { FACE_FRAMES, frameRadius, applyFrameTransform, frameEdges } from './face-frame.js';
import { METALS, FAMILY_DEFAULTS } from './materials.js';
import { pattern, hashSeed } from './noise.js';
import { pourPixels, circuitMask, feltPixels } from './patterns.js';
import { heightToNormal } from './normal-map.js';
import { getDecor } from './decor/index.js';
import { getEmblem } from './decor/emblems.js';
import { fontStack } from './fonts/numerals.js';
import { drawDecalImage, drawD4CornerDecal, isUnderlined } from '../face-texture.js';
import { hexToRgb, rgbToHex, shade, mrColor, scaleColor } from './color.js';

/** Same size the classic path uses (calculateTextureSize(...) * 2). */
export const TEXTURE_SIZE = 256;
/** Numeral height as a fraction of the canvas; matches today's ts/3 pt Arial (114 px at 256). */
export const NUMERAL_SIZE = 0.445;
/** d4 corner numeral height; matches today's ts/5 pt (68 px at 256). */
export const CORNER_SIZE = 0.266;
/** d4 corner numerals sit this fraction of the canvas above the centre, as today. */
export const CORNER_OFFSET = 0.3;
/** A numeral is never shrunk below this fraction of its design size to fit a face. */
export const MIN_FIT = 0.5;
/**
 * Clearance kept between a numeral's box and the face edge, as a fraction of the face's
 * circumradius: more where a decoration band runs along the edge, less for the d4's corner
 * numerals, which sit in the corners by design.
 */
export const FIT_MARGIN = Object.freeze({ band: 0.1, plain: 0.06, corner: 0.04 });
/**
 * Body colours are painted this much darker than stated. The table's ambient and key lights
 * (shared with classic dice, so they cannot change) plus the environment lift a physically
 * based albedo by roughly 1.5x; this brings a stated colour back to itself on screen.
 */
export const BODY_EXPOSURE = -0.38;

export { hexToRgb, rgbToHex, shade, mrColor, scaleColor };

/**
 * Inlay numerals are gilded paint rather than mirror metal: a pure metal has no diffuse
 * response, so gold numerals went dark on every face not catching the key light. Partly
 * metallic and rougher, they keep a gold colour under ambient light and still glint.
 */
export const INLAY_ROUGHNESS = 0.4;
export const INLAY_METALNESS = 0.55;

/** Default vignette for the polished families when a hand-built set leaves it out. */
const POLISHED_VIGNETTE = 0.85;
const DEFAULT_LAYER_RELIEF = 0.6;
const DEFAULT_EMBLEM_RELIEF = 0.5;
const DEFAULT_EMBLEM_SCALE = 0.8;

const exposed = (hex) => shade(hex, BODY_EXPOSURE);

function fontString(set, px) {
    return `${set.numeral.weight} ${Math.round(px)}px ${fontStack(set.numeral.font)}`;
}

const warned = new Set();

/** Unknown art ids never throw at roll time: warn once and paint without them. */
function warnOnce(key, message) {
    if (warned.has(key)) return;
    warned.add(key);
    console.warn(message);
}

function decorPaths(art, shape) {
    try {
        return getDecor(art, shape);
    } catch (err) {
        warnOnce(`decor:${art}`, `${err.message}; painting without it.`);
        return [];
    }
}

function emblemPaths(id) {
    try {
        return getEmblem(id);
    } catch (err) {
        warnOnce(`emblem:${id}`, `${err.message}; painting the numeral instead.`);
        return null;
    }
}

/**
 * The body pattern is seeded per (set, type) and identical on every face, so it is computed
 * once: a canvas of blended colour for the albedo and the raw values for the relief map.
 * With `perFace` the face key (text or corner values) joins the seed and the cache key, so
 * every face differs and a repaint of the same face is stable.
 */
const patternCache = new Map();

/** The part of a face that seeds a per-face pattern: its text, or the d4 corner values. */
function faceSeedKey(face) {
    if (!face) return '';
    if (face.values) return face.values.map(String).join(',');
    return face.text === undefined || face.text === null ? '' : String(face.text);
}

function getPattern(set, type, faceKey = '') {
    const perFace = !!set.body.texture.perFace && faceKey !== '';
    const key = perFace ? `${set.id}|${type}|${faceKey}` : `${set.id}|${type}`;
    let entry = patternCache.get(key);
    if (entry) return entry;
    const seed = hashSeed(perFace ? `${set.id}:${type}:${faceKey}` : `${set.id}:${type}`);
    entry = buildPattern(set, seed);
    patternCache.set(key, entry);
    return entry;
}

function writeRgb(data, rgb) {
    for (let i = 0, j = 0; j < rgb.length; i += 4, j += 3) {
        data[i] = rgb[j];
        data[i + 1] = rgb[j + 1];
        data[i + 2] = rgb[j + 2];
        data[i + 3] = 255;
    }
}

/**
 * One pattern: the albedo canvas, the scalar value per pixel for the relief, and for circuit
 * the trace mask. `emissive` caches the lit-mask canvas per colour (see emissiveMask).
 */
function buildPattern(set, seed) {
    const ts = TEXTURE_SIZE;
    const t = set.body.texture;
    const canvas = createCanvas(ts);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(ts, ts);
    const data = img.data;
    let values;
    let mask = null;
    if (t.kind === 'pour') {
        const lacing = t.lacing ? { color: exposed(t.lacing.color), width: t.lacing.width } : null;
        const out = pourPixels({ seed, size: ts, palette: t.palette.map(exposed), warp: t.warp, scale: t.scale, lacing });
        values = out.value;
        writeRgb(data, out.rgb);
    } else if (t.kind === 'felt') {
        const color2 = t.color2 || shade(set.body.color, -0.35);
        const out = feltPixels({ seed, size: ts, color: exposed(set.body.color), color2: exposed(color2), contrast: t.contrast });
        values = out.value;
        writeRgb(data, out.rgb);
    } else if (t.kind === 'circuit') {
        mask = circuitMask({ seed, size: ts, grid: t.grid, density: t.density }).mask;
        values = new Float32Array(ts * ts);
        const base = hexToRgb(exposed(set.body.color));
        const second = hexToRgb(exposed(t.color2));
        const contrast = t.contrast ?? 0.6;
        for (let i = 0; i < ts * ts; i++) {
            const on = mask[i] ? 1 : 0;
            values[i] = on;
            const k = on * contrast;
            data[i * 4] = base[0] + (second[0] - base[0]) * k;
            data[i * 4 + 1] = base[1] + (second[1] - base[1]) * k;
            data[i * 4 + 2] = base[2] + (second[2] - base[2]) * k;
            data[i * 4 + 3] = 255;
        }
    } else {
        const { kind, color2, scale, contrast } = t;
        const base = hexToRgb(exposed(set.body.color));
        const second = hexToRgb(exposed(color2));
        values = new Float32Array(ts * ts);
        for (let y = 0; y < ts; y++) {
            for (let x = 0; x < ts; x++) {
                const v = pattern(kind, seed, x / ts, y / ts, scale);
                const k = v * contrast;
                const i = y * ts + x;
                values[i] = v;
                data[i * 4] = base[0] + (second[0] - base[0]) * k;
                data[i * 4 + 1] = base[1] + (second[1] - base[1]) * k;
                data[i * 4 + 2] = base[2] + (second[2] - base[2]) * k;
                data[i * 4 + 3] = 255;
            }
        }
    }
    ctx.putImageData(img, 0, 0);
    return { canvas, values, mask, emissive: new Map() };
}

/**
 * The pattern's glow mask painted in one colour over black: circuit traces, or wherever any
 * other kind's value exceeds 0.5. Cached per colour on the pattern entry so every face of a
 * type draws the same canvas.
 */
function emissiveMask(entry, colour) {
    let canvas = entry.emissive.get(colour);
    if (canvas) return canvas;
    const ts = TEXTURE_SIZE;
    canvas = createCanvas(ts);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(ts, ts);
    const data = img.data;
    const [r, g, b] = hexToRgb(colour);
    for (let i = 0; i < ts * ts; i++) {
        const lit = entry.mask ? entry.mask[i] > 0 : entry.values[i] > 0.5;
        if (lit) {
            data[i * 4] = r;
            data[i * 4 + 1] = g;
            data[i * 4 + 2] = b;
        }
        data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    entry.emissive.set(colour, canvas);
    return canvas;
}

/** Alpha-filled copies of decoration images, per image and fill colour, shared by every face. */
let imageFills = new WeakMap();

/** Drop the cached patterns of one set (its definition was replaced or removed). */
export function clearPatternCacheFor(id) {
    for (const key of [...patternCache.keys()]) if (key.startsWith(`${id}|`)) patternCache.delete(key);
}

export function clearPatternCache() {
    patternCache.clear();
    imageFills = new WeakMap();
}

export const _clearPatternCacheForTests = clearPatternCache;

/** The validator hands the painter an array of layers; a hand-built set may still pass one object. */
function decorLayers(set) {
    if (!set.decor) return [];
    return (Array.isArray(set.decor) ? set.decor : [set.decor]).filter(Boolean);
}

function emblemList(set) {
    return set.emblems ? Object.values(set.emblems).filter(Boolean) : [];
}

const layerRelief = (layer) => layer.relief ?? DEFAULT_LAYER_RELIEF;
const emblemRelief = (emblem) => (typeof emblem === 'string' ? DEFAULT_EMBLEM_RELIEF : emblem.relief ?? DEFAULT_EMBLEM_RELIEF);
/** Only a colour layer glows; metal never does. */
const layerGlow = (layer) => (layer.metal ? 0 : layer.glow ?? 0);

/**
 * One material has one emissiveIntensity, so every glowing layer is painted relative to the
 * brightest: numerals, the body's pattern glow, or a glowing decoration or emblem. 1 when
 * nothing glows, so emissive maps keep today's scale.
 */
export function materialEmissiveIntensity(set) {
    let max = Math.max(set.numeral.glow?.intensity ?? 0, set.body.emissive?.intensity ?? 0);
    for (const layer of decorLayers(set)) max = Math.max(max, layerGlow(layer));
    for (const emblem of emblemList(set)) if (typeof emblem === 'object') max = Math.max(max, emblem.glow ?? 0);
    return max || 1;
}

/**
 * Height maps are painted white at the strongest relief and darker for weaker layers; the
 * normal-map builder multiplies the result by this value so every layer lands at its own
 * relief.
 */
function reliefScale(set) {
    let max = 0;
    for (const layer of decorLayers(set)) max = Math.max(max, layerRelief(layer));
    for (const emblem of emblemList(set)) max = Math.max(max, emblemRelief(emblem));
    return max;
}

const reliefWhite = (relief, maxRelief) => scaleColor('#ffffff', maxRelief > 0 ? relief / maxRelief : 1);

function vignetteOf(set) {
    if (set.body.vignette != null) return set.body.vignette;
    return FAMILY_DEFAULTS[set.family]?.depthGradient ? POLISHED_VIGNETTE : 0;
}

/** Radial darkening toward the face edge in the depth colour, as strong as `amount`. */
function paintVignette(ctx, ts, set, type, amount) {
    const R = frameRadius(FACE_FRAMES[type], ts);
    const c = ts / 2;
    const depth = ctx.createRadialGradient(c, c, R * 0.15, c, c, R);
    const [r, g, b] = hexToRgb(exposed(set.body.depthColor || set.body.color));
    depth.addColorStop(0, 'rgba(0,0,0,0)');
    depth.addColorStop(1, `rgba(${r},${g},${b},${amount})`);
    ctx.fillStyle = depth;
    ctx.fillRect(0, 0, ts, ts);
}

/** A soft highlight up-left of centre suggests a polished dome (gem and glass only). */
function paintSheen(ctx, ts, type) {
    const R = frameRadius(FACE_FRAMES[type], ts);
    const sheen = ctx.createRadialGradient(ts * 0.38, ts * 0.36, 0, ts * 0.38, ts * 0.36, R * 0.55);
    sheen.addColorStop(0, 'rgba(255,255,255,0.08)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, ts, ts);
}

/**
 * The body image as the albedo base: `cover` crops the centre to the canvas aspect and scales
 * it to the canvas; `tile` repeats a tile of size / scale through createPattern.
 */
function drawBodyImage(ctx, ts, img, spec) {
    if (spec.fit === 'tile') {
        const side = Math.max(1, Math.round(ts / (spec.scale || 1)));
        const tile = createCanvas(side);
        tile.getContext('2d').drawImage(img, 0, 0, side, side);
        ctx.fillStyle = ctx.createPattern(tile, 'repeat');
        ctx.fillRect(0, 0, ts, ts);
        return;
    }
    const w = img.width || img.naturalWidth || ts;
    const h = img.height || img.naturalHeight || ts;
    const side = Math.min(w, h);
    ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, ts, ts);
}

function fillBase(ctx, ts, set, type, face, mode, lookup, intensity) {
    if (mode === 'albedo') {
        ctx.fillStyle = exposed(set.body.color);
        ctx.fillRect(0, 0, ts, ts);
        const image = set.body.image ? lookup(set.body.image.src) : null;
        if (image) drawBodyImage(ctx, ts, image, set.body.image);
        else if (set.body.texture) ctx.drawImage(getPattern(set, type, faceSeedKey(face)).canvas, 0, 0);
        const vignette = vignetteOf(set);
        if (vignette > 0) paintVignette(ctx, ts, set, type, vignette);
        if (FAMILY_DEFAULTS[set.family]?.depthGradient) paintSheen(ctx, ts, type);
    } else if (mode === 'mr') {
        ctx.fillStyle = mrColor(set.body.roughness, set.body.metalness);
        ctx.fillRect(0, 0, ts, ts);
    } else {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, ts, ts);
        if (mode === 'emissive' && set.body.emissive && set.body.texture) {
            const colour = scaleColor(set.body.emissive.color, set.body.emissive.intensity / intensity);
            ctx.drawImage(emissiveMask(getPattern(set, type, faceSeedKey(face)), colour), 0, 0);
        }
    }
}

function paintDecor(ctx, ts, set, type, mode, lookup, maxRelief, intensity) {
    for (const layer of decorLayers(set)) {
        if (layer.image) paintImageLayer(ctx, ts, layer, mode, lookup, maxRelief, intensity);
        else if (layer.art && layer.metal) { if (mode !== 'emissive') paintMetalArt(ctx, ts, layer, type, mode, maxRelief); }   // metal never glows
        else if (layer.art) paintColourArt(ctx, ts, layer, type, mode, maxRelief, intensity);
    }
}

function applyLayerScale(ctx, layer) {
    const s = layer.scale ?? 1;
    if (s !== 1) ctx.scale(s, s);
}

/** Fill or stroke every path of an art in one colour; fills honour an even-odd rule. */
function paintPaths(ctx, paths, colour) {
    for (const p of paths) {
        const path = createPath2D(p.d);
        if (p.fill) {
            ctx.fillStyle = colour;
            if (p.rule) ctx.fill(path, p.rule);
            else ctx.fill(path);
        } else {
            ctx.strokeStyle = colour;
            ctx.lineWidth = p.stroke;
            ctx.stroke(path);
        }
    }
}

function paintMetalArt(ctx, ts, layer, type, mode, maxRelief) {
    const frame = FACE_FRAMES[type];
    const paths = decorPaths(layer.art, frame.shape);
    const metal = METALS[layer.metal];
    const colour = mode === 'albedo' ? metal.color
        : mode === 'mr' ? mrColor(metal.roughness, metal.metalness)
        : reliefWhite(layerRelief(layer), maxRelief);
    ctx.save();
    applyFrameTransform(ctx, frame, ts);
    applyLayerScale(ctx, layer);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    paintPaths(ctx, paths, colour);
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

/** A flat-colour art layer: dielectric, so the MR map is untouched; glows when asked. */
function paintColourArt(ctx, ts, layer, type, mode, maxRelief, intensity) {
    let colour;
    if (mode === 'albedo') colour = layer.color;
    else if (mode === 'height') colour = reliefWhite(layerRelief(layer), maxRelief);
    else if (mode === 'emissive' && layerGlow(layer) > 0) colour = scaleColor(layer.color, layerGlow(layer) / intensity);
    else return;
    const frame = FACE_FRAMES[type];
    const paths = decorPaths(layer.art, frame.shape);
    ctx.save();
    applyFrameTransform(ctx, frame, ts);
    applyLayerScale(ctx, layer);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    paintPaths(ctx, paths, colour);
    ctx.restore();
}

/** The image's alpha filled with one colour, cached per image and colour. */
function alphaFill(img, ts, fill) {
    let fills = imageFills.get(img);
    if (!fills) {
        fills = new Map();
        imageFills.set(img, fills);
    }
    let scratch = fills.get(fill);
    if (scratch) return scratch;
    scratch = createCanvas(ts);
    const sctx = scratch.getContext('2d');
    sctx.fillStyle = fill;
    sctx.fillRect(0, 0, ts, ts);
    sctx.globalCompositeOperation = 'destination-in';
    sctx.drawImage(img, 0, 0, ts, ts);
    fills.set(fill, scratch);
    return scratch;
}

/**
 * An alpha PNG covering the whole canvas. Metal layers draw the image as supplied in the
 * albedo and fill its alpha with the metal in the MR map; colour layers fill the alpha with
 * their colour (and glow with it). Height maps take the alpha as relief.
 */
function paintImageLayer(ctx, ts, layer, mode, lookup, maxRelief, intensity) {
    const metal = layer.metal ? METALS[layer.metal] : null;
    let fill = null;
    if (mode === 'albedo') {
        if (!metal) fill = layer.color;
    } else if (mode === 'mr') {
        if (!metal) return;
        fill = mrColor(metal.roughness, metal.metalness);
    } else if (mode === 'height') {
        fill = reliefWhite(layerRelief(layer), maxRelief);
    } else {
        if (!(layerGlow(layer) > 0)) return;
        fill = scaleColor(layer.color, layerGlow(layer) / intensity);
    }
    const img = lookup(layer.image.src);
    if (!img) return;
    if (fill === null) ctx.drawImage(img, 0, 0, ts, ts);
    else ctx.drawImage(alphaFill(img, ts, fill), 0, 0);
}

/** True when a decoration layer actually paints a band on this face shape. */
function hasBandOn(set, type) {
    const shape = FACE_FRAMES[type].shape;
    return decorLayers(set).some((layer) => (layer.image ? shape !== 'kite' : decorPaths(layer.art, shape).length > 0));
}

/**
 * Largest font size, at most `basePx` and at least `basePx * MIN_FIT`, at which the numeral's
 * box fits inside the face polygon less a margin. Faces differ hugely in texture space (a
 * d12 pentagon is far smaller than a d20 triangle, the d100 tens faces carry two digits) and
 * the serif digits are wider than classic Arial, so a single size overflowed some faces. The
 * box is the measured ink extent (actualBoundingBox* where the browser reports it), widened
 * for the 6/9 underline, the outline and the engraved or inlay offsets. Glyph metrics scale
 * linearly with the font size, so one measurement at `basePx` gives the closed-form scale.
 */
export function fitNumeralSize({ ctx, text, set, type, basePx, x, y, ts, corner = false }) {
    const frame = FACE_FRAMES[type];
    if (!frame || !ctx || typeof ctx.measureText !== 'function') return basePx;
    ctx.save();
    ctx.font = fontString(set, basePx);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const m = ctx.measureText(text) || {};
    ctx.restore();
    const finite = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const width = finite(m.width) ?? basePx * 0.62 * String(text).length;
    let left = finite(m.actualBoundingBoxLeft) ?? width / 2;
    let right = finite(m.actualBoundingBoxRight) ?? width / 2;
    const ascent = finite(m.actualBoundingBoxAscent) ?? basePx * 0.36;
    let descent = finite(m.actualBoundingBoxDescent) ?? basePx * 0.36;
    if (isUnderlined(text)) {
        descent = Math.max(descent, basePx * 0.37 + Math.max(2, basePx * 0.045) / 2);
        left = Math.max(left, width / 2);
        right = Math.max(right, width / 2);
    }
    const style = set.numeral.style;
    let pad = set.numeral.outline ? (set.numeral.outline.width * basePx) / 2 : 0;
    if (style === 'engraved' || style === 'inlay') pad += Math.max(1, basePx * 0.015);
    const box = [[-left - pad, -ascent - pad], [right + pad, -ascent - pad], [right + pad, descent + pad], [-left - pad, descent + pad]];
    const margin = frameRadius(frame, ts) * (corner ? FIT_MARGIN.corner : hasBandOn(set, type) ? FIT_MARGIN.band : FIT_MARGIN.plain);
    let scale = 1;
    for (const { n, h } of frameEdges(frame, ts)) {
        const room = h - margin - (n[0] * x + n[1] * y);
        if (room <= 0) return basePx * MIN_FIT;
        for (const [bx, by] of box) {
            const reach = n[0] * bx + n[1] * by;
            if (reach > 0) scale = Math.min(scale, room / reach);
        }
    }
    return basePx * Math.max(MIN_FIT, Math.min(1, scale));
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
 * carry numerals; MR maps carry them only for the inlay style; emissive maps only for glow,
 * scaled to the material's intensity (`intensity`, defaulting to the set's).
 */
export function paintNumeral(ctx, text, { x, y, sizePx, set, mode, intensity, fit = null }) {
    const { style, color } = set.numeral;
    if (mode === 'height') return;
    if (mode === 'mr' && style !== 'inlay') return;
    if (mode === 'emissive' && style !== 'glow') return;
    if (fit) sizePx = fitNumeralSize({ ctx, text, set, type: fit.type, basePx: sizePx, x, y, ts: fit.ts, corner: fit.corner });
    ctx.save();
    ctx.font = fontString(set, sizePx);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const glyph = (fill, dx = 0, dy = 0) => {
        ctx.fillStyle = fill;
        ctx.fillText(text, x + dx, y + dy);
        drawUnderline(ctx, text, x + dx, y + dy, sizePx, fill);
    };
    if (mode === 'albedo' && set.numeral.outline) {
        // Stroked first so the glyph sits on top of a contrasting rim (busy or light bodies).
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.round(sizePx * set.numeral.outline.width * 100) / 100;
        ctx.strokeStyle = set.numeral.outline.color;
        ctx.strokeText(text, x, y);
    }
    if (mode === 'mr') {
        glyph(mrColor(INLAY_ROUGHNESS, INLAY_METALNESS));
    } else if (mode === 'emissive') {
        const material = intensity ?? materialEmissiveIntensity(set);
        glyph(scaleColor(set.numeral.glow.color, (set.numeral.glow.intensity ?? 1) / material));
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

/**
 * The emblem for a face value in canonical form `{ art, metal, color, scale, relief }`, or
 * null. A bare art id means the numeral colour at the default scale. The d100 pair never
 * carries one: a percentile roll is read from two faces, and an emblem on either would hide
 * a digit (a host's decal can still replace a face there, per roll).
 */
export function faceEmblem(set, value, type = null) {
    if (!set.emblems || value === undefined || value === null || type === 'd100') return null;
    const emblem = set.emblems[String(value)];
    if (!emblem) return null;
    if (typeof emblem === 'string') {
        return { art: emblem, metal: null, color: set.numeral.color, scale: DEFAULT_EMBLEM_SCALE, relief: DEFAULT_EMBLEM_RELIEF };
    }
    return emblem;
}

/** The strongest relief among the emblems on a face (its text, or each d4 corner); 0 when none. */
export function faceEmblemRelief(set, type, face) {
    if (!face || !set.emblems) return 0;
    let max = 0;
    for (const value of face.values ? face.values : [face.text]) {
        const emblem = faceEmblem(set, value, type);
        if (emblem) max = Math.max(max, emblemRelief(emblem));
    }
    return max;
}

/**
 * Paint an emblem in place of a numeral: path art in a unit circle, placed through
 * translate(centre) · scale(radius · scale · 0.5) with y up like the decor frame.
 */
function paintEmblem(ctx, ts, emblem, paths, set, mode, { x, y, radius }, maxRelief, intensity) {
    const metal = emblem.metal ? METALS[emblem.metal] : null;
    const flat = emblem.color ?? set.numeral.color;
    let colour;
    if (mode === 'albedo') colour = metal ? metal.color : flat;
    else if (mode === 'mr') {
        if (!metal) return;
        colour = mrColor(metal.roughness, metal.metalness);
    } else if (mode === 'height') colour = reliefWhite(emblemRelief(emblem), maxRelief);
    else {
        if (!(emblem.glow > 0)) return;
        colour = scaleColor(metal ? metal.color : flat, emblem.glow / intensity);
    }
    const k = radius * (emblem.scale ?? DEFAULT_EMBLEM_SCALE) * 0.5;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, -k);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    paintPaths(ctx, paths, colour);
    ctx.restore();
}

function decalFor(decals, decalRegistry, value, isSecret) {
    if (isSecret || !decals || !value) return { decal: null, image: null };
    const decal = decals[value];
    if (!decal || !decal.src || !decalRegistry) return { decal: null, image: null };
    return { decal, image: decalRegistry.get(decal.src) || null };
}

/**
 * One face value: a loaded decal, else the set's emblem for that value, else the numeral.
 * `radius` is the face circumradius the emblem is sized against.
 */
function paintValue(ctx, ts, value, { set, type, isSecret, decals, decalRegistry, mode, maxRelief, intensity }, pending, place, drawDecal) {
    const { decal, image } = decalFor(decals, decalRegistry, value, isSecret);
    if (image) {
        if (mode === 'albedo') drawDecal(image, decal);
        return;
    }
    if (decal) pending.push(decal.src);
    const emblem = isSecret ? null : faceEmblem(set, value, type);
    const paths = emblem ? emblemPaths(emblem.art) : null;
    if (paths && paths.length) {
        paintEmblem(ctx, ts, emblem, paths, set, mode, place, maxRelief, intensity);
        return;
    }
    paintNumeral(ctx, isSecret ? '?' : value, { x: place.x, y: place.y, sizePx: place.sizePx, set, mode, intensity, fit: { type, ts, corner: !!place.corner } });
}

function paintSingle(ctx, ts, opts, pending) {
    const { set, face, textOffsetY, type } = opts;
    const value = String(face.text);
    const place = { x: ts / 2, y: ts / 2 + textOffsetY, sizePx: ts * NUMERAL_SIZE * set.numeral.scale, radius: frameRadius(FACE_FRAMES[type], ts) };
    paintValue(ctx, ts, value, opts, pending, place, (image, decal) => drawDecalImage(ctx, image, decal, ts));
}

function paintCorners(ctx, ts, opts, pending) {
    const { set, face, type } = opts;
    const place = {
        x: ts / 2, y: ts / 2 - ts * CORNER_OFFSET, sizePx: ts * CORNER_SIZE * set.numeral.scale,
        radius: frameRadius(FACE_FRAMES[type], ts) * (CORNER_SIZE / NUMERAL_SIZE),
        corner: true,
    };
    ctx.save();
    for (let i = 0; i < face.values.length; i++) {
        paintValue(ctx, ts, String(face.values[i]), opts, pending, place, (image, decal) => drawD4CornerDecal(ctx, image, decal, ts));
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
 * @returns {{ canvas: object, pendingImages: string[] }}  image sources (body, decoration, decals) not loaded yet
 */
export function paintFace({ set, type, face, isSecret = false, decals = null, decalRegistry = null, textOffsetY = 0, mode = 'albedo', canvas = null }) {
    const ts = TEXTURE_SIZE;
    const target = canvas || createCanvas(ts);
    const ctx = target.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    const pending = [];
    const lookup = (src) => {
        const img = decalRegistry ? decalRegistry.get(src) : null;
        if (!img) pending.push(src);
        return img || null;
    };
    const intensity = materialEmissiveIntensity(set);
    const maxRelief = reliefScale(set);
    fillBase(ctx, ts, set, type, face, mode, lookup, intensity);
    paintDecor(ctx, ts, set, type, mode, lookup, maxRelief, intensity);
    const opts = { set, type, face, isSecret, decals, decalRegistry, textOffsetY, mode, maxRelief, intensity };
    if (face && face.values) {
        paintCorners(ctx, ts, opts, pending);
    } else if (face && face.text !== undefined && face.text !== null && String(face.text) !== '') {
        paintSingle(ctx, ts, opts, pending);
    }
    return { canvas: target, pendingImages: [...new Set(pending)] };
}

/**
 * The relief map of a (set, type): decoration layers raised by their `relief` (image layers
 * by their alpha, so the registry that holds them is needed), body texture raised by
 * `body.normalStrength`. With a `face` that carries an emblem the emblem's relief joins in
 * and the map belongs to that face alone; without one the map is shared by every face of
 * the type. Null when nothing applies. `canvas` repaints an existing map in place.
 */
export function paintNormalMap({ set, type, face = null, isSecret = false, decals = null, decalRegistry = null, textOffsetY = 0, canvas = null }) {
    const ts = TEXTURE_SIZE;
    const decorRelief = decorLayers(set).reduce((max, layer) => Math.max(max, layerRelief(layer)), 0);
    const faceRelief = isSecret ? 0 : faceEmblemRelief(set, type, face);
    const textureStrength = set.body.texture ? set.body.normalStrength : 0;
    if (decorRelief <= 0 && faceRelief <= 0 && textureStrength <= 0) return null;

    const height = new Uint8ClampedArray(ts * ts);
    if (textureStrength > 0) {
        const { values } = getPattern(set, type);
        for (let i = 0; i < ts * ts; i++) height[i] = values[i] * textureStrength * 160;
    }
    if (decorRelief > 0 || faceRelief > 0) {
        // Height canvases are white at the strongest relief; scale back to absolute relief.
        const relief = reliefScale(set);
        const { canvas: painted } = paintFace({ set, type, face, isSecret, decals, decalRegistry, textOffsetY, mode: 'height' });
        const ctx = painted.getContext('2d');
        if ('filter' in ctx) {
            // Soften the band edges so the relief reads as a rounded bevel, not a cliff.
            ctx.filter = 'blur(1.5px)';
            ctx.drawImage(painted, 0, 0);
            ctx.filter = 'none';
        }
        const data = ctx.getImageData(0, 0, ts, ts).data;
        for (let i = 0; i < ts * ts; i++) height[i] = Math.min(255, height[i] + data[i * 4] * relief);
    }

    const pixels = heightToNormal(height, ts, ts, 2.5);
    const out = canvas || createCanvas(ts);
    const octx = out.getContext('2d');
    const img = octx.createImageData(ts, ts);
    img.data.set(pixels);
    octx.putImageData(img, 0, 0);
    return out;
}
