import { FAMILY_DEFAULTS, METALS } from './materials.js';
import { NUMERAL_FONT_FAMILY } from './fonts/numerals.js';
import { hasDecor } from './decor/index.js';
import { hasEmblem } from './decor/emblems.js';
import { PATTERN_KINDS } from './noise.js';
import { shade } from './color.js';

const HEX = /^#[0-9a-fA-F]{6}$/;
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const STYLES = ['flat', 'engraved', 'inlay', 'glow'];
const METAL_NAMES = Object.keys(METALS);
const IMAGE_FITS = ['cover', 'tile'];
const MAX_DECOR_LAYERS = 6;

const DECAL_DIE_TYPES = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

/** One decal entry: exactly the library's decal options, keeping only the fields given. */
function decalOptions(field, d) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) fail(field, 'must be { src, scale?, offsetX?, offsetY?, rotation? }');
    if (typeof d.src !== 'string' || !d.src.trim()) fail(`${field}.src`, 'required');
    const out = { src: d.src };
    if (d.scale != null) out.scale = range(`${field}.scale`, d.scale, 0.1, 2, 1);
    if (d.offsetX != null) out.offsetX = range(`${field}.offsetX`, d.offsetX, -0.5, 0.5, 0);
    if (d.offsetY != null) out.offsetY = range(`${field}.offsetY`, d.offsetY, -0.5, 0.5, 0);
    if (d.rotation != null) out.rotation = range(`${field}.rotation`, d.rotation, -360, 360, 0);
    return out;
}

/** `{ [dieType]: { [faceValue]: decalOptions } }`, or null. */
function decalsSpec(value) {
    if (value == null) return null;
    if (typeof value !== 'object' || Array.isArray(value)) fail('decals', 'must map die types to { faceValue: decal }');
    const out = {};
    for (const [type, byValue] of Object.entries(value)) {
        if (!DECAL_DIE_TYPES.includes(type)) fail(`decals.${type}`, `unknown die type; one of ${DECAL_DIE_TYPES.join(', ')}`);
        if (!byValue || typeof byValue !== 'object' || Array.isArray(byValue)) fail(`decals.${type}`, 'must map face values to decals');
        out[type] = {};
        for (const [face, decal] of Object.entries(byValue)) {
            if (!/^\d{1,3}$/.test(face)) fail(`decals.${type}.${face}`, 'face values are numbers such as "20" or "00"');
            out[type][face] = decalOptions(`decals.${type}.${face}`, decal);
        }
    }
    return out;
}

function fail(field, message) {
    throw new Error(`open-dice-dnd: invalid dice set — ${field}: ${message}`);
}

function hex(field, value, required = false) {
    if (value == null) { if (required) fail(field, 'required'); return null; }
    if (typeof value !== 'string' || !HEX.test(value)) fail(field, 'must be a #rrggbb colour');
    return value;
}

function range(field, value, min, max, fallback) {
    if (value == null) return fallback;
    if (typeof value !== 'number' || Number.isNaN(value) || value < min || value > max) fail(field, `must be a number between ${min} and ${max}`);
    return value;
}

function glowSpec(field, value) {
    if (value == null) return null;
    if (typeof value !== 'object') fail(field, 'must be { color, intensity }');
    return { color: hex(`${field}.color`, value.color, true), intensity: range(`${field}.intensity`, value.intensity, 0, 4, 1) };
}

function bool(field, value, fallback) {
    if (value == null) return fallback;
    if (typeof value !== 'boolean') fail(field, 'must be true or false');
    return value;
}

function imageSpec(field, value) {
    if (value == null) return null;
    if (typeof value !== 'object' || Array.isArray(value)) fail(field, 'must be { src }');
    if (typeof value.src !== 'string' || !value.src.trim()) fail(`${field}.src`, 'required');
    return { src: value.src };
}

