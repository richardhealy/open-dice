import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { setCanvasFactories } from '../../src/sets/canvas-factory.js';
import {
    paintFace, paintNormalMap, shade, mrColor, hexToRgb, scaleColor, faceEmblem, materialEmissiveIntensity,
    TEXTURE_SIZE, BODY_EXPOSURE, NUMERAL_SIZE, CORNER_SIZE, CORNER_OFFSET, _clearPatternCacheForTests,
} from '../../src/sets/face-painter.js';
import { getEmblem } from '../../src/sets/decor/emblems.js';
import { getDiceSet } from '../../src/sets/index.js';
import { makeRecordingCanvas, callsNamed } from './helpers/canvas-stub.js';
import { GEM, INLAY, GLOW, NO_EDGE, POUR, CIRCUIT, VINES, EMBLEM, IMAGE, BODY_IMAGE_SRC, DECOR_IMAGE_SRC } from './helpers/sets.js';
import SNAPSHOT from './helpers/painter-calls-1.4.0.json';

const fillTexts = (c) => callsNamed(c, 'fillText').map((x) => x.args[0]);
const fontsSet = (c) => callsNamed(c, 'set:font').map((x) => x.args[0]);
const stylesSet = (c) => callsNamed(c, 'set:fillStyle').map((x) => x.args[0]);
const strokesSet = (c) => callsNamed(c, 'set:strokeStyle').map((x) => x.args[0]);
const names = (c) => c.calls.map((x) => x.name);
/** A shared pattern canvas: pixels put, nothing drawn or written onto it. */
const isPattern = (c) => callsNamed(c, 'putImageData').length > 0 && callsNamed(c, 'fillText').length === 0 && callsNamed(c, 'drawImage').length === 0;
const pixelsPut = (c) => callsNamed(c, 'putImageData')[0].args[0].data;

