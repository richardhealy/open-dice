import { f, vertex, circle } from './path.js';

/**
 * Frame: the filigree's edge bands and corner knots without its vines and berries, so a set
 * can carry a plain metal border or stack another art (knotwork, vines, corners) inside it.
 * The d4's corner numerals make no difference here: the bands hug the edges either way.
 */
export function buildFrame(sides) {
    const paths = [];
    const inset = 0.94;
    for (let j = 0; j < sides; j++) {
        const [ax, ay] = vertex(sides, j, inset);
        const [bx, by] = vertex(sides, (j + 1) % sides, inset);
        paths.push({ d: `M ${f(ax)} ${f(ay)} L ${f(bx)} ${f(by)}`, stroke: 0.06, fill: false });
        paths.push({ d: circle(ax, ay, 0.06), stroke: 0, fill: true });
    }
    return paths;
}
