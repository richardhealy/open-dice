/**
 * Path-string helpers shared by the generated arts. Everything is written in the unit frame
 * that face-frame.js sets up: the face polygon's vertices lie on the unit circle, vertex 0 at
 * angle 0, y up. Numbers are rounded to four decimals so every art is a stable string.
 */
export const f = (n) => Number(n.toFixed(4)).toString();

/** Vertex j of a regular polygon with `sides` vertices on a circle of `radius`. */
export function vertex(sides, j, radius) {
    const t = (Math.PI * 2 * j) / sides;
    return [Math.cos(t) * radius, Math.sin(t) * radius];
}

/** A full circle as two arcs. */
export function circle(cx, cy, r) {
    return `M ${f(cx + r)} ${f(cy)} A ${f(r)} ${f(r)} 0 1 0 ${f(cx - r)} ${f(cy)} A ${f(r)} ${f(r)} 0 1 0 ${f(cx + r)} ${f(cy)} Z`;
}

/** A full ellipse with semi-axis rx along `angle` (radians) and ry across it, as two arcs. */
export function ellipse(cx, cy, rx, ry, angle) {
    const ux = Math.cos(angle) * rx, uy = Math.sin(angle) * rx;
    const deg = f((angle * 180) / Math.PI);
    return `M ${f(cx + ux)} ${f(cy + uy)} A ${f(rx)} ${f(ry)} ${deg} 1 0 ${f(cx - ux)} ${f(cy - uy)} A ${f(rx)} ${f(ry)} ${deg} 1 0 ${f(cx + ux)} ${f(cy + uy)} Z`;
}

/** A closed polygon through the points. */
export function polygon(points) {
    return points.map(([x, y], i) => `${i ? 'L' : 'M'} ${f(x)} ${f(y)}`).join(' ') + ' Z';
}
