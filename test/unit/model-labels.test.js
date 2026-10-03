import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { setCanvasFactories } from '../../src/sets/canvas-factory.js';
import { clearDiceSetCaches } from '../../src/sets/texture-cache.js';
import { makeRecordingCanvas, callsNamed, lastSet } from './helpers/canvas-stub.js';
import { labelStyle, labelTexture, labelGeometry } from '../../src/models/labels.js';

const STYLE = { font: 'OpenDiceNumerals', weight: 700, color: '#FFFFFF', outline: { color: '#4A0A0A', width: 0.1 } };

describe('label textures', () => {
    let restore, canvases;
    beforeEach(() => {
        canvases = [];
        restore = setCanvasFactories({ canvas: (size) => { const c = makeRecordingCanvas(size); canvases.push(c); return c; } });
        clearDiceSetCaches();
    });
    afterEach(() => restore());

    it('paints one centred numeral in the style font, outline under the fill', () => {
        const texture = labelTexture('4', STYLE);
        expect(texture.isTexture).toBe(true);
        const canvas = canvases[0];
        expect(lastSet(canvas, 'font')).toMatch(/^700 \d+px OpenDiceNumerals, /);
        const stroke = callsNamed(canvas, 'strokeText');
        const fill = callsNamed(canvas, 'fillText');
        expect(fill.map((c) => c.args[0])).toEqual(['4']);
        expect(stroke.map((c) => c.args[0])).toEqual(['4']);
        expect(canvas.calls.indexOf(stroke[0])).toBeLessThan(canvas.calls.indexOf(fill[0]));
        expect(fill[0].args[1]).toBe(canvas.width / 2);
        expect(fill[0].args[2]).toBe(canvas.width / 2);
        expect(lastSet(canvas, 'fillStyle')).toBe('#FFFFFF');
    });

    it('caches one texture per text and style', () => {
        const a = labelTexture('4', STYLE);
        expect(labelTexture('4', STYLE)).toBe(a);
        expect(labelTexture('3', STYLE)).not.toBe(a);
        expect(labelTexture('4', { ...STYLE, color: '#000000' })).not.toBe(a);
    });

    it('underlines 6 and 9 but not 8', () => {
        labelTexture('6', STYLE);
        labelTexture('8', STYLE);
        expect(callsNamed(canvases[0], 'lineTo')).toHaveLength(1);
        expect(callsNamed(canvases[1], 'lineTo')).toHaveLength(0);
    });

    const px = (c) => Number(/(\d+)px/.exec(lastSet(c, 'font'))[1]);

    it('shrinks a label too wide for its square', () => {
        labelTexture('888', STYLE);
        labelTexture('8', STYLE);
        expect(px(canvases[0])).toBeLessThan(px(canvases[1]));
    });

    it('sizes every label of a die alike: the widest value sets the size', () => {
        const fit = ['7', '888'];
        labelTexture('7', STYLE, fit);
        labelTexture('888', STYLE, fit);
        labelTexture('7', STYLE);
        expect(px(canvases[0])).toBe(px(canvases[1]));
        expect(px(canvases[0])).toBeLessThan(px(canvases[2]));
    });

    it('takes the design numeral and lets the model override colour and outline', () => {
        const set = { numeral: { font: 'Cinzel', weight: 600, color: '#111111', outline: null } };
        expect(labelStyle(set, { numeral: null })).toEqual({ font: 'Cinzel', weight: 600, color: '#111111', outline: null });
        expect(labelStyle(set, { numeral: { color: '#FFFFFF', outline: { color: '#000000', width: 0.1 } } }))
            .toEqual({ font: 'Cinzel', weight: 600, color: '#FFFFFF', outline: { color: '#000000', width: 0.1 } });
    });
});

describe('label decals', () => {
    function boxTemplate() {
        const root = new THREE.Group();
        root.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial()));
        root.updateMatrixWorld(true);
        return root;
    }
    const top = { value: 6, position: [0, 1, 0], normal: [0, 1, 0], up: [0, 0, -1], size: 0.5 };

    it('projects a label onto the surface under it, upright towards its up', () => {
        const geometry = labelGeometry(boxTemplate(), top);
        const pos = geometry.getAttribute('position');
        const uv = geometry.getAttribute('uv');
        expect(pos.count).toBeGreaterThan(0);
        let topV = -Infinity, zAtTopV = null;
        for (let i = 0; i < pos.count; i++) {
            expect(pos.getY(i)).toBeCloseTo(1, 6);
            expect(Math.abs(pos.getX(i))).toBeLessThanOrEqual(0.25 + 1e-6);
            expect(Math.abs(pos.getZ(i))).toBeLessThanOrEqual(0.25 + 1e-6);
            if (uv.getY(i) > topV) { topV = uv.getY(i); zAtTopV = pos.getZ(i); }
        }
        // Texture "up" (v = 1) lies towards the label's up, -z.
        expect(topV).toBeCloseTo(1, 6);
        expect(zAtTopV).toBeCloseTo(-0.25, 6);
    });

    it('caches per template and label, and is null off the surface', () => {
        const t = boxTemplate();
        expect(labelGeometry(t, top)).toBe(labelGeometry(t, top));
        expect(labelGeometry(t, { ...top, position: [0, 4, 0] })).toBeNull();
    });
});
