/**
 * Gold filigree in the unit frame: polygon vertices on the unit circle, vertex 0 at angle
 * 0, y up (see face-frame.js). Per edge: a frame band, a vine bowing toward the centre with
 * a berry at its deepest point, and a knot at the corner. Generated, so every face shape is
 * symmetric by construction and the numeral in the centre stays clear.
 *
 * With `corners: true` (the d4, whose numerals sit at the corners) the vines are dropped
 * and a small rosette fills the empty centre instead.
 */
const f = (n) => Number(n.toFixed(4)).toString();

function vertex(sides, j, radius) {
    const t = (Math.PI * 2 * j) / sides;
    return [Math.cos(t) * radius, Math.sin(t) * radius];
}

function circle(cx, cy, r) {
    return `M ${f(cx + r)} ${f(cy)} A ${f(r)} ${f(r)} 0 1 0 ${f(cx - r)} ${f(cy)} A ${f(r)} ${f(r)} 0 1 0 ${f(cx + r)} ${f(cy)} Z`;
}

export function buildFiligree(sides, { corners = false } = {}) {
    const paths = [];
    const inset = 0.94;
    for (let j = 0; j < sides; j++) {
        const [ax, ay] = vertex(sides, j, inset);
        const [bx, by] = vertex(sides, (j + 1) % sides, inset);
        paths.push({ d: `M ${f(ax)} ${f(ay)} L ${f(bx)} ${f(by)}`, stroke: 0.07, fill: false });
        if (!corners) {
            const mx = (ax + bx) / 2, my = (ay + by) / 2;
            const qx = mx * 0.5, qy = my * 0.5;
            paths.push({ d: `M ${f(ax)} ${f(ay)} Q ${f(qx)} ${f(qy)} ${f(bx)} ${f(by)}`, stroke: 0.045, fill: false });
            const px = 0.25 * ax + 0.5 * qx + 0.25 * bx, py = 0.25 * ay + 0.5 * qy + 0.25 * by;
            paths.push({ d: circle(px, py, 0.038), stroke: 0, fill: true });
        }
        paths.push({ d: circle(ax, ay, 0.06), stroke: 0, fill: true });
    }
    if (corners) {
        paths.push({ d: circle(0, 0, 0.14), stroke: 0.035, fill: false });
        paths.push({ d: circle(0, 0, 0.045), stroke: 0, fill: true });
    }
    return paths;
}
