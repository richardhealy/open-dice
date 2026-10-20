import { runPrediction } from './physics-sim.js';
import PredictionWorker from './physics-worker.js?worker&inline';

/**
 * Runs a described throw (physics-sim.js) in a Web Worker, so a roll never freezes the page.
 * One worker serves every roller. Without Workers, or when the worker cannot start (a Content
 * Security Policy without `worker-src blob:`, say) or fails, the same simulation runs on the
 * main thread, synchronously, as rolls always did. Both give the same recording.
 */

/**
 * A prediction the worker has not answered in this long runs on the main thread instead, and
 * the worker is retired: a hung worker must never leave a roll waiting (isRolling() true) for
 * good. Far above any real throw (the slowest phones simulate one in a few seconds).
 */
export const PREDICTION_TIMEOUT_MS = 10000;

let worker = null;
let workerFailed = false;
let nextId = 1;
const pending = new Map();
let createWorker = () => new PredictionWorker();

function fallBack(reason) {
    if (!workerFailed && reason) console.warn(`open-dice-dnd: roll prediction runs on the main thread (${reason}).`);
    workerFailed = true;
    if (worker) {
        try { worker.terminate(); } catch { /* already gone */ }
        worker = null;
    }
    // Requests the worker never answered run here instead.
    for (const [id, request] of [...pending]) {
        pending.delete(id);
        clearTimeout(request.timer);
        runHere(request);
    }
}

function runHere({ desc, resolve, reject }) {
    try { resolve(runPrediction(desc)); }
    catch (error) { reject(error); }
}

function ensureWorker() {
    if (worker || workerFailed) return worker;
    if (typeof Worker === 'undefined') { workerFailed = true; return null; }
    try {
        worker = createWorker();
    } catch (error) {
        fallBack((error && error.message) || 'the worker could not start');
        return null;
    }
    worker.onmessage = (event) => {
        const { id, result, error } = event.data || {};
        const request = pending.get(id);
        if (!request) return;
        pending.delete(id);
        clearTimeout(request.timer);
        if (error) runHere(request);   // the main thread reports the error, or succeeds where the worker could not
        else request.resolve(result);
    };
    worker.onerror = (event) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        fallBack((event && event.message) || 'the worker failed');
    };
    return worker;
}

/** Start the worker ahead of the first roll, so that roll does not wait for it to load. */
export function warmPrediction() {
    ensureWorker();
}

/**
 * Simulate a described throw. Resolves with `{ steps, bodies, states, events }`
 * (physics-sim.js simulateThrow). Without a usable worker it runs at once on this thread.
 */
export function predict(desc) {
    return new Promise((resolve, reject) => {
        const request = { desc, resolve, reject };
        const w = ensureWorker();
        if (!w) { runHere(request); return; }
        const id = nextId++;
        pending.set(id, request);
        try {
            w.postMessage({ id, desc });
        } catch (error) {
            pending.delete(id);
            runHere(request);
            return;
        }
        request.timer = setTimeout(() => {
            if (pending.has(id)) fallBack(`the worker did not answer within ${PREDICTION_TIMEOUT_MS / 1000} s`);
        }, PREDICTION_TIMEOUT_MS);
    });
}

/** Tests: replace the worker factory (null: no worker) and forget the current worker. */
export function _setPredictionWorkerFactoryForTests(factory) {
    if (worker) { try { worker.terminate(); } catch { /* ignore */ } }
    worker = null;
    workerFailed = factory === null;
    for (const request of pending.values()) clearTimeout(request.timer);
    pending.clear();
    if (factory) createWorker = factory;
}
