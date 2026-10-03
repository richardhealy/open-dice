import { f, vertex, circle } from './path.js';

const INSET = 0.94;
const AMPLITUDE = 0.035;
const STROKE = 0.03;
const SEGMENTS = 32;
const KNOT = 0.06;

/**
 * Knotwork: a two-strand braid along each edge. Both strands run from corner to corner of the
 * inset edge, offset ±0.035 following sin(kπt) so they cross k − 1 times (k = 3 on a
 * triangle, 4 on a square or pentagon), with a knot disc where they meet at each corner.
 * Each strand is a polyline of 32 segments: a few pixels each at 256 px, which round joins
 * render as a smooth wave. Per edge: strand, strand, knot.
 */
export function buildKnotwork(sides) {
    const k = sides === 3 ? 3 : 4;
    const paths = [];
    for (let j = 0; j < sides; j++) {
        const [ax, ay] = vertex(sides, j, INSET);
        const [bx, by] = vertex(sides, (j + 1) % sides, INSET);
        const ex = bx - ax, ey = by - ay;
        const len = Math.hypot(ex, ey);
        const nx = -ey / len, ny = ex / len;   // inward normal: the polygon winds counter-clockwise
        for (const sign of [1, -1]) {
            const points = [];
            for (let i = 0; i <= SEGMENTS; i++) {
                const t = i / SEGMENTS;
                const w = sign * AMPLITUDE * Math.sin(k * Math.PI * t);
                points.push(`${i ? 'L' : 'M'} ${f(ax + ex * t + nx * w)} ${f(ay + ey * t + ny * w)}`);
            }
            paths.push({ d: points.join(' '), stroke: STROKE, fill: false });
        }
        paths.push({ d: circle(ax, ay, KNOT), stroke: 0, fill: true });
    }
    return paths;
}