/** Body texture: the four scalar kinds as before, plus pour, circuit and felt with their own fields. */
function textureSpec(t, bodyColor) {
    if (typeof t !== 'object' || Array.isArray(t)) fail('body.texture', 'must be an object');
    if (!PATTERN_KINDS.includes(t.kind)) fail('body.texture.kind', `must be one of ${PATTERN_KINDS.join(', ')}`);
    const f = (name) => `body.texture.${name}`;
    const common = { kind: t.kind, scale: range(f('scale'), t.scale, 1, 12, 3), perFace: bool(f('perFace'), t.perFace, false) };
    if (t.kind === 'pour') {
        if (!Array.isArray(t.palette) || t.palette.length < 2 || t.palette.length > 6) fail(f('palette'), 'must list 2 to 6 colours');
        const palette = t.palette.map((c, i) => hex(f(`palette[${i}]`), c, true));
        let lacing = null;
        if (t.lacing != null) {
            if (typeof t.lacing !== 'object') fail(f('lacing'), 'must be { color, width }');
            lacing = { color: hex(f('lacing.color'), t.lacing.color, true), width: range(f('lacing.width'), t.lacing.width, 0.005, 0.1, 0.02) };
        }
        return { ...common, palette, warp: range(f('warp'), t.warp, 0, 8, 4), lacing, color2: hex(f('color2'), t.color2), contrast: range(f('contrast'), t.contrast, 0, 1, 0.3) };
    }
    if (t.kind === 'circuit') {
        return { ...common, color2: hex(f('color2'), t.color2, true), density: range(f('density'), t.density, 5, 120, 40), grid: range(f('grid'), t.grid, 6, 24, 12), contrast: range(f('contrast'), t.contrast, 0, 1, 0.6) };
    }
    if (t.kind === 'felt') {
        return { ...common, color2: hex(f('color2'), t.color2) || shade(bodyColor, -0.35), contrast: range(f('contrast'), t.contrast, 0, 1, 0.3) };
    }
    return { ...common, color2: hex(f('color2'), t.color2, true), contrast: range(f('contrast'), t.contrast, 0, 1, 0.3) };
}

/** One of `metal` or `color`; returns { metal, color } with the other null. */
function finish(field, value, { required = true, defaultColor = null } = {}) {
    const hasMetal = value.metal != null, hasColor = value.color != null;
    if (hasMetal && hasColor) fail(field, 'use either metal or color, not both');
    if (!hasMetal && !hasColor) {
        if (required) fail(field, 'needs a metal or a color');
        return { metal: null, color: defaultColor };
    }
    if (hasMetal) {
        if (!METAL_NAMES.includes(value.metal)) fail(`${field}.metal`, `must be one of ${METAL_NAMES.join(', ')}`);
        return { metal: value.metal, color: null };
    }
    return { metal: null, color: hex(`${field}.color`, value.color, true) };
}

/**
 * One decoration layer in canonical form: { art, image, metal, color, relief, scale, glow }.
 * Metal layers paint into the MR map; colour layers are dielectric and may glow; image layers
 * carry an alpha PNG in place of generated art.
 */
function decorLayer(field, d) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) fail(field, 'must be an object');
    const hasArt = d.art != null, hasImage = d.image != null;
    if (hasArt && hasImage) fail(field, 'use either art or image, not both');
    if (!hasArt && !hasImage) fail(field, 'needs an art or an image');
    if (hasArt && !hasDecor(d.art)) fail(`${field}.art`, `unknown decoration "${d.art}"`);
    const image = hasImage ? imageSpec(`${field}.image`, d.image) : null;
    const { metal, color } = finish(field, d);
    const glow = range(`${field}.glow`, d.glow, 0, 4, 0);
    if (glow > 0 && metal) fail(`${field}.glow`, 'only a colour layer can glow');
    return {
        art: hasArt ? d.art : null,
        image,
        metal,
        color,
        relief: range(`${field}.relief`, d.relief, 0, 1, 0.6),
        scale: range(`${field}.scale`, d.scale, 0.5, 2, 1),
        glow,
    };
}

/** An emblem in canonical form: { art, metal, color, scale, relief }; a bare string is the art id. */
function emblemSpec(field, e, numeralColor) {
    const value = typeof e === 'string' ? { art: e } : e;
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(field, 'must be an art id or { art, metal | color, scale, relief }');
    if (typeof value.art !== 'string' || !hasEmblem(value.art)) fail(`${field}.art`, `unknown emblem "${value.art}"`);
    const { metal, color } = finish(field, value, { required: false, defaultColor: numeralColor });
    return { art: value.art, metal, color, scale: range(`${field}.scale`, value.scale, 0.3, 1.2, 0.8), relief: range(`${field}.relief`, value.relief, 0, 1, 0.5) };
}

function deepFreeze(object) {
    for (const value of Object.values(object)) {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) deepFreeze(value);
    }
    return Object.freeze(object);
}

