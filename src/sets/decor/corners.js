import { vertex, circle } from './path.js';

const RHO = 0.8;       // floret centre along the ray to its corner
const PETAL = 0.045;   // petal disc radius
const OFFSET = 0.035;  // petal centre from the floret centre: the floret is 2 · (OFFSET + PETAL) = 0.16 wide
const DOT = 0.022;

/**
 * Corners: a floret at each corner, three petal discs around a centre dot. One petal points
 * out to the corner and two tuck in toward the edges, so the floret fits the narrow corner
 * of a triangle. At 0.8 along the ray it sits inside the frame's corner knot and clear of
 * the d4's corner numerals, which end near 0.71.
 */
export function buildCorners(sides) {
    const paths = [];
    for (let j = 0; j < sides; j++) {
        const t = (Math.PI * 2 * j) / sides;
        const [cx, cy] = vertex(sides, j, RHO);
        for (let k = 0; k < 3; k++) {
            const phi = t + (k * Math.PI * 2) / 3;
            paths.push({ d: circle(cx + Math.cos(phi) * OFFSET, cy + Math.sin(phi) * OFFSET, PETAL), stroke: 0, fill: true });
        }
        paths.push({ d: circle(cx, cy, DOT), stroke: 0, fill: true });
    }
    return paths;
}
