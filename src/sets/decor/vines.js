import { hashSeed } from '../noise.js';
import { f, vertex, ellipse } from './path.js';

const INSET = 0.94;
const CLEARANCE = 0.3;                           // the centred numeral's radius in the unit frame
const CORNER_NUMERAL = { at: 0.54, radius: 0.2 }; // the d4's corner numerals: CORNER_OFFSET over the frame radius, and a glyph's half-size
const LEAF = [0.065, 0.032];                     // leaf semi-axes: along the stem, across it
const MIN_TIP = CLEARANCE + LEAF[0] + 0.01;      // the main vine's tip never brings its leaf inside the clearance
const MARGIN = 0.03;                             // kept from the inset edge by every curve point
const STROKES = { main: 0.05, branch: 0.03, twig: 0.02 };
const MIN_LENGTH = { branch: 0.06, twig: 0.03 };
const DEG = Math.PI / 180;

/** Linear congruential generator seeded from the lattice hash: the only randomness in this file. */
function lcg(seed) {
    let s = seed >>> 0;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
    };
}
const between = (rnd, lo, hi) => lo + (hi - lo) * rnd();
const pick = (rnd) => (rnd() < 0.5 ? -1 : 1);

function rotate([x, y], angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return [x * c - y * s, x * s + y * c];
}

function normalize([x, y]) {
    const len = Math.hypot(x, y) || 1;
    return [x / len, y / len];
}

function bezier(p0, c, p2, t) {
    const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, d = t * t;
    return [a * p0[0] + b * c[0] + d * p2[0], a * p0[1] + b * c[1] + d * p2[1]];
}

function tangent(p0, c, p2, t) {
    return normalize([(1 - t) * (c[0] - p0[0]) + t * (p2[0] - c[0]), (1 - t) * (c[1] - p0[1]) + t * (p2[1] - c[1])]);
}

/**
 * The face as the inset polygon (apothem and outward edge normals; edge j lies between
 * vertices j and j + 1) plus the discs the vines must keep out of: the centred numeral, and
 * on a d4 the three corner numerals instead of an empty centre, which stays clear too.
 */
function makeFrame(sides, corners) {
    const normals = [];
    for (let j = 0; j < sides; j++) {
        const phi = (Math.PI * (2 * j + 1)) / sides;
        normals.push([Math.cos(phi), Math.sin(phi)]);
    }
    const discs = [{ x: 0, y: 0, r: CLEARANCE }];
    if (corners) {
        for (let j = 0; j < sides; j++) {
            const [x, y] = vertex(sides, j, CORNER_NUMERAL.at);
            discs.push({ x, y, r: CORNER_NUMERAL.radius });
        }
    }
    return { apothem: Math.cos(Math.PI / sides) * INSET, normals, discs };
}

function inside({ apothem, normals }, [px, py], margin) {
    return normals.every(([nx, ny]) => px * nx + py * ny <= apothem - margin);
}

function clear({ discs }, [px, py]) {
    return discs.every((d) => Math.hypot(px - d.x, py - d.y) > d.r + 0.005);
}

/** How far a stem may run from `p` along `dir` so that its leaf still stays MARGIN inside every edge and out of every disc. */
function reach({ apothem, normals, discs }, [px, py], [ux, uy]) {
    let best = Infinity;
    for (const [nx, ny] of normals) {
        const along = ux * nx + uy * ny;
        if (along <= 1e-9) continue;
        best = Math.min(best, (apothem - MARGIN - LEAF[0] * along - (px * nx + py * ny)) / along);
    }
    for (const d of discs) {
        // First entry of the ray into the disc grown by the leaf and a margin; a ray already
        // inside the grown disc is left to grow()'s point check.
        const r = d.r + LEAF[0] + 0.01;
        const dx = px - d.x, dy = py - d.y;
        const b = dx * ux + dy * uy;
        const c = dx * dx + dy * dy - r * r;
        if (c <= 0) continue;
        const disc = b * b - c;
        if (disc < 0) continue;
        const t = -b - Math.sqrt(disc);
        if (t > 0) best = Math.min(best, t);
    }
    return Math.max(0, best);
}

/** Bow sign that bulges a stem away from the face centre. */
function awayFromCentre([px, py], [ux, uy]) {
    return -uy * px + ux * py >= 0 ? 1 : -1;
}

/** `dir` turned by `angle` toward the face centre. */
function towardCentre([px, py], dir, angle) {
    const a = rotate(dir, angle), b = rotate(dir, -angle);
    return a[0] * -px + a[1] * -py >= b[0] * -px + b[1] * -py ? a : b;
}

/**
 * A stem from `from` along `dir` for `length`, bowed sideways by `bow`, with a leaf ellipse on
 * its tip. Null when the stem is too short or any of its points (ends, control point, leaf
 * tips) would touch a numeral or leave the face; the bow is halved first, since a flatter
 * stem may still fit.
 */
