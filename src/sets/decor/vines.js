import { hashSeed } from '../noise.js';
import { f, vertex, ellipse } from './path.js';

/**
 * Vines: from each edge midpoint one long tendril sweeps across the face and around the
 * numeral, carrying a branch and a twig, every tip ending in a leaf. Edge midpoints are the
 * anchors, so the tendrils meet their neighbours' at the shared edge and the growth reads as
 * one network across the die. Stroke widths 0.05 / 0.03 / 0.02. The layout is seeded per
 * face shape, so every face of a die shows the same vines and every build is identical.
 *
 * Centred layout: the tendril leaves the midpoint, dips toward the numeral's clearance and
 * swings out to a corner. Corner layout (the d4, whose numerals sit at the corners): the
 * tendril curls around the empty centre instead, between the corner numerals.
 */
const INSET = 0.94;
const CLEARANCE = 0.3;                            // the d4's empty centre (its numerals sit at the corners)
// Radius of the largest centred numeral painted on a face of that shape, in the unit frame:
// a glyph is 0.445 of the canvas tall and the frame radius is ts / (2 (1 + tab)), so the d8
// (tab 0) needs 0.45 on a triangle, the d6 (0.1) 0.49 on a square, the d12 (0.2) 0.54 on a pentagon.
const NUMERAL_CLEARANCE = { 3: 0.45, 4: 0.5, 5: 0.54 };
const CORNER_NUMERAL = { at: 0.54, radius: 0.2 }; // the d4's corner numerals (CORNER_OFFSET over the frame radius; a glyph's half-size)
const LEAF = [0.065, 0.032];                      // leaf semi-axes: along the stem, across it
const SMALL_LEAF = [0.04, 0.02];                  // the d4's annulus between corner numerals has no room for more
const MARGIN = 0.03;                              // kept from the face edge by every point
const STROKES = { main: 0.035, branch: 0.022, twig: 0.015 };
const SAMPLES = 24;

function lcg(seed) {
    let s = seed >>> 0;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
    };
}
const between = (rnd, lo, hi) => lo + (hi - lo) * rnd();
const polar = (r, angle) => [r * Math.cos(angle), r * Math.sin(angle)];
const normalize = ([x, y]) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
const rotate = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

function cubicAt(p0, p1, p2, p3, t) {
    const u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
}
function cubicTangent(p0, p1, p2, p3, t) {
    const u = 1 - t;
    return normalize([
        3 * u * u * (p1[0] - p0[0]) + 6 * u * t * (p2[0] - p1[0]) + 3 * t * t * (p3[0] - p2[0]),
        3 * u * u * (p1[1] - p0[1]) + 6 * u * t * (p2[1] - p1[1]) + 3 * t * t * (p3[1] - p2[1]),
    ]);
}
function quadAt(p0, c, p2, t) {
    const u = 1 - t;
    return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p2[1]];
}
function quadTangent(p0, c, p2, t) {
    return normalize([(1 - t) * (c[0] - p0[0]) + t * (p2[0] - c[0]), (1 - t) * (c[1] - p0[1]) + t * (p2[1] - c[1])]);
}

/** The face: unit-polygon edge normals and apothem, plus the discs every point must avoid. */
function makeFrame(sides, corners) {
    const normals = [];
    for (let j = 0; j < sides; j++) normals.push(polar(1, (Math.PI * (2 * j + 1)) / sides));
    const discs = [{ x: 0, y: 0, r: corners ? CLEARANCE : (NUMERAL_CLEARANCE[sides] || 0.5) }];
    if (corners) for (let j = 0; j < sides; j++) { const [x, y] = vertex(sides, j, CORNER_NUMERAL.at); discs.push({ x, y, r: CORNER_NUMERAL.radius }); }
    return { apothem: Math.cos(Math.PI / sides), normals, discs, leaf: corners ? SMALL_LEAF : LEAF };
}

