/**
 * Model dice: the die types a design can give a 3D model, the values each one reads, and the
 * validator for a design's `models` entry. See README "Model dice".
 */
import { buildHull } from './hull.js';
import { shade } from '../sets/color.js';

export const MODEL_DIE_TYPES = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** The values each model die reads, matching the classic dice (the d10 reads 0 to 9). */
export const MODEL_DIE_VALUES = Object.freeze({
    d4: range(1, 4), d6: range(1, 6), d8: range(1, 8), d10: range(0, 9), d12: range(1, 12), d20: range(1, 20),
});

/**
 * Circumradius of each classic visual die (the `radius` in dice-models/*.js). A model die is
 * scaled to the volume of the classic polyhedron with this circumradius, so it sits beside
 * classic dice at the same size.
 */
export const CLASSIC_RADIUS = Object.freeze({ d4: 1.2, d6: 0.9, d8: 1, d10: 0.9, d12: 0.9, d20: 1 });

/** Dice read at their top corner rather than their top face. */
export const CORNER_READ = Object.freeze(new Set(['d4']));

const HEX = /^#[0-9a-fA-F]{6}$/;
const MAX_EXTENT = 5;
const MAX_LABELS = 240;

function fail(field, message) {
    throw new Error(`open-dice-dnd: invalid dice set — ${field}: ${message}`);
}

function isObject(v) {
    return v != null && typeof v === 'object' && !Array.isArray(v);
}

function vec3(field, v) {
    if (!Array.isArray(v) || v.length !== 3 || !v.every((n) => typeof n === 'number' && Number.isFinite(n))) fail(field, 'must be [x, y, z] numbers');
    return [v[0], v[1], v[2]];
}

function unit3(field, v) {
    const [x, y, z] = vec3(field, v);
    const len = Math.hypot(x, y, z);
    if (!(len > 1e-9)) fail(field, 'must be a non-zero [x, y, z] direction');
    return [x / len, y / len, z / len];
}

function hex(field, v) {
    if (typeof v !== 'string' || !HEX.test(v)) fail(field, 'must be a #rrggbb colour');
    return v;
}

function dieValue(field, type, v) {
    const values = MODEL_DIE_VALUES[type];
    if (!Number.isInteger(v) || !values.includes(v)) fail(field, `a ${type} has values ${values.join(', ')}`);
    return v;
}

function transformSpec(field, t) {
    if (t == null) return { scale: 1, position: [0, 0, 0], rotation: [0, 0, 0, 1] };
    if (!isObject(t)) fail(field, 'must be { scale, position, rotation }');
    let scale = 1;
    if (t.scale != null) {
        if (typeof t.scale !== 'number' || !Number.isFinite(t.scale) || !(t.scale > 0)) fail(`${field}.scale`, 'must be a positive number');
        scale = t.scale;
    }
    const position = t.position == null ? [0, 0, 0] : vec3(`${field}.position`, t.position);
    let rotation = [0, 0, 0, 1];
    if (t.rotation != null) {
        const q = t.rotation;
        if (!Array.isArray(q) || q.length !== 4 || !q.every((n) => typeof n === 'number' && Number.isFinite(n))) fail(`${field}.rotation`, 'must be a non-zero quaternion [x, y, z, w]');
        const len = Math.hypot(...q);
        if (!(len > 1e-9)) fail(`${field}.rotation`, 'must be a non-zero quaternion [x, y, z, w]');
        rotation = q.map((n) => n / len);
    }
    return { scale, position, rotation };
}

function numeralSpec(field, n) {
    if (n == null) return null;
    if (!isObject(n)) fail(field, 'must be { color, outline }');
    const out = { color: n.color == null ? null : hex(`${field}.color`, n.color), outline: null };
    if (n.outline != null) {
        if (!isObject(n.outline)) fail(`${field}.outline`, 'must be { color, width }');
        const width = n.outline.width == null ? 0.08 : n.outline.width;
        if (typeof width !== 'number' || !(width >= 0.02 && width <= 0.2)) fail(`${field}.outline.width`, 'must be between 0.02 and 0.2');
        out.outline = { color: hex(`${field}.outline.color`, n.outline.color), width };
    }
    return out;
}

const LIQUID_GLASS = Object.freeze({ color: '#FFFFFF', opacity: 0.35, roughness: 0.08 });

/** A finite number within [min, max], or `fallback` when absent. */
function bounded(field, v, min, max, fallback) {
    if (v == null) return fallback;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) fail(field, `must be a number between ${min} and ${max}`);
    return v;
}

/**
 * The liquid inside a model (README "Model dice", "Liquid"): the draught's colours and glow,
 * its fill level, the glass shell, the neck above which the model keeps its own meshes, and
 * how far the surface sloshes. Null when absent.
 */