describe('face painter', () => {
    let canvases, restore;
    beforeEach(() => {
        _clearPatternCacheForTests();
        canvases = [];
        restore = setCanvasFactories({
            canvas: (size) => { const c = makeRecordingCanvas(size); canvases.push(c); return c; },
            path2D: (d) => ({ d }),
        });
    });
    afterEach(() => restore());

    it('colour helpers', () => {
        expect(hexToRgb('#B5173A')).toEqual([181, 23, 58]);
        expect(shade('#808080', 0.5)).toBe('#c0c0c0');
        expect(shade('#808080', -0.5)).toBe('#404040');
        expect(mrColor(0.28, 1)).toBe('rgb(0, 71, 255)');
        expect(TEXTURE_SIZE).toBe(256);
    });

    it('albedo for a gem: body fill, pattern pixels, depth gradient, decor through the frame, engraved numeral', () => {
        const { canvas, pendingImages } = paintFace({ set: GEM, type: 'd20', face: { text: '20' }, mode: 'albedo' });
        expect(pendingImages).toEqual([]);
        // Body colours are painted below their stated value so the table's lights bring them
        // back up to it (the lights are shared with classic dice and cannot change).
        expect(BODY_EXPOSURE).toBeLessThan(0);
        expect(stylesSet(canvas)[0]).toBe(shade('#B5173A', BODY_EXPOSURE));
        expect(callsNamed(canvas, 'putImageData')).toHaveLength(0);                 // the veins pattern is a shared canvas ...
        expect(callsNamed(canvas, 'drawImage')).toHaveLength(1);                    // ... drawn onto the face
        expect(callsNamed(canvas, 'createRadialGradient')).toHaveLength(2);         // depth + sheen
        expect(callsNamed(canvas, 'translate')[0].args).toEqual([128, 128]);        // frame transform
        expect(callsNamed(canvas, 'scale')[0].args).toEqual([160, -160]);
        expect(callsNamed(canvas, 'rotate')[0].args[0]).toBeCloseTo(-Math.PI / 8, 9);
        expect(callsNamed(canvas, 'stroke').length).toBe(12);                       // 6 bands + 6 inner lines
        expect(callsNamed(canvas, 'fill').length).toBe(6);                          // berries + knots
        expect(fontsSet(canvas).at(-1)).toBe('700 114px OpenDiceNumerals, Georgia, "Times New Roman", serif');
        expect(fillTexts(canvas)).toEqual(['20', '20', '20']);                      // engraved = light, dark, face
        const last = callsNamed(canvas, 'fillText').at(-1).args;
        expect(last).toEqual(['20', 128, 128]);
    });

    it('secret faces paint ? and never consult decals', () => {
        let looked = 0;
        const registry = { get: () => { looked++; return null; }, load: () => Promise.resolve(null) };
        const { canvas } = paintFace({ set: GEM, type: 'd6', face: { text: '6' }, isSecret: true, decals: { '6': { src: '/skull.svg' } }, decalRegistry: registry, mode: 'albedo' });
        expect(fillTexts(canvas)).toEqual(['?', '?', '?']);
        expect(looked).toBe(0);
    });

    it('a loaded decal replaces the numeral in albedo and leaves no glyph in the MR map', () => {
        const img = { width: 64, height: 64 };
        const registry = { get: () => img, load: () => Promise.resolve(img) };
        const albedo = paintFace({ set: INLAY, type: 'd6', face: { text: '1' }, decals: { '1': { src: '/sword.svg', scale: 0.7 } }, decalRegistry: registry, mode: 'albedo' });
        const decalDraws = (c) => callsNamed(c, 'drawImage').filter((x) => x.args[0] === img);
        expect(decalDraws(albedo.canvas)).toHaveLength(1);                            // the icon, once
        expect(callsNamed(albedo.canvas, 'drawImage').length - 1).toBe(1);             // plus the shared marble pattern, once
        expect(fillTexts(albedo.canvas)).toEqual([]);
        const mr = paintFace({ set: INLAY, type: 'd6', face: { text: '1' }, decals: { '1': { src: '/sword.svg', scale: 0.7 } }, decalRegistry: registry, mode: 'mr' });
        expect(fillTexts(mr.canvas)).toEqual([]);
        expect(decalDraws(mr.canvas)).toHaveLength(0);
    });

    it('an unloaded decal paints the numeral now and reports the pending source', () => {
        const registry = { get: () => undefined, load: () => Promise.resolve(null) };
        const { canvas, pendingImages } = paintFace({ set: GEM, type: 'd8', face: { text: '3' }, decals: { '3': { src: '/shield.svg' } }, decalRegistry: registry, mode: 'albedo' });
        expect(pendingImages).toEqual(['/shield.svg']);
        expect(fillTexts(canvas)).toEqual(['3', '3', '3']);
    });

    it('MR map: body values as background, gold decor, no glyph for engraved numerals', () => {
        const { canvas } = paintFace({ set: GEM, type: 'd20', face: { text: '7' }, mode: 'mr' });
        expect(stylesSet(canvas)[0]).toBe('rgb(0, 41, 0)');
        expect(callsNamed(canvas, 'set:strokeStyle').map((x) => x.args[0])).toContain('rgb(0, 71, 255)');
        expect(fillTexts(canvas)).toEqual([]);
        expect(callsNamed(canvas, 'putImageData')).toHaveLength(0);
    });

    it('MR map paints inlay numerals as gilded paint (partly metallic, rougher) so they read gold on unlit faces too', () => {
        const { canvas } = paintFace({ set: INLAY, type: 'd12', face: { text: '12' }, mode: 'mr' });
        expect(fillTexts(canvas)).toEqual(['12']);
        expect(stylesSet(canvas).at(-1)).toBe('rgb(0, 102, 140)');       // roughness 0.4, metalness 0.55: keeps a diffuse gold response
    });

    it('emissive map is black with glowing numerals only for the glow style', () => {
        const glow = paintFace({ set: GLOW, type: 'd20', face: { text: '20' }, mode: 'emissive' });
        expect(stylesSet(glow.canvas)[0]).toBe('#000000');
        expect(fillTexts(glow.canvas)).toEqual(['20']);
        expect(stylesSet(glow.canvas).at(-1)).toBe('#FF7A1A');
        const gem = paintFace({ set: GEM, type: 'd20', face: { text: '20' }, mode: 'emissive' });
        expect(fillTexts(gem.canvas)).toEqual([]);
    });

    it('d4 corners: three numerals rotated by 120 degrees, numerals offset above centre', () => {
        const { canvas } = paintFace({ set: GEM, type: 'd4', face: { values: [2, 4, 3] }, mode: 'albedo' });
        expect(fillTexts(canvas)).toEqual(['2', '2', '2', '4', '4', '4', '3', '3', '3']);
        const thirds = callsNamed(canvas, 'rotate').filter((r) => Math.abs(r.args[0] - (Math.PI * 2) / 3) < 1e-9);
        expect(thirds).toHaveLength(3);
        expect(callsNamed(canvas, 'fillText')[2].args.slice(1)).toEqual([128, 128 - 256 * 0.3]);
        expect(fontsSet(canvas).at(-1)).toBe('700 68px OpenDiceNumerals, Georgia, "Times New Roman", serif');
    });

    it('d100 faces honour textOffsetY', () => {
        const { canvas } = paintFace({ set: INLAY, type: 'd100', face: { text: '90' }, textOffsetY: 16, mode: 'albedo' });
        expect(callsNamed(canvas, 'fillText').at(-1).args).toEqual(['90', 128, 144]);
        expect(callsNamed(canvas, 'stroke').length).toBeGreaterThan(0);              // the 90 underline
    });

    it('blank faces paint the body only', () => {
        const { canvas } = paintFace({ set: INLAY, type: 'd6', face: null, mode: 'albedo' });
        expect(fillTexts(canvas)).toEqual([]);
        expect(callsNamed(canvas, 'fillRect').length).toBeGreaterThan(0);
    });

    it('repaints onto a supplied canvas instead of creating one', () => {
        const existing = makeRecordingCanvas(256);
        const { canvas } = paintFace({ set: GEM, type: 'd6', face: { text: '2' }, mode: 'albedo', canvas: existing });
        expect(canvas).toBe(existing);
        expect(canvases.filter((c) => c.calls.some((x) => x.name === 'fillText'))).toHaveLength(0);   // no new face canvas
        expect(callsNamed(existing, 'setTransform')[0].args).toEqual([1, 0, 0, 1, 0, 0]);
    });

    it('a 1.4.0 object decor and its normalised one-layer array paint identical calls (Review Focus 1)', () => {
        const legacy = { ...GEM, decor: { art: 'filigree', metal: 'gold', relief: 0.6 } };
        const calls = (set, mode) => {
            canvases = [];
            _clearPatternCacheForTests();
            paintFace({ set, type: 'd20', face: '20', mode });
            // Canvas, gradient and ImageData arguments are fresh objects each run: compare their
            // content (functions and pixel buffers reduced to stable markers), not their identity.
            const stable = (k, v) => (typeof v === 'function' ? '<fn>'
                : v && v.BYTES_PER_ELEMENT ? `bytes:${v.length}:${v.reduce((sum, x) => sum + x, 0)}` : v);
            return canvases.flatMap((c) => c.getContext('2d').calls.map((call) => JSON.stringify(call, stable)));
        };
        for (const mode of ['albedo', 'mr', 'height']) expect(calls(GEM, mode)).toEqual(calls(legacy, mode));
        expect(paintNormalMap({ set: legacy, type: 'd20' })).not.toBeNull();
    });

    it('normal map exists for decor relief or textured bodies and is null otherwise', () => {
        expect(paintNormalMap({ set: GEM, type: 'd20' })).not.toBeNull();         // decor relief
        expect(paintNormalMap({ set: GLOW, type: 'd20' })).not.toBeNull();        // texture strength
        expect(paintNormalMap({ set: INLAY, type: 'd20' })).toBeNull();           // neither
        expect(paintNormalMap({ set: NO_EDGE, type: 'd20' })).toBeNull();
        const out = canvases.at(-1);
        const put = callsNamed(out, 'putImageData')[0];
        expect(put.args[0].data).toHaveLength(256 * 256 * 4);
    });
});