/** Every sampled point (and the control points, which the tests read) inside the face and out of every disc. */
function fits(frame, points, margin) {
    return points.every(([x, y]) =>
        frame.normals.every(([nx, ny]) => x * nx + y * ny <= frame.apothem - margin) &&
        frame.discs.every((d) => Math.hypot(x - d.x, y - d.y) > d.r + 0.01));
}

function leafAt(point, dir, leaf) {
    return { d: ellipse(point[0] + dir[0] * leaf[0], point[1] + dir[1] * leaf[0], leaf[0], leaf[1], Math.atan2(dir[1], dir[0])), stroke: 0, fill: true };
}
function leafPoints(point, dir, leaf) {
    const tip = [point[0] + dir[0] * 2 * leaf[0], point[1] + dir[1] * 2 * leaf[0]];
    const side = [-dir[1] * leaf[1], dir[0] * leaf[1]];
    const mid = [point[0] + dir[0] * leaf[0], point[1] + dir[1] * leaf[0]];
    return [tip, [mid[0] + side[0], mid[1] + side[1]], [mid[0] - side[0], mid[1] - side[1]]];
}

/** A cubic tendril from `from` to `to` through two controls; null unless the whole curve and its leaf fit. */
function cubic(frame, from, c1, c2, to, kind) {
    const pts = [];
    for (let i = 1; i <= SAMPLES; i++) pts.push(cubicAt(from, c1, c2, to, i / SAMPLES));
    const end = cubicTangent(from, c1, c2, to, 1);
    // The anchor sits on the inset edge itself (that is what joins faces), so it is checked
    // without the margin; everything else keeps MARGIN from the edge.
    if (!fits(frame, [from], 1e-9) || !fits(frame, [...pts, c1, c2, ...leafPoints(to, end, frame.leaf)], MARGIN)) return null;
    return {
        at: (t) => cubicAt(from, c1, c2, to, t), tangent: (t) => cubicTangent(from, c1, c2, to, t),
        stem: { d: `M ${f(from[0])} ${f(from[1])} C ${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(to[0])} ${f(to[1])}`, stroke: STROKES[kind], fill: false },
        leaf: leafAt(to, end, frame.leaf),
    };
}

/** A quadratic stem from `from` along `dir` for `length`, bowed sideways by `bow`; null unless it fits (bow flattens on retry). */
function quad(frame, from, dir, length, bow, kind) {
    const to = [from[0] + dir[0] * length, from[1] + dir[1] * length];
    const perp = [-dir[1], dir[0]];
    for (let attempt = 0; attempt < 4; attempt++) {
        const b = attempt < 3 ? bow / 2 ** attempt : 0;
        const c = [(from[0] + to[0]) / 2 + perp[0] * b, (from[1] + to[1]) / 2 + perp[1] * b];
        const pts = [];
        for (let i = 1; i <= SAMPLES; i++) pts.push(quadAt(from, c, to, i / SAMPLES));
        const end = quadTangent(from, c, to, 1);
        if (!fits(frame, [from], 1e-9) || !fits(frame, [...pts, c, ...leafPoints(to, end, frame.leaf)], MARGIN)) continue;
        return {
            at: (t) => quadAt(from, c, to, t), tangent: (t) => quadTangent(from, c, to, t),
            stem: { d: `M ${f(from[0])} ${f(from[1])} Q ${f(c[0])} ${f(c[1])} ${f(to[0])} ${f(to[1])}`, stroke: STROKES[kind], fill: false },
            leaf: leafAt(to, end, frame.leaf),
        };
    }
    return null;
}

/** First candidate stem that fits: `dirs` are tried in order, each at full length then shorter. */
function firstFit(frame, from, dirs, length, bowFraction, kind) {
    for (const dir of dirs) {
        for (const scale of [1, 0.75, 0.55, 0.4]) {
            const run = length * scale;
            const grown = quad(frame, from, dir, run, bowFraction * run, kind);
            if (grown) return grown;
        }
    }
    return null;
}

