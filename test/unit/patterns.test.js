import { describe, it, expect } from 'vitest';
import { hashSeed, PATTERN_KINDS } from '../../src/sets/noise.js';
import { ramp, smoothstep, pourPixels, circuitMask, feltPixels } from '../../src/sets/patterns.js';

const hex = (h) => {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

function nearestStop(palette, r, g, b) {
    let best = -1, bestD = Infinity;
    palette.forEach((h, i) => {
        const [pr, pg, pb] = hex(h);
        const d = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2;
        if (d < bestD) { bestD = d; best = i; }
    });
    return best;
}

function channelStats(rgb) {
    const n = rgb.length / 3;
    const mean = [0, 0, 0];
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) mean[c] += rgb[i * 3 + c];
    for (let c = 0; c < 3; c++) mean[c] /= n;
    const varSum = [0, 0, 0];
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) varSum[c] += (rgb[i * 3 + c] - mean[c]) ** 2;
    return { mean, std: varSum.map((v) => Math.sqrt(v / n)) };
}

describe('patterns', () => {
    it('PATTERN_KINDS lists the seven kinds in order', () => {
        expect(PATTERN_KINDS).toEqual(['noise', 'marble', 'veins', 'scales', 'pour', 'circuit', 'felt']);
    });

    it('ramp returns the stops at 0 and 1 and the midpoint of a two-stop palette at 0.5', () => {
        const palette = ['#000000', '#FFFFFF'];
        expect(ramp(palette, 0)).toEqual([0, 0, 0]);
        expect(ramp(palette, 1)).toEqual([255, 255, 255]);
        const mid = ramp(palette, 0.5);
        mid.forEach((c) => expect(c).toBeCloseTo(127.5, 5));
        const four = ['#2F5BA8', '#EEE4D2', '#D9A441', '#B23A2E'];
        expect(ramp(four, 0)).toEqual(hex('#2F5BA8'));
        expect(ramp(four, 1)).toEqual(hex('#B23A2E'));
        expect(ramp(four, 1 / 3).map(Math.round)).toEqual(hex('#EEE4D2'));
    });

    it('smoothstep clamps and eases', () => {
        expect(smoothstep(0.25, 0.75, 0)).toBe(0);
        expect(smoothstep(0.25, 0.75, 1)).toBe(1);
        expect(smoothstep(0.25, 0.75, 0.5)).toBeCloseTo(0.5, 10);
        expect(smoothstep(0, 1, 0.25)).toBeCloseTo(0.15625, 10);
    });

    it('pourPixels is deterministic, in range and covers the palette', () => {
        const size = 128;
        const palette = ['#2F5BA8', '#EEE4D2', '#D9A441', '#B23A2E'];
        const seed = hashSeed('tidepool:d20');
        const a = pourPixels({ seed, size, palette });
        const b = pourPixels({ seed, size, palette });
        expect(a.rgb).toBeInstanceOf(Uint8ClampedArray);
        expect(a.rgb.length).toBe(size * size * 3);
        expect(a.value).toBeInstanceOf(Float32Array);
        expect(a.value.length).toBe(size * size);
        expect(Array.from(a.rgb)).toEqual(Array.from(b.rgb));
        expect(Array.from(a.value)).toEqual(Array.from(b.value));
        for (let i = 0; i < a.value.length; i++) {
            expect(a.value[i]).toBeGreaterThanOrEqual(0);
            expect(a.value[i]).toBeLessThanOrEqual(1);
        }
        const counts = [0, 0, 0, 0];
        for (let i = 0; i < size * size; i++) counts[nearestStop(palette, a.rgb[i * 3], a.rgb[i * 3 + 1], a.rgb[i * 3 + 2])]++;
        const covered = counts.filter((c) => c / (size * size) >= 0.05).length;
        expect(covered).toBeGreaterThanOrEqual(3);
        expect(pourPixels({ seed: seed + 1, size, palette }).rgb).not.toEqual(a.rgb);
    });

    it('pourPixels with lacing adds pixels near the lacing colour', () => {
        const size = 96;
        const palette = ['#D0B890', '#C8B088'];
        const seed = hashSeed('lace');
        const lacing = { color: '#FFF4E0', width: 0.03 };
        const near = (px) => {
            const [lr, lg, lb] = hex(lacing.color);
            let n = 0;
            for (let i = 0; i < size * size; i++) {
                if (Math.hypot(px.rgb[i * 3] - lr, px.rgb[i * 3 + 1] - lg, px.rgb[i * 3 + 2] - lb) < 40) n++;
            }
            return n;
        };
        const plain = pourPixels({ seed, size, palette });
        const laced = pourPixels({ seed, size, palette, lacing });
        expect(near(laced)).toBeGreaterThan(near(plain));
        expect(near(laced)).toBeGreaterThan(0);
    });

    it('circuitMask is deterministic, moderately dense and has two pads per walk', () => {
        const size = 256;
        const seed = hashSeed('mainframe:d20');
        const a = circuitMask({ seed, size });
        const b = circuitMask({ seed, size });
        expect(a.mask).toBeInstanceOf(Uint8ClampedArray);
        expect(a.mask.length).toBe(size * size);
        expect(Array.from(a.mask)).toEqual(Array.from(b.mask));
        let set = 0;
        for (let i = 0; i < a.mask.length; i++) {
            expect(a.mask[i] === 0 || a.mask[i] === 255).toBe(true);
            if (a.mask[i]) set++;
        }
        const fraction = set / (size * size);
        expect(fraction).toBeGreaterThanOrEqual(0.04);
        expect(fraction).toBeLessThanOrEqual(0.40);
        expect(a.pads).toBe(80);
        expect(circuitMask({ seed, size, density: 10 }).pads).toBe(20);
        expect(circuitMask({ seed: seed + 1, size }).mask).not.toEqual(a.mask);
    });

    it('feltPixels is deterministic, averages to the blended colour and has grain', () => {
        const size = 128;
        const seed = hashSeed('rose-felt:d6');
        const color = '#C0392B', color2 = '#2B0E0A', contrast = 0.5;
        const a = feltPixels({ seed, size, color, color2, contrast });
        const b = feltPixels({ seed, size, color, color2, contrast });
        expect(a.rgb.length).toBe(size * size * 3);
        expect(a.value.length).toBe(size * size);
        expect(Array.from(a.rgb)).toEqual(Array.from(b.rgb));
        const { mean, std } = channelStats(a.rgb);
        const c1 = hex(color), c2 = hex(color2);
        for (let c = 0; c < 3; c++) {
            const expected = c1[c] + (c2[c] - c1[c]) * (contrast / 2);
            expect(Math.abs(mean[c] - expected)).toBeLessThan(25);
        }
        expect(Math.max(...std)).toBeGreaterThan(2);
    });
});
