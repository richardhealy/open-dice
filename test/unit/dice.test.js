import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { setCanvasFactories } from '../../src/sets/canvas-factory.js';
import { clearDiceSetCaches } from '../../src/sets/texture-cache.js';
import { createDie, getDieValue } from '../../src/dice.js';
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

    it('a die thrown without a target paints its own numbers, whatever face the prediction found', () => {
        // A physics-decided throw (no `rolled`) still passes the predicted landing face. Every die
        // type must leave its numbers alone then; the d4 used to paint "undefined" on that corner.
        for (const type of TYPES) {
            for (const set of [undefined, GEM]) {
                canvases.length = 0;
                createDie(type, true, true, undefined, 2, null, null, null, null, null, null, false, null, null, set ? { set } : {});
                const painted = canvases.flatMap((c) => c.calls.filter((x) => x.name === 'fillText').map((x) => String(x.args[0])));
                expect(painted.filter((t) => t === 'undefined' || t === 'null' || t === 'NaN'), `${type} ${set ? 'with a set' : 'classic'}`).toEqual([]);
            }
        }
    });

    it('a d4 without a target paints exactly what a d4 with no prediction paints', () => {
        const paintedCounts = (args) => {
            canvases.length = 0;
            clearDiceSetCaches();
            createDie('d4', true, true, ...args, null, null, null, null, null, null, false, null, null, { set: GEM });
            const counts = {};
            for (const c of canvases) for (const x of c.calls) if (x.name === 'fillText') counts[String(x.args[0])] = (counts[String(x.args[0])] || 0) + 1;
            return counts;
        };
        const plain = paintedCounts([undefined, undefined]);
        expect(Object.keys(plain).sort()).toEqual(['0', '1', '2', '3', '4']);
        expect(paintedCounts([undefined, 2])).toEqual(plain);
    });

    it('invisible dice carry placeholder materials and paint nothing', () => {
        const die = createDie('d20', false, true, 18, null, null, null, null, null, null, null, false, null, null, { set: GEM });
        expect(die.mesh.visible).toBe(false);
        expect(new Set(die.mesh.material).size).toBe(1);
        expect(die.mesh.material[0]).toBeInstanceOf(THREE.MeshBasicMaterial);
        expect(canvases).toHaveLength(0);
    });

    it('d10 and d100 belt triangles take the body material, not the edge metal', () => {
        for (const type of ['d10', 'd100']) {
            const die = createDie(type, true, true, undefined, undefined, null, null, null, null, null, null, false, null, null, { set: GEM });
            expect(die.mesh.material).toHaveLength(12);
            expect(die.mesh.material[0].metalness).toBe(1);          // bevels: gold
            const belt = die.mesh.material[11];
            expect(belt).toBeInstanceOf(THREE.MeshPhysicalMaterial);
            expect(belt).not.toBe(die.mesh.material[0]);
            expect(belt.color.getHexString()).toBe('ffffff');        // a face material (white multiplier), not gold
            expect(belt.map).toBeInstanceOf(THREE.Texture);          // painted body, which the edge never has
            // The belt never counts as a face: a settled d10 still reports a kite value.
            const [value] = getDieValue(die, new THREE.Vector3(0, 1, 0));
            expect(Number.isNaN(value)).toBe(false);
        }
    });

    it('classic d10 keeps a blank background face on the belt', () => {
        const die = createDie('d10', true, true);
        expect(die.mesh.material).toHaveLength(12);
        expect(die.mesh.material[11]).toBeInstanceOf(THREE.MeshPhongMaterial);
        const belt = die.mesh.material[11].map.image;
        // Blank classic faces call fillText with '' (as index 0 always has); no numeral is drawn.
        expect(belt.calls.filter((c) => c.name === 'fillText' && c.args[0] !== '')).toHaveLength(0);
    });

    it('the predetermined face still carries the target value on a set die', () => {
        const die = createDie('d20', true, true, 20, 4, null, null, null, null, null, null, false, null, null, { set: GEM });
        // closestIndex 4 → material index 5 shows '20' (same swap as classic).
        const canvas = die.mesh.material[5].map.image;
        expect(canvas.calls.filter((c) => c.name === 'fillText').map((c) => c.args[0])).toContain('20');
    });
});