function grow(frame, from, dir, length, bow, kind) {
    if (length < (MIN_LENGTH[kind] || 0)) return null;
    if (!clear(frame, from) || !inside(frame, from, -1e-9)) return null;   // the main vine starts on the inset edge itself
    const to = [from[0] + dir[0] * length, from[1] + dir[1] * length];
    const perp = [-dir[1], dir[0]];
    for (let attempt = 0; attempt < 5; attempt++) {
        const b = attempt < 4 ? bow / 2 ** attempt : 0;
        const ctrl = [(from[0] + to[0]) / 2 + perp[0] * b, (from[1] + to[1]) / 2 + perp[1] * b];
        const end = tangent(from, ctrl, to, 1);
        const tips = [[to[0] + end[0] * LEAF[0], to[1] + end[1] * LEAF[0]], [to[0] - end[0] * LEAF[0], to[1] - end[1] * LEAF[0]]];
        const points = [ctrl, to, ...tips];
        if (!points.every((p) => clear(frame, p) && inside(frame, p, MARGIN))) continue;
        return {
            from, ctrl, to,
            stem: { d: `M ${f(from[0])} ${f(from[1])} Q ${f(ctrl[0])} ${f(ctrl[1])} ${f(to[0])} ${f(to[1])}`, stroke: STROKES[kind], fill: false },
            leaf: { d: ellipse(to[0], to[1], LEAF[0], LEAF[1], Math.atan2(end[1], end[0])), stroke: 0, fill: true },
        };
    }
    return null;
}

/**
 * Vines: from each edge midpoint a main vine runs toward the centre and stops short of the
 * numeral; two branches leave it, one toward each corner of that edge, and each branch
 * carries a twig; every tip ends in a leaf. Stroke widths 0.05 / 0.03 / 0.02. The layout is
 * seeded per face shape, so every face of a die shows the same vines and every build is
 * identical. The main vine stops at 65 % of the apothem, or at 0.375 when that would bring
 * its leaf inside the numeral clearance (radius 0.3), which it does on a triangle. With
 * `corners` (the d4) the branches stop short of the corner numerals as well.
 */
export function buildVines(sides, { corners = false } = {}) {
    const rnd = lcg(hashSeed(`vines:${sides}:${corners ? 'corners' : 'centre'}`));
    const frame = makeFrame(sides, corners);
    const { apothem, normals } = frame;
    const tipRadius = Math.max(apothem * 0.65, MIN_TIP);
    const paths = [];
    const push = (grown) => paths.push(grown.stem, grown.leaf);

    for (let j = 0; j < sides; j++) {
        const [nx, ny] = normals[j];
        const inward = [-nx, -ny];
        const length = apothem - tipRadius;
        const main = grow(frame, [nx * apothem, ny * apothem], inward, length, pick(rnd) * 0.08 * length, 'main');
        if (!main) continue;
        push(main);

        const firstSide = pick(rnd);
        for (const [side, lo, hi] of [[firstSide, 0.25, 0.45], [-firstSide, 0.5, 0.75]]) {
            const s = between(rnd, lo, hi);
            const base = bezier(main.from, main.ctrl, main.to, s);
            const corner = vertex(sides, side > 0 ? j + 1 : j, INSET);
            const toCorner = normalize([corner[0] - base[0], corner[1] - base[1]]);
            const tilt = between(rnd, 8, 20);
            const bowFraction = between(rnd, 0.15, 0.3), lengthFraction = between(rnd, 0.5, 0.7);
            let branch = null;
            // Head for the corner, turned a little toward the centre to leave the edge band;
            // with no room for the leaf there, turn further in, then run straight at the corner.
            for (const angle of [tilt, tilt + 15, 0]) {
                const dir = towardCentre(base, toCorner, angle * DEG);
                const run = lengthFraction * reach(frame, base, dir);
                branch = grow(frame, base, dir, run, awayFromCentre(base, dir) * bowFraction * run, 'branch');
                if (branch) break;
            }
            if (!branch) continue;
            push(branch);

            const u = between(rnd, 0.45, 0.7);
            const twigBase = bezier(branch.from, branch.ctrl, branch.to, u);
            const twigAlong = tangent(branch.from, branch.ctrl, branch.to, u);
            const turn = between(rnd, 40, 65) * DEG;
            const twigFraction = between(rnd, 0.35, 0.55);
            const twigSide = pick(rnd);
            // Either side at the drawn turn, then either side at half of it: a short branch
            // between two d4 numerals has room for a leaf only close to its own line.
            for (const [sign, angle] of [[twigSide, turn], [-twigSide, turn], [twigSide, turn / 2], [-twigSide, turn / 2]]) {
                const dir = rotate(twigAlong, sign * angle);
                const run = twigFraction * reach(frame, twigBase, dir);
                const twig = grow(frame, twigBase, dir, run, awayFromCentre(twigBase, dir) * 0.15 * run, 'twig');
                if (twig) { push(twig); break; }
            }
        }
    }
    return paths;
}
