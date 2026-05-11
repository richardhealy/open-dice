/**
 * Caches HTMLImageElements for dice face decals, keyed by `src`. Used by face-texture.js
 * to paint loaded images onto the canvas instead of (or alongside) the default number text.
 *
 * Preloading before `roll()` is recommended: until an image is loaded, the face renders
 * its text fallback, then re-renders to the decal when the image arrives.
 */
export class DecalRegistry {
    constructor() {
        this.cache = new Map();
        this.loading = new Map();
    }

    get(src) {
        return this.cache.get(src);
    }

    has(src) {
        return this.cache.has(src);
    }

    /**
     * Load an image and cache it. Returns the same promise for concurrent calls with the
     * same src, and a resolved promise once cached.
     */
    load(src) {
        if (this.cache.has(src)) {
            return Promise.resolve(this.cache.get(src));
        }
        if (this.loading.has(src)) {
            return this.loading.get(src);
        }
        const promise = new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                this.cache.set(src, img);
                this.loading.delete(src);
                resolve(img);
            };
            img.onerror = (err) => {
                this.loading.delete(src);
                reject(err);
            };
            img.src = src;
        });
        this.loading.set(src, promise);
        return promise;
    }

    /**
     * Preload an array of decal sources. Failures are logged but do not reject — the
     * caller gets a single promise that resolves once every src has either loaded or failed.
     */
    preload(srcs) {
        return Promise.all(srcs.map(s => this.load(s).catch(err => {
            console.warn(`DecalRegistry: failed to preload "${s}"`, err);
            return null;
        })));
    }
}
