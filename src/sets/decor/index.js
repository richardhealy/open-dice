import { buildFiligree } from './filigree.js';
import { buildFrame } from './frame.js';
import { buildCorners } from './corners.js';
import { buildKnotwork } from './knotwork.js';
import { buildVines } from './vines.js';
import { hasDecorArt, getRegisteredDecor } from '../art-registry.js';

export const DECOR_SHAPES = ['tri', 'triCorners', 'square', 'kite', 'pent'];

const SIDES = { tri: 3, triCorners: 3, square: 4, pent: 5 };

function forEveryShape(build) {
    const out = {};
    for (const shape of DECOR_SHAPES) {
        // A d10/d100 face is the upper triangle of a kite plus a separate coplanar belt
        // triangle; no face-shaped art fits that split, so kites carry no decoration.
        out[shape] = shape === 'kite' ? [] : build(SIDES[shape], { corners: shape === 'triCorners' });
    }
    return out;
}

/**
 * Built-in art id → face shape → path list. Add new built-in art here and to
 * BUILTIN_DECOR_IDS in art-registry.js; custom art arrives through registerDecorArt.
 */
export const DECOR = Object.freeze({
    filigree: forEveryShape(buildFiligree),
    frame: forEveryShape(buildFrame),
    corners: forEveryShape(buildCorners),
    knotwork: forEveryShape(buildKnotwork),
    vines: forEveryShape(buildVines),
});

const isBuiltin = (art) => Object.prototype.hasOwnProperty.call(DECOR, art);

/** True for a built-in or a registered art. */
export function hasDecor(art) {
    return isBuiltin(art) || hasDecorArt(art);
}

/**
 * Paths for an art on a face shape: built-in first, then the registry. A registered art with
 * no paths for that shape paints nothing ([]); only an unknown art or face shape throws.
 */
export function getDecor(art, shape) {
    if (!hasDecor(art)) throw new Error(`open-dice-dnd: unknown decor art "${art}"`);
    if (!DECOR_SHAPES.includes(shape)) throw new Error(`open-dice-dnd: unknown face shape "${shape}"`);
    return isBuiltin(art) ? DECOR[art][shape] : getRegisteredDecor(art, shape);
}
