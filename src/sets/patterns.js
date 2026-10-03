/**
 * Colour-producing body patterns: pour (marbled paint), circuit (traces and pads) and felt
 * (cloth grain). Each is a pure function of its seed and options, returning raw pixels for
 * the painter to put on a canvas, plus the scalar value the relief map uses. No canvas, no
 * Math.random: the only randomness is the lattice hash from noise.js.
 */

import { valueNoise, fbm, lattice } from './noise.js';

function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Hermite ease from 0 at `a` to 1 at `b`, clamped outside. */
export function smoothstep(a, b, x) {
    const t = clamp01((x - a) / (b - a));
    return t * t * (3 - 2 * t);
}

/** Linear colour ramp through hex stops: `t` 0 is the first stop, 1 the last. Returns [r, g, b]. */
export function ramp(palette, t) {
    const stops = palette.map(hexToRgb);
    const last = stops.length - 1;
    if (last <= 0) return stops[0].slice();
    const pos = clamp01(t) * last;
    const i = Math.min(last - 1, Math.floor(pos));
    const f = pos - i;
    const a = stops[i], b = stops[i + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/**
 * Pour: domain-warped fBm remapped through a colour ramp, like paint poured and swirled.
 * Optional lacing adds thin bright veins where a further noise field crosses its midline.
 * @returns {{ rgb: Uint8ClampedArray, value: Float32Array }} rgb is size*size*3; value is the ramp position.
 */
export function pourPixels({ seed, size, palette, warp = 4, scale = 3, lacing = null }) {
    const s = seed >>> 0;
    const s7 = (s + 7) >>> 0, s13 = (s + 13) >>> 0, s21 = (s + 21) >>> 0;
    const rgb = new Uint8ClampedArray(size * size * 3);
    const value = new Float32Array(size * size);
    const lace = lacing ? hexToRgb(lacing.color) : null;
    const laceWidth = lacing ? (lacing.width ?? 0.02) : 0;
    for (let y = 0; y < size; y++) {
        const v = (y / size) * scale;
        for (let x = 0; x < size; x++) {
            const u = (x / size) * scale;
            const q = fbm(s, u, v);
            const r = fbm(s7, u + warp * q, v + warp * q);
            const w = fbm(s13, u + 1.25 * warp * r, v + 1.25 * warp * r);
            const t = smoothstep(0.25, 0.75, w);
            const i = y * size + x;
            value[i] = t;
            let [cr, cg, cb] = ramp(palette, t);
            if (lace && Math.abs(fbm(s21, 2 * u + 3 * r, 2 * v + 3 * r) - 0.5) < laceWidth) {
                cr += (lace[0] - cr) * 0.7;
                cg += (lace[1] - cg) * 0.7;
                cb += (lace[2] - cb) * 0.7;
            }
            rgb[i * 3] = cr;
            rgb[i * 3 + 1] = cg;
            rgb[i * 3 + 2] = cb;
        }
    }
    return { rgb, value };
}

const TRACE_WIDTH = 0.015;
const PAD_RADIUS = 0.025;
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

function fillRect(mask, size, x0, y0, x1, y1) {
    const xa = Math.max(0, Math.round(Math.min(x0, x1))), xb = Math.min(size - 1, Math.round(Math.max(x0, x1)));
    const ya = Math.max(0, Math.round(Math.min(y0, y1))), yb = Math.min(size - 1, Math.round(Math.max(y0, y1)));
    for (let y = ya; y <= yb; y++) {
        const row = y * size;
        for (let x = xa; x <= xb; x++) mask[row + x] = 255;
    }
}

function fillDisc(mask, size, cx, cy, radius) {
    const r2 = radius * radius;
    const xa = Math.max(0, Math.floor(cx - radius)), xb = Math.min(size - 1, Math.ceil(cx + radius));
    const ya = Math.max(0, Math.floor(cy - radius)), yb = Math.min(size - 1, Math.ceil(cy + radius));
    for (let y = ya; y <= yb; y++) {
        const dy = y + 0.5 - cy;
        const row = y * size;
        for (let x = xa; x <= xb; x++) {
            const dx = x + 0.5 - cx;
            if (dx * dx + dy * dy <= r2) mask[row + x] = 255;
        }
    }
}

/**
 * Circuit: `density` seeded Manhattan walks on a grid×grid lattice of points, each 3..8
 * segments of 1..4 cells with a 50 % chance of turning at every segment, rasterised as traces
 * 1.5 % of the texture wide with a pad disc (radius 2.5 %) at both ends of every walk.
 * @returns {{ mask: Uint8ClampedArray, pads: number }} mask is 0/255 per pixel; pads = density * 2.
 */
export function circuitMask({ seed, size, grid = 12, density = 40 }) {
    const s = seed >>> 0;
    const mask = new Uint8ClampedArray(size * size);
    const cell = size / grid;
    const toPx = (i) => (i + 0.5) * cell;
    const half = (TRACE_WIDTH * size) / 2;
    const padRadius = PAD_RADIUS * size;
    const ends = [];
    for (let w = 0; w < density; w++) {
        let n = 0;
        const rnd = () => lattice(s, w + 1, ++n);
        let px = Math.floor(rnd() * grid), py = Math.floor(rnd() * grid);
        let dir = Math.floor(rnd() * 4);
        const segments = 3 + Math.floor(rnd() * 6);
        ends.push([px, py]);
        for (let k = 0; k < segments; k++) {
            if (k > 0 && rnd() < 0.5) dir = (dir + (rnd() < 0.5 ? 1 : 3)) & 3;
            let len = 1 + Math.floor(rnd() * 4);
            let [dx, dy] = DIRS[dir];
            let nx = px + dx * len, ny = py + dy * len;
            if (nx < 0 || nx >= grid || ny < 0 || ny >= grid) {
                // Leaving the lattice: reverse and shorten to what fits.
                dir = (dir + 2) & 3;
                [dx, dy] = DIRS[dir];
                const room = dx > 0 ? grid - 1 - px : dx < 0 ? px : dy > 0 ? grid - 1 - py : py;
                len = Math.min(len, room);
                nx = px + dx * len; ny = py + dy * len;
            }
            if (len > 0) {
                const x0 = toPx(px), y0 = toPx(py), x1 = toPx(nx), y1 = toPx(ny);
                fillRect(mask, size, Math.min(x0, x1) - half, Math.min(y0, y1) - half, Math.max(x0, x1) + half, Math.max(y0, y1) + half);
                px = nx; py = ny;
            }
        }
        ends.push([px, py]);
    }
    for (const [ix, iy] of ends) fillDisc(mask, size, toPx(ix), toPx(iy), padRadius);
    return { mask, pads: density * 2 };
}

/**
 * Felt: fine per-pixel grain over a soft low-frequency mottle, blending the body colour toward
 * `color2` where the grain is dark. The value is the grain itself for a matte relief.
 * @returns {{ rgb: Uint8ClampedArray, value: Float32Array }}
 */
export function feltPixels({ seed, size, color, color2, contrast = 0.3 }) {
    const s = seed >>> 0, s3 = (s + 3) >>> 0;
    const rgb = new Uint8ClampedArray(size * size * 3);
    const value = new Float32Array(size * size);
    const base = hexToRgb(color), grain = hexToRgb(color2);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const g = 0.5 * valueNoise(s, 0.9 * x, 0.9 * y) + 0.5 * fbm(s3, x / 40, y / 40, 3);
            const t = (1 - g) * contrast;
            const i = y * size + x;
            value[i] = g;
            rgb[i * 3] = base[0] + (grain[0] - base[0]) * t;
            rgb[i * 3 + 1] = base[1] + (grain[1] - base[1]) * t;
            rgb[i * 3 + 2] = base[2] + (grain[2] - base[2]) * t;
        }
    }
    return { rgb, value };
}
