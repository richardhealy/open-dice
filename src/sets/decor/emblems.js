import { circle, polygon } from './path.js';
import { hasEmblemArt, getRegisteredEmblem } from '../art-registry.js';

/**
 * Built-in face emblems: path art in a unit circle (radius 1, centred, y up) that the
 * painter scales to the face and paints in place of a numeral. Every path is a fill;
 * holes (eye sockets, jewels) are sub-paths under the even-odd rule.
 */
const fill = (d, rule) => Object.freeze(rule ? { d, stroke: 0, fill: true, rule } : { d, stroke: 0, fill: true });

/** Sixteen rays, long and short by turns, around a disc. */
function sunburst() {
    const paths = [];
    for (let i = 0; i < 16; i++) {
        const phi = (Math.PI * 2 * i) / 16;
        const tip = i % 2 ? 0.82 : 1;
        const base = 0.38, half = 0.1;
        paths.push(fill(polygon([
            [Math.cos(phi - half) * base, Math.sin(phi - half) * base],
            [Math.cos(phi) * tip, Math.sin(phi) * tip],
            [Math.cos(phi + half) * base, Math.sin(phi + half) * base],
        ])));
    }
    paths.push(fill(circle(0, 0, 0.42)));
    return paths;
}

/** Five-point star, one point up. */
function star() {
    const points = [];
    for (let k = 0; k < 10; k++) {
        const r = k % 2 ? 0.4 : 1;
        const phi = Math.PI / 2 + (Math.PI * k) / 5;
        points.push([Math.cos(phi) * r, Math.sin(phi) * r]);
    }
    return [fill(polygon(points))];
}

/** Three-point crown with ball tips and three jewel holes in the band. */
function crown() {
    const body = polygon([
        [-0.66, -0.66], [0.66, -0.66], [0.66, -0.3], [0.6, 0.55], [0.3, -0.05], [0, 0.72], [-0.3, -0.05], [-0.6, 0.55], [-0.66, -0.3],
    ]);
    const jewels = [-0.33, 0, 0.33].map((x) => circle(x, -0.48, 0.07)).join(' ');
    return [
        fill(`${body} ${jewels}`, 'evenodd'),
        fill(circle(-0.6, 0.66, 0.11)),
        fill(circle(0, 0.83, 0.11)),
        fill(circle(0.6, 0.66, 0.11)),
    ];
}

/** Head disc with two eye holes and a nasal notch; a jaw with tooth slits. */
function skull() {
    const head = circle(0, 0.18, 0.72);
    const eyes = `${circle(-0.29, 0.22, 0.19)} ${circle(0.29, 0.22, 0.19)}`;
    const nose = polygon([[0, 0.02], [-0.1, -0.26], [0.1, -0.26]]);
    const jaw = polygon([[-0.38, -0.5], [0.38, -0.5], [0.38, -0.86], [0.3, -0.92], [-0.3, -0.92], [-0.38, -0.86]]);
    const slits = [-0.2, 0, 0.2].map((x) => polygon([[x - 0.03, -0.62], [x + 0.03, -0.62], [x + 0.03, -0.88], [x - 0.03, -0.88]])).join(' ');
    return [fill(`${head} ${eyes} ${nose}`, 'evenodd'), fill(`${jaw} ${slits}`, 'evenodd')];
}

/** emblem id → path list. Custom emblems come from the registry (registerEmblemArt). */
export const EMBLEMS = Object.freeze({
    sunburst: Object.freeze(sunburst()),
    star: Object.freeze(star()),
    crown: Object.freeze(crown()),
    skull: Object.freeze(skull()),
});

const isBuiltin = (id) => Object.prototype.hasOwnProperty.call(EMBLEMS, id);

/** True for a built-in or a registered emblem. */
export function hasEmblem(id) {
    return isBuiltin(id) || hasEmblemArt(id);
}

/** Paths for an emblem: built-in first, then the registry; throws for an unknown id. */
export function getEmblem(id) {
    if (isBuiltin(id)) return EMBLEMS[id];
    if (hasEmblemArt(id)) return getRegisteredEmblem(id);
    throw new Error(`open-dice-dnd: unknown emblem art "${id}"`);
}
