import { describe, it, expect, vi } from 'vitest';
import { buildFiligree } from '../../src/sets/decor/filigree.js';
import { buildFrame } from '../../src/sets/decor/frame.js';
import { buildCorners } from '../../src/sets/decor/corners.js';
import { buildKnotwork } from '../../src/sets/decor/knotwork.js';
import { buildVines } from '../../src/sets/decor/vines.js';
import { EMBLEMS, getEmblem, hasEmblem } from '../../src/sets/decor/emblems.js';
import { DECOR, DECOR_SHAPES, hasDecor, getDecor } from '../../src/sets/decor/index.js';
import { validatePathList, BUILTIN_DECOR_IDS, BUILTIN_EMBLEM_IDS } from '../../src/sets/art-registry.js';

const PATH_SYNTAX = /^[MLQAZ0-9 .\-]+$/;
const SIDES = [3, 4, 5];

/** Every coordinate pair a path visits or steers by (endpoints and control points), never arc radii. */
function pathPoints(d) {
    const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+/g) || [];
    const points = [];
    let i = 0, cmd = null;
    const num = (k) => Number(tokens[i + k]);
    while (i < tokens.length) {
        if (/[A-Za-z]/.test(tokens[i])) { cmd = tokens[i++]; if (cmd === 'Z') continue; }
        switch (cmd) {
            case 'M': case 'L': points.push([num(0), num(1)]); i += 2; break;
            case 'Q': points.push([num(0), num(1)], [num(2), num(3)]); i += 4; break;
            case 'C': points.push([num(0), num(1)], [num(2), num(3)], [num(4), num(5)]); i += 6; break;
            case 'A': points.push([num(5), num(6)]); i += 7; break;
            default: throw new Error(`unexpected path command ${cmd} in "${d}"`);
        }
    }
    return points;
}

/** Inside the regular polygon on the unit circle (vertex 0 at angle 0), at least `margin` from every edge. */
function insidePolygon(sides, [x, y], margin = 0) {
    const apothem = Math.cos(Math.PI / sides);
    for (let j = 0; j < sides; j++) {
        const phi = (Math.PI * (2 * j + 1)) / sides;
        if (x * Math.cos(phi) + y * Math.sin(phi) > apothem - margin + 1e-9) return false;
    }
    return true;
}

/** Centre and radius of a circle path as the generators write it: M cx+r cy A r r … */
function circleOf(d) {
    const m = d.match(/^M (\S+) (\S+) A (\S+) /);
    return { cx: Number(m[1]) - Number(m[3]), cy: Number(m[2]), r: Number(m[3]) };
}

function expectValidArt(paths) {
    expect(paths.length).toBeGreaterThan(0);
    expect(() => validatePathList(paths)).not.toThrow();
    for (const p of paths) expect(p.fill ? p.stroke === 0 : p.stroke > 0).toBe(true);
}

describe('filigree generator', () => {
    it('emits frame, vine, berry and knot per edge for centred numerals', () => {
        const paths = buildFiligree(3);
        expect(paths).toHaveLength(12);
        const strokes = paths.filter((p) => !p.fill), fills = paths.filter((p) => p.fill);
        expect(strokes).toHaveLength(6);
        expect(fills).toHaveLength(6);
        for (const p of paths) {
            expect(p.d).toMatch(PATH_SYNTAX);
            expect(p.fill ? p.stroke === 0 : p.stroke > 0).toBe(true);
        }
    });

    it('keeps the centre clear: vines never come closer than 0.3 to the origin', () => {
        for (const sides of [3, 4, 5]) {
            const vines = buildFiligree(sides).filter((p) => p.d.includes('Q'));
            for (const v of vines) {
                const nums = v.d.match(/-?\d+(\.\d+)?/g).map(Number);
                // M ax ay Q qx qy bx by → deepest point at t = 0.5
                const [ax, ay, qx, qy, bx, by] = nums;
                const px = 0.25 * ax + 0.5 * qx + 0.25 * bx, py = 0.25 * ay + 0.5 * qy + 0.25 * by;
                expect(Math.hypot(px, py)).toBeGreaterThan(0.3);
            }
        }
    });

    it('corner layout drops the vines and adds a centre rosette', () => {
        const paths = buildFiligree(3, { corners: true });
        expect(paths.filter((p) => p.d.includes('Q'))).toHaveLength(0);
        expect(paths).toHaveLength(3 * 2 + 2);
    });
});

