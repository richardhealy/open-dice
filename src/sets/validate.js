import { FAMILY_DEFAULTS, METALS } from './materials.js';
import { NUMERAL_FONT_FAMILY } from './fonts/numerals.js';
import { hasDecor } from './decor/index.js';
import { PATTERN_KINDS } from './noise.js';

const HEX = /^#[0-9a-fA-F]{6}$/;
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const STYLES = ['flat', 'engraved', 'inlay', 'glow'];
const METAL_NAMES = Object.keys(METALS);

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
        if (typeof b.texture !== 'object') fail('body.texture', 'must be an object');
        if (!PATTERN_KINDS.includes(b.texture.kind)) fail('body.texture.kind', `must be one of ${PATTERN_KINDS.join(', ')}`);
        texture = {
            kind: b.texture.kind,
            color2: hex('body.texture.color2', b.texture.color2, true),
            scale: range('body.texture.scale', b.texture.scale, 1, 12, 3),
            contrast: range('body.texture.contrast', b.texture.contrast, 0, 1, 0.3),
        };
    } else if (def.family === 'textured') {
        fail('body.texture', 'required for the textured family');
    }
    const body = {
        color,
        depthColor: hex('body.depthColor', b.depthColor) || color,
        roughness: range('body.roughness', b.roughness, 0, 1, fam.roughness),
        metalness: range('body.metalness', b.metalness, 0, 1, fam.metalness),
        clearcoat: range('body.clearcoat', b.clearcoat, 0, 1, fam.clearcoat),
        clearcoatRoughness: range('body.clearcoatRoughness', b.clearcoatRoughness, 0, 1, fam.clearcoatRoughness),
        glow: glowSpec('body.glow', b.glow),
        texture,
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
    };
    if (style === 'inlay') {
        if (!METAL_NAMES.includes(n.metal)) fail('numeral.metal', `required for the inlay style; one of ${METAL_NAMES.join(', ')}`);
        numeral.metal = n.metal;
    }
    if (style === 'glow') {
        if (n.glow == null) fail('numeral.glow', 'required for the glow style');
        numeral.glow = glowSpec('numeral.glow', n.glow);
    }

    let decor = null;
    if (def.decor != null) {
        const d = def.decor;
        if (typeof d !== 'object') fail('decor', 'must be an object or null');
        if (!hasDecor(d.art)) fail('decor.art', `unknown decoration "${d.art}"`);
        if (!METAL_NAMES.includes(d.metal)) fail('decor.metal', `must be one of ${METAL_NAMES.join(', ')}`);
        decor = { art: d.art, metal: d.metal, relief: range('decor.relief', d.relief, 0, 1, 0.6) };
    }

    if (!Array.isArray(def.swatch) || def.swatch.length < 1 || def.swatch.length > 3) fail('swatch', 'must list 1 to 3 colours');
    const swatch = def.swatch.map((c, i) => hex(`swatch[${i}]`, c, true));

    return deepFreeze({ id: def.id, name: def.name.trim(), family: def.family, body, edge, numeral, decor, swatch });
}
