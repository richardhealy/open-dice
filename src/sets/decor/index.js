import { buildFiligree } from './filigree.js';

export const DECOR_SHAPES = ['tri', 'triCorners', 'square', 'kite', 'pent'];

const SIDES = { tri: 3, triCorners: 3, square: 4, kite: 4, pent: 5 };

function forEveryShape(build) {
    const out = {};
    for (const shape of DECOR_SHAPES) {
        out[shape] = build(SIDES[shape], { corners: shape === 'triCorners' });
    }
    return out;
}

/** art id → face shape → path list. Add new art here. */
export const DECOR = Object.freeze({
    filigree: forEveryShape(buildFiligree),
});

export function hasDecor(art) {
    return Object.prototype.hasOwnProperty.call(DECOR, art);
}

export function getDecor(art, shape) {
    if (!hasDecor(art)) throw new Error(`open-dice-dnd: unknown decor art "${art}"`);
    if (!DECOR_SHAPES.includes(shape)) throw new Error(`open-dice-dnd: unknown face shape "${shape}"`);
    return DECOR[art][shape];
}
