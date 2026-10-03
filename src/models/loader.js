/**
 * Model files for model dice come from the host: it installs a loader with setModelLoader and
 * the library caches what the loader returns, once per src. The library bundles no file
 * format; `open-dice-dnd/gltf` offers a GLTF loader that uses the library's own three.
 */

let loader = null;
const entries = new Map();
const warned = new Set();

function warnOnce(src, reason) {
    if (warned.has(src)) return;
    warned.add(src);
    console.warn(`open-dice-dnd: model "${src}" is unavailable (${reason}); that die rolls as the design's standard die.`);
}

/**
 * Install the function that loads a model file: `loader(src) => Promise<Object3D | { scene }>`.
 * Pass null to remove it. Models already loaded stay cached.
 * @param {Function|null} fn
 */
export function setModelLoader(fn) {
    if (fn != null && typeof fn !== 'function') throw new TypeError('open-dice-dnd: setModelLoader expects a function or null');
    loader = fn || null;
}

/**
 * The loaded scene for `src`, loading it on first use. Resolves null when no loader is
 * installed or the load fails; a failure is warned once and cached until clearModelCache().
 * @param {string} src
 * @returns {Promise<import('three').Object3D|null>}
 */
export function loadModel(src) {
    const cached = entries.get(src);
    if (cached) return cached.promise;
    if (!loader) {
        warnOnce(src, 'no model loader is installed; call setModelLoader');
        return Promise.resolve(null);
    }
    const entry = { scene: null, promise: null, settled: false };
    const load = loader;
    entry.promise = Promise.resolve()
        .then(() => load(src))
        .then((result) => {
            const scene = result && result.isObject3D ? result : result && result.scene;
            if (!scene || !scene.isObject3D) throw new Error('the loader returned no 3D object');
            entry.scene = scene;
            entry.settled = true;
            return scene;
        })
        .catch((error) => {
            entry.settled = true;
            warnOnce(src, (error && error.message) || String(error));
            return null;
        });
    entries.set(src, entry);
    return entry.promise;
}

/** The scene for `src` once it has loaded; null before then and after a failure. */
export function loadedModel(src) {
    const entry = entries.get(src);
    return entry ? entry.scene : null;
}

/** True once `src` has finished loading or failing (false before its first load starts). */
export function isModelSettled(src) {
    const entry = entries.get(src);
    return !!(entry && entry.settled);
}

/** Load every model the given resolved sets use. Resolves when each has loaded or failed. */
export function loadSetModels(sets) {
    const srcs = new Set();
    for (const set of sets) {
        if (!set || !set.models) continue;
        for (const model of Object.values(set.models)) srcs.add(model.src);
    }
    return Promise.all([...srcs].map(loadModel));
}

/** Forget every loaded model and failure, so the next use loads again. */
export function clearModelCache() {
    entries.clear();
    warned.clear();
}
