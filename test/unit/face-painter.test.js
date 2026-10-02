import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setCanvasFactories } from '../../src/sets/canvas-factory.js';
import { paintFace, paintNormalMap, shade, mrColor, hexToRgb, TEXTURE_SIZE } from '../../src/sets/face-painter.js';
import { makeRecordingCanvas, callsNamed } from './helpers/canvas-stub.js';
import { GEM, INLAY, GLOW, NO_EDGE } from './helpers/sets.js';

const fillTexts = (c) => callsNamed(c, 'fillText').map((x) => x.args[0]);
const fontsSet = (c) => callsNamed(c, 'set:font').map((x) => x.args[0]);
const stylesSet = (c) => callsNamed(c, 'set:fillStyle').map((x) => x.args[0]);

describe('face painter', () => {
    let canvases, restore;
    beforeEach(() => {
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
        const { canvas, pendingDecals } = paintFace({ set: GEM, type: 'd20', face: { text: '20' }, mode: 'albedo' });
        expect(pendingDecals).toEqual([]);
        expect(stylesSet(canvas)[0]).toBe('#B5173A');
        expect(callsNamed(canvas, 'putImageData')).toHaveLength(1);                 // veins pattern
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
        expect(callsNamed(albedo.canvas, 'drawImage')).toHaveLength(1);
        expect(fillTexts(albedo.canvas)).toEqual([]);
        const mr = paintFace({ set: INLAY, type: 'd6', face: { text: '1' }, decals: { '1': { src: '/sword.svg', scale: 0.7 } }, decalRegistry: registry, mode: 'mr' });
        expect(fillTexts(mr.canvas)).toEqual([]);
        expect(callsNamed(mr.canvas, 'drawImage')).toHaveLength(0);
    });

    it('an unloaded decal paints the numeral now and reports the pending source', () => {
        const registry = { get: () => undefined, load: () => Promise.resolve(null) };
        const { canvas, pendingDecals } = paintFace({ set: GEM, type: 'd8', face: { text: '3' }, decals: { '3': { src: '/shield.svg' } }, decalRegistry: registry, mode: 'albedo' });
        expect(pendingDecals).toEqual(['/shield.svg']);
        expect(fillTexts(canvas)).toEqual(['3', '3', '3']);
    });

    it('MR map: body values as background, gold decor, no glyph for engraved numerals', () => {
        const { canvas } = paintFace({ set: GEM, type: 'd20', face: { text: '7' }, mode: 'mr' });
        expect(stylesSet(canvas)[0]).toBe('rgb(0, 41, 0)');
        expect(callsNamed(canvas, 'set:strokeStyle').map((x) => x.args[0])).toContain('rgb(0, 71, 255)');
        expect(fillTexts(canvas)).toEqual([]);
        expect(callsNamed(canvas, 'putImageData')).toHaveLength(0);
    });

    it('MR map paints inlay numerals in the inlay metal', () => {
        const { canvas } = paintFace({ set: INLAY, type: 'd12', face: { text: '12' }, mode: 'mr' });
        expect(fillTexts(canvas)).toEqual(['12']);
        expect(stylesSet(canvas).at(-1)).toBe('rgb(0, 71, 255)');
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
        expect(canvases).toHaveLength(0);
        expect(callsNamed(existing, 'setTransform')[0].args).toEqual([1, 0, 0, 1, 0, 0]);
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
