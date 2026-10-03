import { FACE_FRAMES } from './face-frame.js';

/**
 * Custom art supplied by the host: decoration arts (per face shape) and face emblems, as
 * SVG path lists in the same unit frames the built-in arts use. The registry is a plain
 * store; decor/index.js and decor/emblems.js look here after their built-ins, so a built-in
 * id can never be replaced and registering one is refused outright.
 */
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PATH_DATA = /^[MLHVCSQTAZmlhvcsqtaz0-9 .,\-eE]+$/;
const RULES = ['nonzero', 'evenodd'];
const SHAPES = [...new Set(Object.values(FACE_FRAMES).map((frame) => frame.shape))];

/** Ids of the built-in arts, kept in step with decor/index.js and decor/emblems.js by their tests. */
export const BUILTIN_DECOR_IDS = Object.freeze(['filigree', 'frame', 'corners', 'knotwork', 'vines']);
export const BUILTIN_EMBLEM_IDS = Object.freeze(['sunburst', 'star', 'crown', 'skull']);

const decorArts = new Map();
const emblemArts = new Map();
const EMPTY = Object.freeze([]);

function fail(message) {
    throw new Error(`open-dice-dnd: ${message}`);
}

/**
 * Check a path list and return a frozen canonical copy: `{ d, stroke, fill, rule? }` with
 * stroke 0 on fills. Throws on anything but SVG path commands and numbers in `d`, a stroke
 * path without a positive width, or an unknown fill rule.
 */
export function validatePathList(paths) {
    if (!Array.isArray(paths) || paths.length === 0) fail('art paths must be a non-empty array of { d, stroke, fill }');
    return Object.freeze(paths.map((p, i) => {
        const at = `paths[${i}]`;
        if (!p || typeof p !== 'object') fail(`${at} must be { d, stroke, fill }`);
        if (typeof p.d !== 'string' || !p.d.trim()) fail(`${at}.d: path data required`);
        if (!PATH_DATA.test(p.d)) fail(`${at}.d: path data may only use the commands M L H V C S Q T A Z (or lowercase) and numbers`);
        if (p.fill != null && typeof p.fill !== 'boolean') fail(`${at}.fill must be true or false`);
        const fill = p.fill === true;
        if (fill) {
            if (p.stroke != null && !(typeof p.stroke === 'number' && p.stroke >= 0)) fail(`${at}.stroke: a fill path's stroke must be 0`);
        } else if (typeof p.stroke !== 'number' || !Number.isFinite(p.stroke) || p.stroke <= 0) {
            fail(`${at}.stroke: a stroke path needs a positive stroke width`);
        }
        if (p.rule != null && !RULES.includes(p.rule)) fail(`${at}.rule must be nonzero or evenodd`);
        const out = { d: p.d, stroke: fill ? 0 : p.stroke, fill };
        if (p.rule) out.rule = p.rule;
        return Object.freeze(out);
    }));
}

function checkId(kind, id, builtins, registry) {
    if (typeof id !== 'string' || !ID.test(id)) fail(`${kind} art id must be kebab-case (a-z, 0-9, single hyphens), got ${JSON.stringify(id)}`);
    if (builtins.includes(id)) fail(`${kind} art "${id}" is built in and cannot be replaced`);
    if (registry.has(id)) fail(`${kind} art "${id}" is already registered`);
}

/**
 * Register a decoration art: `shapes` maps face shapes (tri, triCorners, square, kite, pent)
 * to path lists in the unit frame. Shapes left out paint nothing. Nothing is stored unless
 * every list validates.
 */
export function registerDecorArt(id, shapes) {
    checkId('decor', id, BUILTIN_DECOR_IDS, decorArts);
    const expected = `(expected an object mapping face shapes ${SHAPES.join(', ')} to path lists)`;
    if (!shapes || typeof shapes !== 'object' || Array.isArray(shapes)) fail(`decor art "${id}" needs a face shape map ${expected}`);
    const keys = Object.keys(shapes);
    if (keys.length === 0) fail(`decor art "${id}" needs at least one face shape ${expected}`);
    const entry = {};
    for (const shape of keys) {
        if (!SHAPES.includes(shape)) fail(`decor art "${id}": unknown face shape "${shape}" ${expected}`);
        entry[shape] = validatePathList(shapes[shape]);
    }
    decorArts.set(id, Object.freeze(entry));
}

/** Register a face emblem: a path list in the unit circle (radius 1, centred). */
export function registerEmblemArt(id, paths) {
    checkId('emblem', id, BUILTIN_EMBLEM_IDS, emblemArts);
    emblemArts.set(id, validatePathList(paths));
}

export function hasDecorArt(id) {
    return decorArts.has(id);
}

export function hasEmblemArt(id) {
    return emblemArts.has(id);
}

/** Paths of a registered art for a face shape; [] when the art has none for that shape. */
export function getRegisteredDecor(id, shape) {
    const entry = decorArts.get(id);
    if (!entry) fail(`unknown decor art "${id}"`);
    return Object.prototype.hasOwnProperty.call(entry, shape) ? entry[shape] : EMPTY;
}

export function getRegisteredEmblem(id) {
    const paths = emblemArts.get(id);
    if (!paths) fail(`unknown emblem art "${id}"`);
    return paths;
}

export function _resetArtRegistryForTests() {
    decorArts.clear();
    emblemArts.clear();
}