describe('frame generator', () => {
    it('emits one edge band and one corner knot per edge, with or without corner numerals', () => {
        for (const sides of SIDES) for (const corners of [false, true]) {
            const paths = buildFrame(sides, { corners });
            expect(paths).toHaveLength(sides * 2);
            expectValidArt(paths);
            expect(paths.filter((p) => !p.fill)).toHaveLength(sides);
            expect(paths.filter((p) => p.fill)).toHaveLength(sides);
            expect(paths.some((p) => p.d.includes('Q'))).toBe(false);   // filigree without its vines
        }
    });

    it('is the filigree without vines: every band and knot also appears in the filigree', () => {
        const filigree = buildFiligree(4);
        for (const p of buildFrame(4)) expect(filigree).toContainEqual(p);
    });
});

describe('corners generator', () => {
    it('places a floret of three petals and a dot at each corner, 0.16 wide, inside the face', () => {
        for (const sides of SIDES) for (const corners of [false, true]) {
            const paths = buildCorners(sides, { corners });
            expect(paths).toHaveLength(sides * 4);
            expectValidArt(paths);
            expect(paths.every((p) => p.fill)).toBe(true);
            for (let j = 0; j < sides; j++) {
                const floret = paths.slice(j * 4, j * 4 + 4).map((p) => circleOf(p.d));
                const petals = floret.slice(0, 3), dot = floret[3];
                const width = 2 * Math.max(...petals.map((c) => Math.hypot(c.cx - dot.cx, c.cy - dot.cy) + c.r));
                expect(width).toBeCloseTo(0.16, 2);
                for (const c of floret) expect(insidePolygon(sides, [c.cx, c.cy], c.r)).toBe(true);
                // the floret sits on the ray to vertex j
                const t = (Math.PI * 2 * j) / sides;
                expect(dot.cx * Math.cos(t) + dot.cy * Math.sin(t)).toBeCloseTo(Math.hypot(dot.cx, dot.cy), 4);
            }
        }
    });
});

describe('knotwork generator', () => {
    it('braids two crossing strands along each edge and knots each corner', () => {
        for (const sides of SIDES) for (const corners of [false, true]) {
            const paths = buildKnotwork(sides, { corners });
            expect(paths).toHaveLength(sides * 3);
            expectValidArt(paths);
            const k = sides === 3 ? 3 : 4;
            for (let j = 0; j < sides; j++) {
                const [s1, s2, knot] = paths.slice(j * 3, j * 3 + 3);
                expect(knot.fill).toBe(true);
                expect(s1.fill).toBe(false);
                expect(s2.fill).toBe(false);
                expect(s1.stroke).toBe(s2.stroke);
                const p1 = pathPoints(s1.d), p2 = pathPoints(s2.d);
                expect(p1[0]).toEqual(p2[0]);                       // both leave the corner together
                expect(p1[p1.length - 1]).toEqual(p2[p2.length - 1]); // and arrive together
                const [ax, ay] = p1[0], [bx, by] = p1[p1.length - 1];
                const len = Math.hypot(bx - ax, by - ay);
                const offset = ([x, y]) => ((bx - ax) * (y - ay) - (by - ay) * (x - ax)) / len;
                // Review: the first offset term differs in sign between the strands, so they cross.
                expect(offset(p1[1]) * offset(p2[1])).toBeLessThan(0);
                for (const p of [...p1, ...p2]) expect(Math.abs(offset(p))).toBeLessThanOrEqual(0.0352);
                // sin(kπt) changes sign k − 1 times between the corners
                const signs = p1.map(offset).filter((o) => Math.abs(o) > 5e-4).map(Math.sign);
                let crossings = 0;
                for (let i = 1; i < signs.length; i++) if (signs[i] !== signs[i - 1]) crossings++;
                expect(crossings).toBe(k - 1);
                // the knot sits on the corner the strands share
                const c = circleOf(knot.d);
                expect(c.cx).toBeCloseTo(ax, 3);
                expect(c.cy).toBeCloseTo(ay, 3);
            }
        }
    });
});