describe('face painter: layers, emblems, images', () => {
    let canvases, restore;
    beforeEach(() => {
        _clearPatternCacheForTests();
        canvases = [];
        restore = setCanvasFactories({
            canvas: (size) => { const c = makeRecordingCanvas(size); canvases.push(c); return c; },
            path2D: (d) => ({ d }),
        });
    });
    afterEach(() => restore());

    const patterns = () => canvases.filter(isPattern);
    const paint = (opts) => paintFace({ mode: 'albedo', ...opts });

    it('scaleColor dims a colour toward black by a ratio and leaves it verbatim at full', () => {
        expect(scaleColor('#FF7A1A', 1)).toBe('#FF7A1A');
        expect(scaleColor('#FF7A1A', 2)).toBe('#FF7A1A');
        expect(scaleColor('#ffffff', 0.5)).toBe('#808080');
        expect(scaleColor('#3CFF78', 0.35 / 1.6)).toBe('#0d381a');
    });

    it('pour albedo: body fill, the cached pattern canvas, the vignette, the decor frame, then the numeral', () => {
        const { canvas } = paint({ set: POUR, type: 'd20', face: { text: '20' } });
        const n = names(canvas);
        const first = (name) => n.indexOf(name);
        expect(first('fillRect')).toBeGreaterThanOrEqual(0);
        expect(first('fillRect')).toBeLessThan(first('drawImage'));
        expect(first('drawImage')).toBeLessThan(first('createRadialGradient'));
        expect(first('createRadialGradient')).toBeLessThan(first('translate'));
        expect(first('translate')).toBeLessThan(first('fillText'));
        expect(callsNamed(canvas, 'createRadialGradient')).toHaveLength(1);          // the vignette only: the sheen is gem/glass
        expect(callsNamed(canvas, 'putImageData')).toHaveLength(0);
        expect(patterns()).toHaveLength(1);
        expect(callsNamed(canvas, 'drawImage')[0].args[0]).toBe(patterns()[0]);
        // The pour pixels reach at least three of the four palette stops (painted at body exposure).
        const stops = POUR.body.texture.palette.map((c) => hexToRgb(shade(c, BODY_EXPOSURE)));
        const data = pixelsPut(patterns()[0]);
        const seen = new Set();
        for (let i = 0; i < data.length; i += 4 * 97) {
            let best = 0, bestD = Infinity;
            stops.forEach(([r, g, b], k) => { const d = Math.hypot(data[i] - r, data[i + 1] - g, data[i + 2] - b); if (d < bestD) { bestD = d; best = k; } });
            seen.add(best);
        }
        expect(seen.size).toBeGreaterThanOrEqual(3);
        expect(fillTexts(canvas)).toEqual(['20', '20']);                                 // inlay: shadow + metal
    });

    it('vignette 0 paints no radial gradient on a textured body; a gem keeps its depth and sheen', () => {
        const flat = { ...POUR, body: { ...POUR.body, vignette: 0 } };
        expect(callsNamed(paint({ set: flat, type: 'd20', face: { text: '1' } }).canvas, 'createRadialGradient')).toHaveLength(0);
        expect(callsNamed(paint({ set: GEM, type: 'd20', face: { text: '1' } }).canvas, 'createRadialGradient')).toHaveLength(2);
    });

    it('perFace seeds one pattern per face value and reuses it for the same face', () => {
        paint({ set: POUR, type: 'd20', face: { text: '1' } });
        paint({ set: POUR, type: 'd20', face: { text: '2' } });
        expect(patterns()).toHaveLength(2);
        const sum = (c) => pixelsPut(c).reduce((s, v) => s + v, 0);
        expect(sum(patterns()[0])).not.toBe(sum(patterns()[1]));
        paint({ set: POUR, type: 'd20', face: { text: '1' } });
        paint({ set: POUR, type: 'd20', face: { text: '1' }, mode: 'mr' });
        expect(patterns()).toHaveLength(2);
        // A different die type is a different seed even for the same value.
        paint({ set: POUR, type: 'd6', face: { text: '1' } });
        expect(patterns()).toHaveLength(3);
    });

    it('perFace on a d4 seeds by the corner values: three faces differ, a repaint is stable (Review Focus 4)', () => {
        paint({ set: POUR, type: 'd4', face: { values: [1, 2, 3] } });
        paint({ set: POUR, type: 'd4', face: { values: [2, 3, 4] } });
        paint({ set: POUR, type: 'd4', face: { values: [3, 4, 1] } });
        expect(patterns()).toHaveLength(3);
        paint({ set: POUR, type: 'd4', face: { values: [1, 2, 3] } });
        expect(patterns()).toHaveLength(3);
        const sums = patterns().map((c) => pixelsPut(c).reduce((s, v) => s + v, 0));
        expect(new Set(sums).size).toBe(3);
    });

    it('without perFace every face shares one pattern, as before', () => {
        paint({ set: GEM, type: 'd20', face: { text: '1' } });
        paint({ set: GEM, type: 'd20', face: { text: '2' } });
        paint({ set: GEM, type: 'd4', face: { values: [1, 2, 3] } });
        expect(patterns()).toHaveLength(2);                                              // one per die type
    });

    it('a colour decor layer paints its colour in albedo, nothing in the MR map and white relief in the height map', () => {
        const albedo = paint({ set: VINES, type: 'd20', face: { text: '7' } }).canvas;
        expect(callsNamed(albedo, 'stroke').length).toBeGreaterThan(0);
        expect(strokesSet(albedo).filter((s) => s !== '#CDEFEB')).toEqual([]);           // no darker metal edge line
        const mr = paint({ set: VINES, type: 'd20', face: { text: '7' }, mode: 'mr' }).canvas;
        expect(callsNamed(mr, 'stroke')).toHaveLength(0);
        expect(callsNamed(mr, 'fill')).toHaveLength(0);
        expect(fillTexts(mr)).toEqual([]);
        const height = paint({ set: VINES, type: 'd20', face: null, mode: 'height' }).canvas;
        expect(callsNamed(height, 'stroke').length).toBeGreaterThan(0);
        expect(strokesSet(height).at(-1)).toBe('#ffffff');
        expect(paintNormalMap({ set: VINES, type: 'd20' })).not.toBeNull();            // colour relief counts
    });

    it('a glow decor layer paints in emissive mode at its intensity relative to the material', () => {
        const em = paint({ set: VINES, type: 'd20', face: { text: '7' }, mode: 'emissive' }).canvas;
        expect(stylesSet(em)[0]).toBe('#000000');
        expect(callsNamed(em, 'stroke').length).toBeGreaterThan(0);
        expect(strokesSet(em)).toContain(scaleColor('#CDEFEB', 0.6 / 1.6));              // vines at 0.375 of the numerals' 1.6
        expect(stylesSet(em).at(-1)).toBe('#CDEFEB');                                    // the glow numeral at full
        expect(fillTexts(em)).toEqual(['7']);
        // When the decor is the only glow it is painted at full intensity and sets the material's.
        const solo = { ...VINES, numeral: { ...VINES.numeral, style: 'flat', glow: null } };
        const only = paint({ set: solo, type: 'd20', face: { text: '7' }, mode: 'emissive' }).canvas;
        expect(strokesSet(only)).toContain('#CDEFEB');
        expect(fillTexts(only)).toEqual([]);
        // A metal layer never glows and a glow-0 colour layer paints nothing in emissive mode.
        const dull = { ...VINES, decor: [{ ...VINES.decor[0], glow: 0 }] };
        expect(callsNamed(paint({ set: dull, type: 'd20', face: null, mode: 'emissive' }).canvas, 'stroke')).toHaveLength(0);
        expect(callsNamed(paint({ set: GEM, type: 'd20', face: null, mode: 'emissive' }).canvas, 'stroke')).toHaveLength(0);
    });

    it('a decor layer scale is applied after the frame transform only when it is not 1', () => {
        const scaled = { ...POUR, decor: [{ ...POUR.decor[0], scale: 1.5 }] };
        const c = paint({ set: scaled, type: 'd6', face: { text: '6' } }).canvas;
        expect(callsNamed(c, 'scale').map((x) => x.args)).toContainEqual([1.5, 1.5]);
        const plain = paint({ set: POUR, type: 'd6', face: { text: '6' } }).canvas;
        expect(callsNamed(plain, 'scale').map((x) => x.args)).not.toContainEqual([1, 1]);
    });

    it('materialEmissiveIntensity is the brightest of numerals, body and decor, or 1', () => {
        expect(materialEmissiveIntensity(GLOW)).toBe(1.6);
        expect(materialEmissiveIntensity(CIRCUIT)).toBe(1.6);
        expect(materialEmissiveIntensity(VINES)).toBe(1.6);
        expect(materialEmissiveIntensity({ ...CIRCUIT, numeral: { ...CIRCUIT.numeral, style: 'flat', glow: null } })).toBe(0.35);
        expect(materialEmissiveIntensity({ ...VINES, numeral: { ...VINES.numeral, style: 'flat', glow: null } })).toBe(0.6);
        expect(materialEmissiveIntensity({ ...VINES, body: { ...VINES.body, emissive: { color: '#ffffff', intensity: 2.5 } } })).toBe(2.5);
        expect(materialEmissiveIntensity(GEM)).toBe(1);
        expect(materialEmissiveIntensity(INLAY)).toBe(1);
    });

    it('emissive mode paints the circuit traces in the body emissive colour scaled by intensity / materialIntensity', () => {
        const { canvas } = paint({ set: CIRCUIT, type: 'd20', face: { text: '7' }, mode: 'emissive' });
        expect(stylesSet(canvas)[0]).toBe('#000000');
        const draws = callsNamed(canvas, 'drawImage');
        expect(draws).toHaveLength(1);
        const mask = draws[0].args[0];
        expect(canvases).toContain(mask);
        const data = pixelsPut(mask);
        const lit = hexToRgb(scaleColor('#3CFF78', 0.35 / 1.6));
        let on = 0, off = 0;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i] === lit[0] && data[i + 1] === lit[1] && data[i + 2] === lit[2] && data[i + 3] === 255) on++;
            else if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0) off++;
        }
        expect(on + off).toBe(256 * 256);
        expect(on / (on + off)).toBeGreaterThan(0.04);
        expect(on / (on + off)).toBeLessThan(0.4);
        // The glow numeral paints on top at full intensity, in the monospace stack.
        expect(stylesSet(canvas).at(-1)).toBe('#3CFF78');
        expect(fillTexts(canvas)).toEqual(['7']);
        // The mask canvas is cached: a second face draws the same one.
        const again = paint({ set: CIRCUIT, type: 'd20', face: { text: '8' }, mode: 'emissive' }).canvas;
        expect(callsNamed(again, 'drawImage')[0].args[0]).toBe(mask);
    });

    it('emissive mode lights other patterns where their value exceeds 0.5, and nothing without body.emissive', () => {
        const glowing = { ...POUR, body: { ...POUR.body, emissive: { color: '#FFFFFF', intensity: 0.5 } } };
        const { canvas } = paint({ set: glowing, type: 'd20', face: { text: '7' }, mode: 'emissive' });
        const mask = callsNamed(canvas, 'drawImage')[0].args[0];
        const data = pixelsPut(mask);
        let on = 0;
        for (let i = 0; i < data.length; i += 4) if (data[i] === 255) on++;
        expect(on / (256 * 256)).toBeGreaterThan(0.1);
        expect(on / (256 * 256)).toBeLessThan(0.9);
        expect(callsNamed(paint({ set: POUR, type: 'd20', face: { text: '7' }, mode: 'emissive' }).canvas, 'drawImage')).toHaveLength(0);
    });

    it('faceEmblem resolves a value to its normalised emblem, a shorthand string to the numeral colour, or null', () => {
        expect(faceEmblem(EMBLEM, '20')).toEqual(EMBLEM.emblems['20']);
        expect(faceEmblem(EMBLEM, 20)).toEqual(EMBLEM.emblems['20']);
        expect(faceEmblem(EMBLEM, '7')).toBeNull();
        expect(faceEmblem(GEM, '20')).toBeNull();
        expect(faceEmblem({ ...GEM, emblems: { '1': 'skull' } }, '1')).toEqual({ art: 'skull', metal: null, color: '#2A0912', scale: 0.8, relief: 0.5 });
    });

    it('an emblem replaces the numeral in albedo, MR, emissive and height maps through a centred, y-up transform', () => {
        const decorFills = 6;                                                            // filigree berries + knots on a tri
        const sun = getEmblem('sunburst').length;                                        // 16 rays + disc
        const k = 160 * 0.9 * 0.5;                                                       // R · scale · 0.5 for the d20 frame
        const albedo = paint({ set: EMBLEM, type: 'd20', face: { text: '20' } }).canvas;
        expect(fillTexts(albedo)).toEqual([]);
        expect(callsNamed(albedo, 'fill')).toHaveLength(decorFills + sun);
        expect(stylesSet(albedo).at(-1)).toBe('#D4AF37');
        expect(callsNamed(albedo, 'translate').at(-1).args).toEqual([128, 128]);
        expect(callsNamed(albedo, 'scale').at(-1).args).toEqual([k, -k]);
        const mr = paint({ set: EMBLEM, type: 'd20', face: { text: '20' }, mode: 'mr' }).canvas;
        expect(fillTexts(mr)).toEqual([]);
        expect(callsNamed(mr, 'fill')).toHaveLength(decorFills + sun);
        expect(stylesSet(mr).at(-1)).toBe(mrColor(0.28, 1));
        const height = paint({ set: EMBLEM, type: 'd20', face: { text: '20' }, mode: 'height' }).canvas;
        expect(callsNamed(height, 'fill')).toHaveLength(decorFills + sun);
        expect(stylesSet(height).at(-1)).toBe(scaleColor('#ffffff', 0.5 / 0.6));         // relief 0.5 against the decor's 0.6
        const emissive = paint({ set: EMBLEM, type: 'd20', face: { text: '20' }, mode: 'emissive' }).canvas;
        expect(callsNamed(emissive, 'fill')).toHaveLength(0);                            // no glow on this emblem
        const lit = { ...EMBLEM, emblems: { '20': { ...EMBLEM.emblems['20'], metal: null, color: '#FFFFFF', glow: 0.8 } } };
        const glow = paint({ set: lit, type: 'd20', face: { text: '20' }, mode: 'emissive' }).canvas;
        expect(callsNamed(glow, 'fill')).toHaveLength(sun);
        expect(stylesSet(glow).at(-1)).toBe('#FFFFFF');
        expect(materialEmissiveIntensity(lit)).toBe(0.8);
    });

    it('a colour emblem paints its colour with the even-odd rule where the art asks for it; other faces keep numerals', () => {
        const one = paint({ set: EMBLEM, type: 'd20', face: { text: '1' } }).canvas;
        expect(fillTexts(one)).toEqual([]);
        const fills = callsNamed(one, 'fill');
        expect(fills.filter((c) => c.args[1] === 'evenodd')).toHaveLength(2);           // the skull's two even-odd paths
        expect(fills.filter((c) => c.args.length === 1)).toHaveLength(6);               // the decor
        expect(stylesSet(one).at(-1)).toBe('#2A0912');
        const mr = paint({ set: EMBLEM, type: 'd20', face: { text: '1' }, mode: 'mr' }).canvas;
        expect(callsNamed(mr, 'fill')).toHaveLength(6);                                  // dielectric: no emblem in the MR map
        const seven = paint({ set: EMBLEM, type: 'd20', face: { text: '7' } }).canvas;
        expect(fillTexts(seven)).toEqual(['7', '7', '7']);
        const secret = paint({ set: EMBLEM, type: 'd20', face: { text: '20' }, isSecret: true }).canvas;
        expect(fillTexts(secret)).toEqual(['?', '?', '?']);
        expect(callsNamed(secret, 'fill')).toHaveLength(6);
    });

    it('a d4 corner value with an emblem paints it at the corner, sized like a corner numeral', () => {
        const { canvas } = paint({ set: EMBLEM, type: 'd4', face: { values: [1, 2, 3] } });
        expect(fillTexts(canvas)).toEqual(['2', '2', '2', '3', '3', '3']);
        expect(callsNamed(canvas, 'fill').filter((c) => c.args[1] === 'evenodd')).toHaveLength(2);
        const corner = callsNamed(canvas, 'translate').find((t) => t.args[1] === 128 - 256 * 0.3);
        expect(corner).toBeDefined();
        const R = 256 / (2 * 0.9);
        const k = callsNamed(canvas, 'scale').find((s) => s.args[0] !== 256 / (2 * 0.9) && s.args[0] < 100);
        expect(k.args[0]).toBeCloseTo(R * 0.8 * 0.5 * (CORNER_SIZE / NUMERAL_SIZE), 6);
        expect(k.args[1]).toBeCloseTo(-k.args[0], 9);
        expect(CORNER_OFFSET).toBe(0.3);
    });

    it('a loaded decal wins over an emblem in every map (Review Focus 2)', () => {
        const img = { width: 64, height: 64 };
        const registry = { get: () => img, load: () => Promise.resolve(img) };
        const decals = { '20': { src: '/crit.svg' } };
        for (const mode of ['albedo', 'mr', 'emissive', 'height']) {
            const { canvas, pendingImages } = paint({ set: EMBLEM, type: 'd20', face: { text: '20' }, decals, decalRegistry: registry, mode });
            expect(pendingImages).toEqual([]);
            expect(callsNamed(canvas, 'fill'), mode).toHaveLength(mode === 'emissive' ? 0 : 6);   // decor only, never the sunburst
            expect(callsNamed(canvas, 'drawImage').filter((d) => d.args[0] === img), mode).toHaveLength(mode === 'albedo' ? 1 : 0);
            expect(fillTexts(canvas)).toEqual([]);
        }
        // Until the decal loads, the emblem stands in for the numeral and the source is pending.
        const waiting = { get: () => undefined, load: () => Promise.resolve(img) };
        const { canvas, pendingImages } = paint({ set: EMBLEM, type: 'd20', face: { text: '20' }, decals, decalRegistry: waiting });
        expect(pendingImages).toEqual(['/crit.svg']);
        expect(callsNamed(canvas, 'fill')).toHaveLength(6 + getEmblem('sunburst').length);
    });

    it('a cover body image is cropped to the canvas aspect and drawn at the canvas size instead of the pattern', () => {
        const img = { width: 128, height: 64 };
        const registry = { get: (src) => (src === BODY_IMAGE_SRC ? img : undefined), load: () => Promise.resolve(img) };
        const { canvas, pendingImages } = paint({ set: IMAGE, type: 'd6', face: { text: '6' }, decalRegistry: registry });
        expect(callsNamed(canvas, 'drawImage')[0].args).toEqual([img, 32, 0, 64, 64, 0, 0, 256, 256]);
        expect(patterns()).toHaveLength(0);                                              // the marble pattern is not computed
        expect(pendingImages).toEqual([DECOR_IMAGE_SRC]);                               // the decor image is still loading
        expect(fillTexts(canvas)).toEqual(['6', '6']);
        const tall = { width: 50, height: 200 };
        const r2 = { get: () => tall, load: () => Promise.resolve(tall) };
        const c2 = paint({ set: { ...IMAGE, decor: null }, type: 'd6', face: { text: '6' }, decalRegistry: r2 }).canvas;
        expect(callsNamed(c2, 'drawImage')[0].args).toEqual([tall, 0, 75, 50, 50, 0, 0, 256, 256]);
    });

    it('a tile body image fills through createPattern from a scratch tile of size / scale', () => {
        const img = { width: 64, height: 64 };
        const registry = { get: (src) => (src === BODY_IMAGE_SRC ? img : undefined), load: () => Promise.resolve(img) };
        const tiled = { ...IMAGE, decor: null, body: { ...IMAGE.body, image: { src: BODY_IMAGE_SRC, fit: 'tile', scale: 4 } } };
        const { canvas } = paint({ set: tiled, type: 'd6', face: { text: '6' }, decalRegistry: registry });
        const pattern = callsNamed(canvas, 'createPattern');
        expect(pattern).toHaveLength(1);
        const tile = pattern[0].args[0];
        expect(pattern[0].args[1]).toBe('repeat');
        expect(tile.width).toBe(64);
        expect(callsNamed(tile, 'drawImage')[0].args).toEqual([img, 0, 0, 64, 64]);
        const n = names(canvas);
        const at = n.indexOf('createPattern');
        expect(n[at + 1]).toBe('set:fillStyle');
        expect(n[at + 2]).toBe('fillRect');
        expect(callsNamed(canvas, 'fillRect')[1].args).toEqual([0, 0, 256, 256]);
    });

    it('an unloaded body image paints the fallback and reports every missing source, with or without a registry', () => {
        const registry = { get: () => undefined, load: () => Promise.resolve(null) };
        const { canvas, pendingImages } = paint({ set: IMAGE, type: 'd6', face: { text: '6' }, decalRegistry: registry });
        expect(pendingImages).toEqual([BODY_IMAGE_SRC, DECOR_IMAGE_SRC]);
        expect(stylesSet(canvas)[0]).toBe(shade('#0B0B10', BODY_EXPOSURE));
        expect(patterns()).toHaveLength(1);                                              // the marble pattern stands in
        expect(callsNamed(canvas, 'drawImage')[0].args[0]).toBe(patterns()[0]);
        const bare = paint({ set: IMAGE, type: 'd6', face: { text: '6' } });
        expect(bare.pendingImages).toEqual([BODY_IMAGE_SRC, DECOR_IMAGE_SRC]);
        expect(fillTexts(bare.canvas)).toEqual(['6', '6']);
        // A loaded source is never reported twice.
        const both = { get: () => ({ width: 8, height: 8 }), load: () => Promise.resolve(null) };
        expect(paint({ set: IMAGE, type: 'd6', face: { text: '6' }, decalRegistry: both }).pendingImages).toEqual([]);
    });

    it('a metal image decor layer draws the image in albedo and fills its alpha with the metal in MR and white in height', () => {
        const img = { width: 256, height: 256 };
        const registry = { get: (src) => (src === DECOR_IMAGE_SRC ? img : undefined), load: () => Promise.resolve(img) };
        const set = { ...IMAGE, body: { ...IMAGE.body, image: null } };
        const albedo = paint({ set, type: 'd6', face: { text: '6' }, decalRegistry: registry }).canvas;
        expect(callsNamed(albedo, 'drawImage').filter((d) => d.args[0] === img).map((d) => d.args)).toEqual([[img, 0, 0, 256, 256]]);
        canvases = [];
        const mr = paint({ set, type: 'd6', face: { text: '6' }, decalRegistry: registry, mode: 'mr' }).canvas;
        const scratch = canvases.find((c) => c !== mr && callsNamed(c, 'drawImage').some((d) => d.args[0] === img));
        expect(scratch).toBeDefined();
        expect(names(scratch)).toEqual(['set:fillStyle', 'fillRect', 'set:globalCompositeOperation', 'drawImage']);
        expect(stylesSet(scratch)[0]).toBe(mrColor(0.28, 1));
        expect(callsNamed(scratch, 'set:globalCompositeOperation')[0].args[0]).toBe('destination-in');
        expect(callsNamed(mr, 'drawImage').map((d) => d.args[0])).toContain(scratch);
        canvases = [];
        const height = paint({ set, type: 'd6', face: null, decalRegistry: registry, mode: 'height' }).canvas;
        const hs = canvases.find((c) => c !== height && callsNamed(c, 'drawImage').some((d) => d.args[0] === img));
        expect(stylesSet(hs)[0]).toBe('#ffffff');
        expect(callsNamed(height, 'drawImage').map((d) => d.args[0])).toContain(hs);
        expect(paintNormalMap({ set, type: 'd6' })).not.toBeNull();
    });

    it('a colour image decor layer tints the image alpha in albedo, skips the MR map and glows when asked', () => {
        const img = { width: 256, height: 256 };
        const registry = { get: (src) => (src === DECOR_IMAGE_SRC ? img : undefined), load: () => Promise.resolve(img) };
        const set = { ...IMAGE, body: { ...IMAGE.body, image: null },
            decor: [{ art: null, image: { src: DECOR_IMAGE_SRC }, metal: null, color: '#FF00FF', relief: 0.4, scale: 1, glow: 0.5 }] };
        const albedo = paint({ set, type: 'd6', face: { text: '6' }, decalRegistry: registry }).canvas;
        const scratch = canvases.find((c) => c !== albedo && callsNamed(c, 'drawImage').some((d) => d.args[0] === img));
        expect(stylesSet(scratch)[0]).toBe('#FF00FF');
        expect(callsNamed(albedo, 'drawImage').filter((d) => d.args[0] === img)).toHaveLength(0);
        expect(callsNamed(albedo, 'drawImage').map((d) => d.args[0])).toContain(scratch);
        const mr = paint({ set, type: 'd6', face: { text: '6' }, decalRegistry: registry, mode: 'mr' }).canvas;
        expect(callsNamed(mr, 'drawImage')).toHaveLength(0);
        const em = paint({ set, type: 'd6', face: { text: '6' }, decalRegistry: registry, mode: 'emissive' }).canvas;
        const drawn = callsNamed(em, 'drawImage').map((d) => d.args[0]);
        expect(drawn).toHaveLength(1);
        expect(stylesSet(drawn[0])[0]).toBe('#FF00FF');                                  // the only glow: full intensity
        expect(callsNamed(drawn[0], 'drawImage')[0].args[0]).toBe(img);
        expect(materialEmissiveIntensity(set)).toBe(0.5);
    });

    it('the font string comes from fontStack: embedded families gain their fallback, others pass verbatim', () => {
        expect(fontsSet(paint({ set: CIRCUIT, type: 'd20', face: { text: '7' } }).canvas).at(-1)).toBe('400 114px OpenDiceMono, "Courier New", monospace');
        const papyrus = { ...GEM, numeral: { ...GEM.numeral, font: 'Papyrus' } };
        expect(fontsSet(paint({ set: papyrus, type: 'd20', face: { text: '7' } }).canvas).at(-1)).toBe('700 114px Papyrus');
    });

    const stable = (k, v) => (typeof v === 'function' ? '<fn>'
        : v && v.BYTES_PER_ELEMENT ? `bytes:${v.length}:${v.reduce((sum, x) => sum + x, 0)}` : v);
    function record(set, type, face, mode) {
        canvases = [];
        _clearPatternCacheForTests();
        if (mode === 'normal') paintNormalMap({ set, type });
        else paintFace({ set, type, face, mode });
        return canvases.map((c) => c.getContext('2d').calls.map((call) => JSON.stringify(call, stable)));
    }

    it('a 1.4.0 gem paints the very same call sequence as before this change, in every map (Review Focus 1)', () => {
        for (const mode of ['albedo', 'mr', 'emissive', 'height', 'normal']) {
            expect(record(GEM, 'd20', { text: '20' }, mode), mode).toEqual(SNAPSHOT.gem[mode]);
        }
        expect(record(GEM, 'd4', { values: [2, 4, 3] }, 'albedo')).toEqual(SNAPSHOT.gem['d4-albedo']);
    });

    it('a hand-built 1.4.0 set without the new fields paints exactly like its 1.5.0 twin', () => {
        const legacy = { ...GEM, body: { ...GEM.body, texture: { ...GEM.body.texture } } };
        delete legacy.emblems;
        delete legacy.body.vignette;
        delete legacy.body.emissive;
        delete legacy.body.image;
        delete legacy.body.normalImage;
        delete legacy.body.texture.perFace;
        legacy.decor = [{ art: 'filigree', metal: 'gold', relief: 0.6 }];
        for (const mode of ['albedo', 'mr', 'emissive', 'height', 'normal']) {
            expect(record(legacy, 'd20', { text: '20' }, mode), mode).toEqual(SNAPSHOT.gem[mode]);
        }
    });

    it('every built-in set paints the same calls as before this change for every die type and map', () => {
        for (const [key, hash] of Object.entries(SNAPSHOT.builtins)) {
            const [id, type, mode] = key.split('|');
            const face = type === 'd4' ? { values: [1, 2, 3] } : { text: type === 'd100' ? '90' : '1' };
            const calls = record(getDiceSet(id), type, face, mode);
            expect(createHash('sha1').update(calls.flat().join('\n')).digest('hex'), key).toBe(hash);
        }
    });
});
