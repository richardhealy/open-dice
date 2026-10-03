/**
 * Seeded value noise, fBm and the four scalar body-texture patterns. Everything here is pure and
 * deterministic so a set paints identically on every machine and every face of a die. The three
 * colour-producing kinds (pour, circuit, felt) live in patterns.js and build on these primitives.
 */

export const PATTERN_KINDS = ['noise', 'marble', 'veins', 'scales', 'pour', 'circuit', 'felt'];

/** 32-bit string hash (FNV-style mixing). */
export function hashSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/** Hash of an integer lattice point to 0..1; the seeded random source for every generator. */
export function lattice(seed, ix, iy) {
    let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + seed) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t) => t * t * (3 - 2 * t);

export function valueNoise(seed, x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const a = lattice(seed, ix, iy), b = lattice(seed, ix + 1, iy);
    const c = lattice(seed, ix, iy + 1), d = lattice(seed, ix + 1, iy + 1);
    const u = smooth(fx), v = smooth(fy);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

export function fbm(seed, x, y, octaves = 4) {
    let sum = 0, amp = 0.5, freq = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
        sum += amp * valueNoise((seed + o * 101) >>> 0, x * freq, y * freq);
        norm += amp;
        amp *= 0.5;
        freq *= 2;
    }
    return sum / norm;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Pattern value at normalised face coordinates (u, v in 0..1).
 * @param {'noise'|'marble'|'veins'|'scales'} kind
 * @param {number} seed
 * @param {number} scale  pattern repeats across the face (1..12)
 */
export function pattern(kind, seed, u, v, scale) {
    const x = u * scale, y = v * scale;
    switch (kind) {
        case 'marble': {
            const t = fbm(seed, x, y, 4);
            return clamp01(0.5 + 0.5 * Math.sin((x + y) * 2.2 + t * 6.0));
        }
        case 'veins': {
            const t = fbm(seed, x, y, 5);
            const ridge = 1 - Math.abs(2 * t - 1);
            return clamp01(Math.pow(Math.max(0, ridge), 6));
        }
        case 'scales': {
            // Rows of overlapping half-discs, each row offset by half a scale; the lower
            // (nearer) row is drawn on top so its rim covers the row above.
            const n = Math.max(2, Math.round(scale));
            const cellW = 1 / n, rowH = cellW * 0.72, r = cellW * 0.68;
            const row = Math.floor(v / rowH);
            let best = 0.15;
            for (let dr = 0; dr <= 1; dr++) {
                const rr = row - dr;
                const off = (rr & 1) ? 0.5 : 0;
                const cy = rr * rowH;
                if (v < cy) continue;
                const col = Math.round(u / cellW - off);
                for (let dc = -1; dc <= 1; dc++) {
                    const cx = (col + dc + off) * cellW;
                    const d = Math.hypot(u - cx, v - cy);
                    if (d <= r) {
                        const val = 0.3 + 0.7 * Math.pow(1 - d / r, 0.55);
                        if (dr === 0) return clamp01(val);
                        best = Math.max(best, val);
                    }
                }
            }
            return clamp01(best);
        }
        default:
            return clamp01(fbm(seed, x, y, 4));
    }
}
