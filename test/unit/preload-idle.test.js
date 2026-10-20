import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DiceRoller } from '../../src/DiceRoller.js';
import { _resetRegistryForTests, registerDiceSet } from '../../src/sets/index.js';
import { setCanvasFactories } from '../../src/sets/canvas-factory.js';
import { clearDiceSetCaches } from '../../src/sets/texture-cache.js';
import { makeRecordingCanvas } from './helpers/canvas-stub.js';
import { GEM, IMAGE, BODY_IMAGE_SRC, DECOR_IMAGE_SRC } from './helpers/sets.js';

/**
 * D4: preloadSets painted every face of every die type of a design in one go, a long task.
 * It now paints one die type per idle period, and only for the designs it is given, so a host
 * can call it at idle time for the table's designs without holding up the page.
 */

const proto = DiceRoller.prototype;
// d4, d6, d8, d10, d12, d20 and both halves of the d100.
const SLICES_PER_SET = 8;

describe('preloadSets paints in idle time', () => {
    let canvases, restore;
    beforeEach(() => {
        _resetRegistryForTests();
        clearDiceSetCaches();
        canvases = [];
        restore = setCanvasFactories({ canvas: (size) => { const c = makeRecordingCanvas(size); canvases.push(c); return c; }, path2D: (d) => ({ d }) });
    });
    afterEach(() => { restore(); vi.unstubAllGlobals(); });

    function roller() {
        return {
            decalRegistry: { get: () => undefined, load: () => Promise.resolve(null), preload: vi.fn(() => Promise.resolve([])) },
            diceMaterial: null, _destroyed: false, _ensureSetAssets: () => Promise.resolve(), preloadSets: proto.preloadSets,
        };
    }

    it('paints one die type per idle callback, never more', async () => {
        const idle = [];
        vi.stubGlobal('requestIdleCallback', (cb, opts) => { idle.push({ cb, opts }); return idle.length; });
        const r = roller();
        const done = r.preloadSets([GEM]);
        const paintedPerSlice = [];
        for (let i = 0; i < SLICES_PER_SET; i++) {
            for (let k = 0; k < 10 && idle.length === 0; k++) await null;
            expect(idle.length).toBe(1);
            expect(idle[0].opts).toEqual({ timeout: 1000 });
            const before = canvases.length;
            idle.shift().cb();
            for (let k = 0; k < 10 && idle.length === 0; k++) await null;
            paintedPerSlice.push(canvases.length - before);
        }
        await done;
        expect(idle.length).toBe(0);
        // Painting happened only inside idle callbacks (one die type each), and every slice painted.
        expect(paintedPerSlice.every((n) => n > 0)).toBe(true);
    });

    it('without requestIdleCallback it yields with timeouts between die types', async () => {
        const timers = vi.spyOn(globalThis, 'setTimeout');
        await roller().preloadSets([GEM]);
        expect(timers.mock.calls.filter((c) => c[1] === 0).length).toBe(SLICES_PER_SET);
    });

    it('loads only the designs it is given', async () => {
        registerDiceSet({ ...IMAGE, id: 'other-design' });
        const r = roller();
        await r.preloadSets([GEM]);
        expect(r.decalRegistry.preload).not.toHaveBeenCalled();   // GEM has no images; the registered image design is not touched
        await r.preloadSets(['other-design']);
        expect(r.decalRegistry.preload.mock.calls[0][0]).toEqual([BODY_IMAGE_SRC, DECOR_IMAGE_SRC]);
    });

    it('stops painting once the roller is destroyed', async () => {
        const r = roller();
        const done = r.preloadSets([GEM, { ...GEM, id: 'gem-2' }]);
        await new Promise((resolve) => setTimeout(resolve, 0));
        r._destroyed = true;
        const painted = canvases.length;
        await done;
        expect(canvases.length).toBe(painted);
    });

    it('a later roll finds the faces painted (same cache keys as before)', async () => {
        const r = roller();
        await r.preloadSets([GEM]);
        const painted = canvases.length;
        const { createDie } = await import('../../src/dice.js');
        createDie('d20', true, true, undefined, undefined, null, null, null, null, null, null, false, null, r.decalRegistry, { set: GEM });
        expect(canvases.length).toBe(painted);
    });
});