export function liquidSpec(field, l) {
    if (l == null) return null;
    if (!isObject(l)) fail(field, 'must be { color, surfaceColor, glow, level, thickness, glass, neck, slosh }');
    const color = hex(`${field}.color`, l.color);
    const surfaceColor = l.surfaceColor == null ? shade(color, 0.35) : hex(`${field}.surfaceColor`, l.surfaceColor);
    let glow = null;
    if (l.glow != null) {
        if (!isObject(l.glow)) fail(`${field}.glow`, 'must be { color, intensity }');
        glow = { color: hex(`${field}.glow.color`, l.glow.color), intensity: bounded(`${field}.glow.intensity`, l.glow.intensity, 0, 2, 0.3) };
    }
    const level = bounded(`${field}.level`, l.level, 0.05, 0.95, 0.6);
    const thickness = bounded(`${field}.thickness`, l.thickness, 0.01, 0.3, 0.06);
    let glass = { ...LIQUID_GLASS };
    if (l.glass != null) {
        if (!isObject(l.glass)) fail(`${field}.glass`, 'must be { color, opacity, roughness }');
        glass = {
            color: l.glass.color == null ? LIQUID_GLASS.color : hex(`${field}.glass.color`, l.glass.color),
            opacity: bounded(`${field}.glass.opacity`, l.glass.opacity, 0.05, 0.95, LIQUID_GLASS.opacity),
            roughness: bounded(`${field}.glass.roughness`, l.glass.roughness, 0, 1, LIQUID_GLASS.roughness),
        };
    }
    const neck = l.neck == null ? null : bounded(`${field}.neck`, l.neck, -MAX_EXTENT, MAX_EXTENT, null);
    const slosh = bounded(`${field}.slosh`, l.slosh, 0, 2, 1);
    return { color, surfaceColor, glow, level, thickness, glass, neck, slosh };
}

function modelSpec(field, type, m) {
    if (!isObject(m)) fail(field, 'must be { src, hull, faces, labels }');
    if (typeof m.src !== 'string' || !m.src.trim()) fail(`${field}.src`, 'required');
    const transform = transformSpec(`${field}.transform`, m.transform);

    if (!Array.isArray(m.hull) || m.hull.length < 4 || m.hull.length > 128) fail(`${field}.hull`, 'must list 4 to 128 points');
    const hull = m.hull.map((p, i) => {
        const v = vec3(`${field}.hull[${i}]`, p);
        if (v.some((n) => Math.abs(n) > MAX_EXTENT)) fail(`${field}.hull[${i}]`, `must lie within ${MAX_EXTENT} units of the origin`);
        return v;
    });
    // The body is the hull's QuickHull: it must have volume and, as the body's centre of mass,
    // the origin must sit inside every face (cannon-es computes its faces' normals from that).
    let built;
    try { built = buildHull(hull); } catch (error) { fail(`${field}.hull`, 'the points are flat: they span no volume'); }
    const inside = built.faces.every((f, i) => built.normals[i].lengthSq() > 0.5 && built.normals[i].dot(built.points[f[0]]) > 1e-6);
    if (!inside) fail(`${field}.hull`, 'must surround the origin, the centre of mass (analyse the model with analyzeModelDie)');

    const sides = MODEL_DIE_VALUES[type].length;
    if (!Array.isArray(m.faces) || m.faces.length !== sides) fail(`${field}.faces`, `a ${type} needs ${sides} faces, one per value`);
    const seen = new Set();
    const faces = m.faces.map((f, i) => {
        if (!isObject(f)) fail(`${field}.faces[${i}]`, 'must be { value, up }');
        const value = dieValue(`${field}.faces[${i}].value`, type, f.value);
        if (seen.has(value)) fail(`${field}.faces[${i}].value`, `${value} appears twice`);
        seen.add(value);
        return { value, up: unit3(`${field}.faces[${i}].up`, f.up) };
    });

    if (m.labels != null && !Array.isArray(m.labels)) fail(`${field}.labels`, 'must be a list');
    const rawLabels = m.labels || [];
    if (rawLabels.length > MAX_LABELS) fail(`${field}.labels`, `must list at most ${MAX_LABELS} labels`);
    const labels = rawLabels.map((l, i) => {
        const f = `${field}.labels[${i}]`;
        if (!isObject(l)) fail(f, 'must be { value, position, normal, up, size }');
        const value = dieValue(`${f}.value`, type, l.value);
        const position = vec3(`${f}.position`, l.position);
        if (position.some((n) => Math.abs(n) > MAX_EXTENT)) fail(`${f}.position`, `must lie within ${MAX_EXTENT} units of the origin`);
        const normal = unit3(`${f}.normal`, l.normal);
        const up = unit3(`${f}.up`, l.up);
        if (Math.abs(normal[0] * up[0] + normal[1] * up[1] + normal[2] * up[2]) > 0.999) fail(`${f}.up`, 'must not be parallel to the normal');
        if (typeof l.size !== 'number' || !(l.size >= 0.05 && l.size <= 2)) fail(`${f}.size`, 'must be between 0.05 and 2');
        return { value, position, normal, up, size: l.size };
    });

    return { src: m.src, transform, hull, faces, labels, numeral: numeralSpec(`${field}.numeral`, m.numeral), liquid: liquidSpec(`${field}.liquid`, m.liquid) };
}

/** `{ [dieType]: model }` from a design definition, validated, or null when absent. */
export function modelsSpec(value) {
    if (value == null) return null;
    if (!isObject(value)) fail('models', 'must map die types to models');
    const out = {};
    for (const [type, m] of Object.entries(value)) {
        if (!MODEL_DIE_TYPES.includes(type)) fail(`models.${type}`, `unknown die type; one of ${MODEL_DIE_TYPES.join(', ')} (d100 has no model)`);
        out[type] = modelSpec(`models.${type}`, type, m);
    }
    return Object.keys(out).length ? out : null;
}