describe('vines generator', () => {
    it('grows a main vine, two levels of branches and a leaf at every tip from each edge, deterministically', () => {
        for (const sides of SIDES) for (const corners of [false, true]) {
            const paths = buildVines(sides, { corners });
            expect(paths.length).toBeGreaterThanOrEqual(sides * 3);
            expectValidArt(paths);
            const strokes = paths.filter((p) => !p.fill), leaves = paths.filter((p) => p.fill);
            expect([...new Set(strokes.map((p) => p.stroke))].sort()).toEqual([0.02, 0.03, 0.05]);
            expect(strokes.filter((p) => p.stroke === 0.05)).toHaveLength(sides);   // one main vine per edge
            expect(leaves).toHaveLength(strokes.length);                             // a leaf at every tip
            expect(buildVines(sides, { corners })).toEqual(paths);
        }
    });

    it('never enters radius 0.3 and stays inside the face polygon', () => {
        for (const sides of SIDES) for (const corners of [false, true]) {
            for (const p of buildVines(sides, { corners })) {
                for (const pt of pathPoints(p.d)) {
                    expect(Math.hypot(pt[0], pt[1])).toBeGreaterThan(0.3);
                    expect(insidePolygon(sides, pt)).toBe(true);
                }
            }
        }
    });

    it('keeps clear of the three corner numerals on a d4', () => {
        // The d4 paints its numerals 0.54 along each vertex axis (CORNER_OFFSET / frame radius); a 0.2 disc covers a glyph.
        const numerals = [0, 1, 2].map((j) => [Math.cos((Math.PI * 2 * j) / 3) * 0.54, Math.sin((Math.PI * 2 * j) / 3) * 0.54]);
        for (const p of buildVines(3, { corners: true })) {
            for (const [x, y] of pathPoints(p.d)) {
                for (const [nx, ny] of numerals) expect(Math.hypot(x - nx, y - ny)).toBeGreaterThan(0.2);
            }
        }
    });

    it('takes its randomness from the seeded lattice hash, never Math.random', () => {
        const random = vi.spyOn(Math, 'random');
        try {
            buildVines(5);
            buildVines(3, { corners: true });
            expect(random).not.toHaveBeenCalled();
        } finally {
            random.mockRestore();
        }
    });
});

describe('emblems', () => {
    it('ships sunburst, star, crown and skull as valid fills inside the unit circle', () => {
        expect(Object.keys(EMBLEMS)).toEqual(['sunburst', 'star', 'crown', 'skull']);
        expect(Object.keys(EMBLEMS)).toEqual([...BUILTIN_EMBLEM_IDS]);
        for (const [id, paths] of Object.entries(EMBLEMS)) {
            expectValidArt(paths);
            expect(paths.every((p) => p.fill)).toBe(true);
            for (const p of paths) for (const [x, y] of pathPoints(p.d)) expect(Math.hypot(x, y)).toBeLessThanOrEqual(1.001);
            expect(hasEmblem(id)).toBe(true);
            expect(getEmblem(id)).toBe(paths);
        }
        expect(EMBLEMS.sunburst).toHaveLength(17);                                 // 16 rays and a disc
        expect(EMBLEMS.skull.some((p) => p.rule === 'evenodd')).toBe(true);        // eye holes and the nasal notch
        expect(EMBLEMS.star).toHaveLength(1);
        expect(pathPoints(EMBLEMS.star[0].d)).toHaveLength(10);                    // five points, five valleys
    });

    it('rejects unknown ids', () => {
        expect(hasEmblem('nope')).toBe(false);
        expect(() => getEmblem('nope')).toThrow(/unknown emblem art/);
    });
});

describe('decor library', () => {
    it('exposes filigree for every face shape', () => {
        expect(DECOR_SHAPES).toEqual(['tri', 'triCorners', 'square', 'kite', 'pent']);
        expect(hasDecor('filigree')).toBe(true);
        expect(hasDecor('nope')).toBe(false);
        for (const shape of DECOR_SHAPES.filter((s) => s !== 'kite')) expect(getDecor('filigree', shape).length).toBeGreaterThan(0);
        expect(getDecor('filigree', 'square')).toHaveLength(16);
        expect(getDecor('filigree', 'kite')).toEqual([]);          // a d10 face is a triangle plus its belt half: no filigree
        expect(getDecor('filigree', 'pent')).toHaveLength(20);
        expect(DECOR.filigree.triCorners).toHaveLength(8);
    });

    it('exposes frame, corners, knotwork and vines for every face shape but the kite', () => {
        expect(Object.keys(DECOR)).toEqual(['filigree', 'frame', 'corners', 'knotwork', 'vines']);
        expect(Object.keys(DECOR)).toEqual([...BUILTIN_DECOR_IDS]);
        for (const art of Object.keys(DECOR)) {
            expect(hasDecor(art)).toBe(true);
            for (const shape of DECOR_SHAPES) {
                const paths = getDecor(art, shape);
                if (shape === 'kite') expect(paths).toEqual([]);
                else expect(paths.length).toBeGreaterThan(0);
            }
        }
        expect(getDecor('frame', 'square')).toHaveLength(8);
        expect(getDecor('corners', 'pent')).toHaveLength(20);
        expect(getDecor('knotwork', 'tri')).toHaveLength(9);
        expect(getDecor('knotwork', 'triCorners')).toHaveLength(9);
        expect(getDecor('vines', 'tri').length).toBeGreaterThanOrEqual(9);
    });

    it('throws for unknown art or shape', () => {
        expect(() => getDecor('nope', 'tri')).toThrow(/unknown decor art/);
        expect(() => getDecor('filigree', 'hex')).toThrow(/unknown face shape/);
    });
});
