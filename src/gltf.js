/**
 * open-dice-dnd/gltf: a model loader for setModelLoader that reads .glb and .gltf files.
 *
 * It parses with three's GLTFLoader bundled against the library's own `three`, so the scenes
 * it returns come from the same three instance the roller renders with. Import it only where
 * model dice are used; the main entry never loads it.
 *
 *   import { setModelLoader } from 'open-dice-dnd';
 *   import { createGltfModelLoader } from 'open-dice-dnd/gltf';
 *   setModelLoader(createGltfModelLoader());
 */
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * @param {{ fetchOptions?: RequestInit, loader?: GLTFLoader }} [options]
 *   `fetchOptions` go to fetch (credentials, headers); `loader` is a configured GLTFLoader
 *   (for example with a Draco or meshopt decoder) to use instead of a plain one.
 * @returns {(src: string) => Promise<import('three').Group>}
 */
export function createGltfModelLoader({ fetchOptions, loader } = {}) {
    const gltf = loader || new GLTFLoader();
    return async function loadGltfModel(src) {
        const response = fetchOptions === undefined ? await fetch(src) : await fetch(src, fetchOptions);
        if (!response.ok) throw new Error(`HTTP ${response.status} for ${src}`);
        const buffer = await response.arrayBuffer();
        const base = src.slice(0, src.lastIndexOf('/') + 1);
        return new Promise((resolve, reject) => {
            gltf.parse(buffer, base, (result) => resolve(result.scene), (error) => reject(error instanceof Error ? error : new Error(String(error && error.message || error))));
        });
    };
}