/** Validate a set definition, apply defaults and return a frozen resolved set. */
export function validateSet(def) {
    if (!def || typeof def !== 'object') fail('definition', 'must be an object');
    if (typeof def.id !== 'string' || !ID.test(def.id)) fail('id', 'must be kebab-case (a-z, 0-9, single hyphens)');
    if (typeof def.name !== 'string' || !def.name.trim()) fail('name', 'required');
    if (!Object.prototype.hasOwnProperty.call(FAMILY_DEFAULTS, def.family)) fail('family', `must be one of ${Object.keys(FAMILY_DEFAULTS).join(', ')}`);
    const fam = FAMILY_DEFAULTS[def.family];

    const b = def.body || {};
    const color = hex('body.color', b.color, true);
    let texture = null;
    if (b.texture != null) {
        texture = textureSpec(b.texture, color);
    } else if (def.family === 'textured') {
        fail('body.texture', 'required for the textured family');
    }
    let image = null;
    if (b.image != null) {
        if (typeof b.image !== 'object' || Array.isArray(b.image)) fail('body.image', 'must be { src, fit, scale }');
        const { src } = imageSpec('body.image', b.image);
        if (b.image.fit != null && !IMAGE_FITS.includes(b.image.fit)) fail('body.image.fit', `must be one of ${IMAGE_FITS.join(', ')}`);
        image = { src, fit: b.image.fit || 'cover', scale: range('body.image.scale', b.image.scale, 0.25, 8, 1) };
    }
    const body = {
        color,
        depthColor: hex('body.depthColor', b.depthColor) || color,
        roughness: range('body.roughness', b.roughness, 0, 1, fam.roughness),
        metalness: range('body.metalness', b.metalness, 0, 1, fam.metalness),
        clearcoat: range('body.clearcoat', b.clearcoat, 0, 1, fam.clearcoat),
        clearcoatRoughness: range('body.clearcoatRoughness', b.clearcoatRoughness, 0, 1, fam.clearcoatRoughness),
        glow: glowSpec('body.glow', b.glow),
        emissive: glowSpec('body.emissive', b.emissive),
        vignette: range('body.vignette', b.vignette, 0, 1, fam.depthGradient ? 0.85 : 0),
        texture,
        image,
        normalImage: imageSpec('body.normalImage', b.normalImage),
        normalStrength: range('body.normalStrength', b.normalStrength, 0, 1, 0),
        envMapIntensity: range('body.envMapIntensity', b.envMapIntensity, 0, 4, 1),
    };

    const edgeMetal = def.edge && def.edge.metal != null ? def.edge.metal : 'none';
    if (edgeMetal !== 'none' && !METAL_NAMES.includes(edgeMetal)) fail('edge.metal', `must be none or one of ${METAL_NAMES.join(', ')}`);
    const edge = { metal: edgeMetal };

    const n = def.numeral || {};
    if (!STYLES.includes(n.style || 'flat')) fail('numeral.style', `must be one of ${STYLES.join(', ')}`);
    const style = n.style || 'flat';
    const numeral = {
        font: typeof n.font === 'string' && n.font.trim() ? n.font : NUMERAL_FONT_FAMILY,
        weight: range('numeral.weight', n.weight, 100, 900, 700),
        color: hex('numeral.color', n.color, true),
        style,
        metal: null,
        glow: null,
        scale: range('numeral.scale', n.scale, 0.5, 2, 1),
        // A stroke around the glyph, for numerals that must read on a busy or light body (pour).
        outline: n.outline == null ? null : {
            color: hex('numeral.outline.color', n.outline.color, true),
            width: range('numeral.outline.width', n.outline.width, 0.02, 0.2, 0.08),
        },
    };
    if (style === 'inlay') {
        if (!METAL_NAMES.includes(n.metal)) fail('numeral.metal', `required for the inlay style; one of ${METAL_NAMES.join(', ')}`);
        numeral.metal = n.metal;
    }
    if (style === 'glow') {
        if (n.glow == null) fail('numeral.glow', 'required for the glow style');
        numeral.glow = glowSpec('numeral.glow', n.glow);
    }

    // One layer (the 1.4.0 shape) or an ordered list of layers; the painter always sees an array.
    let decor = null;
    if (def.decor != null) {
        if (typeof def.decor !== 'object') fail('decor', 'must be a layer, an array of layers or null');
        const isList = Array.isArray(def.decor);
        const layers = isList ? def.decor : [def.decor];
        if (layers.length < 1 || layers.length > MAX_DECOR_LAYERS) fail('decor', `must list 1 to ${MAX_DECOR_LAYERS} layers`);
        decor = layers.map((d, i) => decorLayer(isList ? `decor[${i}]` : 'decor', d));
    }

    let emblems = null;
    if (def.emblems != null) {
        if (typeof def.emblems !== 'object' || Array.isArray(def.emblems)) fail('emblems', 'must map face values to emblems');
        emblems = {};
        for (const [value, e] of Object.entries(def.emblems)) emblems[value] = emblemSpec(`emblems.${value}`, e, numeral.color);
    }

    if (!Array.isArray(def.swatch) || def.swatch.length < 1 || def.swatch.length > 3) fail('swatch', 'must list 1 to 3 colours');
    const swatch = def.swatch.map((c, i) => hex(`swatch[${i}]`, c, true));

    const decals = decalsSpec(def.decals);

    return deepFreeze({ id: def.id, name: def.name.trim(), family: def.family, body, edge, numeral, decor, emblems, decals, swatch });
}
