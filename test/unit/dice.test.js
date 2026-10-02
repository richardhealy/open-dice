import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { setCanvasFactories } from '../../src/sets/canvas-factory.js';
import { clearDiceSetCaches } from '../../src/sets/texture-cache.js';
import { createDie } from '../../src/dice.js';
import { makeRecordingCanvas } from './helpers/canvas-stub.js';
import { GEM } from './helpers/sets.js';

const TYPES = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

describe('createDie with dice sets', () => {
    let canvases, restore;
    beforeEach(() => {
        clearDiceSetCaches();
        canvases = [];
        restore = setCanvasFactories({
            canvas: (size) => { const c = makeRecordingCanvas(size); canvases.push(c); return c; },
            path2D: (d) => ({ d }),
        });
    });
    afterEach(() => restore());

    it('classic dice are unchanged: Phong, default colours, one texture per slot', () => {
        for (const type of TYPES) {
            const die = createDie(type, true, true);
            expect(die.type).toBe(type);
            for (const m of die.mesh.material) {
                expect(m).toBeInstanceOf(THREE.MeshPhongMaterial);
                expect(m.color.getHex()).toBe(0xf0f0f0);
            }
        }
    });

    it('every die type accepts a set through the options object', () => {
        for (const type of TYPES) {
            const die = createDie(type, true, true, undefined, undefined, null, null, null, null, null, null, false, null, null, { set: GEM });
            expect(die.mesh.material[0]).toBeInstanceOf(THREE.MeshPhysicalMaterial);
            expect(die.mesh.material[0].color.getHexString()).toBe('d4af37');
            expect(die.mesh.material.at(-1)).toBeInstanceOf(THREE.MeshPhysicalMaterial);
            expect(die.mesh.material.at(-1).map).toBeInstanceOf(THREE.Texture);
        }
    });

    it('the second half of a d100 pair gets the set too', () => {
        const tens = createDie('d100', true, false, 47, 3, null, null, null, null, null, null, false, null, null, { set: GEM });
        expect(tens.mesh.material[0]).toBeInstanceOf(THREE.MeshPhysicalMaterial);
        expect(tens.mesh.material[5]).toBeInstanceOf(THREE.MeshPhysicalMaterial);
        const painted = canvases.flatMap((c) => c.calls.filter((x) => x.name === 'fillText').map((x) => x.args[0]));
        expect(painted).toContain('40');
    });

    it('invisible dice carry placeholder materials and paint nothing', () => {
        const die = createDie('d20', false, true, 18, null, null, null, null, null, null, null, false, null, null, { set: GEM });
        expect(die.mesh.visible).toBe(false);
        expect(new Set(die.mesh.material).size).toBe(1);
        expect(die.mesh.material[0]).toBeInstanceOf(THREE.MeshBasicMaterial);
        expect(canvases).toHaveLength(0);
    });

    it('the predetermined face still carries the target value on a set die', () => {
        const die = createDie('d20', true, true, 20, 4, null, null, null, null, null, null, false, null, null, { set: GEM });
        // closestIndex 4 → material index 5 shows '20' (same swap as classic).
        const canvas = die.mesh.material[5].map.image;
        expect(canvas.calls.filter((c) => c.name === 'fillText').map((c) => c.args[0])).toContain('20');
    });
});
