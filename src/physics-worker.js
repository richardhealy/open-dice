import { runPrediction } from './physics-sim.js';

/** Runs roll predictions off the main thread. See prediction.js. */
self.onmessage = (event) => {
    const { id, desc } = event.data;
    try {
        const result = runPrediction(desc);
        self.postMessage({ id, result }, [result.states.buffer, result.events.buffer]);
    } catch (error) {
        self.postMessage({ id, error: String((error && error.message) || error) });
    }
};