export function buildVines(sides, { corners = false } = {}) {
    const rnd = lcg(hashSeed(`vines:${sides}:${corners ? 'corners' : 'centre'}`));
    const frame = makeFrame(sides, corners);
    const a = frame.apothem * INSET;                 // inset apothem: where the tendril starts
    const paths = [];
    const push = (g) => paths.push(g.stem, g.leaf);

    for (let j = 0; j < sides; j++) {
        const phi = (Math.PI * (2 * j + 1)) / sides;
        const start = polar(a, phi);
        const toCorner = rnd() < 0.5 ? 1 : -1;      // which end of the edge the tendril swings to
        const cornerAngle = (Math.PI * 2 * (j + (toCorner > 0 ? 1 : 0))) / sides;
        let main = null;

        if (!corners) {
            // Run from the midpoint along the edge toward the corner region, bowing inward as far
            // as the numeral allows (on a triangle the glyph fills the inscribed circle, so the
            // tendril hugs the edge; a pentagon leaves room for a real sweep). The end is pulled
            // back in steps until its leaf fits inside the corner.
            const corner = polar(INSET, cornerAngle);
            const lerp = (t) => [start[0] + (corner[0] - start[0]) * t, start[1] + (corner[1] - start[1]) * t];
            const inward = (p, d) => { const n = normalize([-p[0], -p[1]]); return [p[0] + n[0] * d, p[1] + n[1] * d]; };
            search: for (const [d1, d2] of [[0.1, 0.16], [0.07, 0.12], [0.04, 0.08], [0.02, 0.04], [0, 0.01]]) {
                for (const reach of [0.82, 0.76, 0.7, 0.64, 0.58]) {
                    const c1 = inward(lerp(0.33), d1), c2 = inward(lerp(0.66), d2);
                    const to = polar(reach, cornerAngle);
                    main = cubic(frame, start, c1, c2, to, 'main');
                    if (main) break search;
                }
            }
        } else {
            // A hook around the empty centre, between the corner numerals: in from the midpoint,
            // along the annulus, and back out so the leaf points at free space near the edge.
            const sign = toCorner;
            const deg = Math.PI / 180;
            for (const [turn, rEnd] of [[22, 0.4], [18, 0.4], [26, 0.38], [14, 0.4], [20, 0.36]]) {
                const c1 = polar(0.37, phi + sign * 8 * deg);
                const c2 = polar(0.335, phi + sign * (turn + 8) * deg);
                const to = polar(rEnd, phi + sign * turn * deg);
                main = cubic(frame, start, c1, c2, to, 'main');
                if (main) break;
            }
        }
        if (!main) continue;
        push(main);

        // A branch leaves the tendril part-way and heads away from it; a twig leaves the branch.
        const t = between(rnd, 0.3, 0.5);
        const base = main.at(t);
        const along = main.tangent(t);
        const away = normalize([-base[0], -base[1]]);         // toward the centre
        const outward = [-away[0], -away[1]];
        const candidates = corners
            ? [rotate(outward, 0.6), rotate(outward, -0.6), rotate(along, 1.2), rotate(along, -1.2)]
            : [rotate(outward, between(rnd, 0.4, 0.9) * (rnd() < 0.5 ? 1 : -1)), rotate(along, 1.0), rotate(along, -1.0), outward];
        const branch = firstFit(frame, base, candidates, 0.32 * frame.apothem, 0.25, 'branch');
        if (!branch) continue;
        push(branch);

        const u = between(rnd, 0.45, 0.7);
        const tb = branch.at(u), ta = branch.tangent(u);
        const twigDirs = [rotate(ta, 0.9), rotate(ta, -0.9), rotate(ta, 0.5), rotate(ta, -0.5)];
        const twig = firstFit(frame, tb, twigDirs, 0.16 * frame.apothem, 0.2, 'twig');
        if (twig) push(twig);
    }
    return paths;
}
