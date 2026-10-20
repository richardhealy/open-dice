import { describe, it, expect, afterEach, vi } from 'vitest';
import { predict, warmPrediction, _setPredictionWorkerFactoryForTests, PREDICTION_TIMEOUT_MS } from '../../src/prediction.js';
import { describeWorld, runPrediction } from '../../src/physics-sim.js';
import { createDie } from '../../src/dice.js';
import { setCanvasFactories } from '../../src/sets/canvas-factory.js';
import { makeRecordingCanvas } from './helpers/canvas-stub.js';
import { headlessRoller } from './helpers/roller.js';

/** A described single-d20 throw. */
function throwDesc() {
    const restore = setCanvasFactories({ canvas: (size) => makeRecordingCanvas(size) });
    const r = headlessRoller();
    const die = createDie('d20', false, true, undefined, null, r.diceMaterial, null, null);
    r._applyDiePhysics(die, { xPos: 0.2, yPos: 0.5, zPos: 0.4, rotAxis: [0.3, 0.6, 0.1], rotAngle: 0.7, vel: [0.4, 0.5, 0.6], angVel: [0.1, 0.8, 0.3] });
    restore();
    return describeWorld(r.world, { added: [die.body], record: [die.body], watch: [die.body] });
}

/** A Worker stand-in that runs the real worker code (physics-worker.js) on a structured clone, asynchronously. */
class FakeWorker {
    constructor() { FakeWorker.instances.push(this); this.posted = 0; }
    postMessage({ id, desc }) {
        this.posted++;
        const clone = structuredClone(desc);
        setTimeout(() => {
            if (this.behaviour === 'error-event') { this.onerror({ message: 'blocked by CSP', preventDefault() {} }); return; }
            if (this.behaviour === 'hang') return;
            if (this.behaviour === 'error-message') { this.onmessage({ data: { id, error: 'boom' } }); return; }
            const result = runPrediction(clone);
            this.onmessage({ data: { id, result } });
        }, 0);
    }
    terminate() { this.terminated = true; }
}
FakeWorker.instances = [];

describe('roll prediction off the main thread', () => {
    afterEach(() => { _setPredictionWorkerFactoryForTests(null); FakeWorker.instances = []; vi.restoreAllMocks(); });

    it('runs in the worker and returns what the main thread would have computed', async () => {
        _setPredictionWorkerFactoryForTests(() => new FakeWorker());
        globalThis.Worker = FakeWorker;
        try {
            const desc = throwDesc();
            const viaWorker = await predict(desc);
            expect(FakeWorker.instances[0].posted).toBe(1);
            const here = runPrediction(desc);
            expect(viaWorker.steps).toBe(here.steps);
            expect(Array.from(viaWorker.states)).toEqual(Array.from(here.states));
        } finally { delete globalThis.Worker; }
    });

    it('does not block: the call returns before the simulation has run', async () => {
        _setPredictionWorkerFactoryForTests(() => new FakeWorker());
        globalThis.Worker = FakeWorker;
        try {
            let done = false;
            const p = predict(throwDesc()).then(() => { done = true; });
            expect(done).toBe(false);
            await p;
            expect(done).toBe(true);
        } finally { delete globalThis.Worker; }
    });

    it('without Workers, simulates synchronously on the main thread', async () => {
        _setPredictionWorkerFactoryForTests(() => { throw new Error('should not be created'); });
        expect(typeof globalThis.Worker).toBe('undefined');
        const desc = throwDesc();
        expect((await predict(desc)).steps).toBe(runPrediction(desc).steps);
    });

    it('falls back to the main thread when the worker cannot be created', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        _setPredictionWorkerFactoryForTests(() => { throw new Error('SecurityError'); });
        globalThis.Worker = FakeWorker;
        try {
            const desc = throwDesc();
            expect((await predict(desc)).steps).toBe(runPrediction(desc).steps);
            expect(warn).toHaveBeenCalledTimes(1);
        } finally { delete globalThis.Worker; }
    });

    it('falls back for requests in flight when the worker fails to load (error event), and stays on the main thread', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        _setPredictionWorkerFactoryForTests(() => { const w = new FakeWorker(); w.behaviour = 'error-event'; return w; });
        globalThis.Worker = FakeWorker;
        try {
            const desc = throwDesc();
            const [a, b] = await Promise.all([predict(desc), predict(desc)]);
            expect(a.steps).toBe(runPrediction(desc).steps);
            expect(b.steps).toBe(a.steps);
            expect(FakeWorker.instances[0].terminated).toBe(true);
            await predict(desc);
            expect(FakeWorker.instances.length).toBe(1);
            expect(warn).toHaveBeenCalledTimes(1);
        } finally { delete globalThis.Worker; }
    });

    it('a request the worker reports failing is retried on the main thread', async () => {
        _setPredictionWorkerFactoryForTests(() => { const w = new FakeWorker(); w.behaviour = 'error-message'; return w; });
        globalThis.Worker = FakeWorker;
        try {
            const desc = throwDesc();
            expect((await predict(desc)).steps).toBe(runPrediction(desc).steps);
        } finally { delete globalThis.Worker; }
    });

    it('a worker that never answers: the prediction runs on the main thread after the timeout, and later ones stay there', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        _setPredictionWorkerFactoryForTests(() => { const w = new FakeWorker(); w.behaviour = 'hang'; return w; });
        globalThis.Worker = FakeWorker;
        vi.useFakeTimers();
        try {
            const desc = throwDesc();
            let result = null;
            predict(desc).then((r) => { result = r; });
            await vi.advanceTimersByTimeAsync(PREDICTION_TIMEOUT_MS - 1);
            expect(result).toBeNull();
            await vi.advanceTimersByTimeAsync(1);
            expect(result.steps).toBe(runPrediction(desc).steps);
            expect(FakeWorker.instances[0].terminated).toBe(true);
            expect(warn).toHaveBeenCalledWith(expect.stringContaining('did not answer'));
            expect((await predict(desc)).steps).toBe(result.steps);
            expect(FakeWorker.instances.length).toBe(1);
        } finally { vi.useRealTimers(); delete globalThis.Worker; }
    });

    it('a worker that answers in time leaves no timer behind', async () => {
        _setPredictionWorkerFactoryForTests(() => new FakeWorker());
        globalThis.Worker = FakeWorker;
        const clear = vi.spyOn(globalThis, 'clearTimeout');
        try {
            await predict(throwDesc());
            expect(clear).toHaveBeenCalled();
        } finally { delete globalThis.Worker; }
    });

    it('warmPrediction starts the worker once, ahead of the first roll', () => {
        _setPredictionWorkerFactoryForTests(() => new FakeWorker());
        globalThis.Worker = FakeWorker;
        try {
            warmPrediction();
            warmPrediction();
            expect(FakeWorker.instances.length).toBe(1);
        } finally { delete globalThis.Worker; }
    });
});
