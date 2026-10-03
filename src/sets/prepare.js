import { ensureNumeralFont } from './fonts/numerals.js';
import { installEnvironment } from './environment.js';
import { setTextureAnisotropy } from './texture-cache.js';
import { resolveSet, CLASSIC } from './index.js';
import { collectSetImages } from './face-materials.js';
import { collectSetDecalSources } from './decals.js';

/**
 * Load the numeral font and, when a renderer and scene are given, install the reflection
 * environment. DiceRoller does this itself before its first set roll; call it yourself
 * before using `createDie(..., { set })` directly (for example a picker preview), otherwise
 * the first faces are painted with the fallback serif.
 *
 * With a `decalRegistry` (the roller's, or your own `DecalRegistry`) and `sets` (ids or
 * definitions), every image those sets reference is loaded into the registry first, so faces
 * painted afterwards never show an image's fallback. A failed image is logged by the
 * registry and its fallback stays.
 * @param {{ renderer?: object, scene?: object, decalRegistry?: object, sets?: Array<string|object> }} [options]
 * @returns {Promise<boolean>} whether the embedded font loaded
 */
export async function prepareDiceSets({ renderer, scene, decalRegistry, sets } = {}) {
    let imagesLoaded = null;
    if (decalRegistry && Array.isArray(sets) && sets.length > 0) {
        const resolved = sets.map((s) => resolveSet(s)).filter((set) => set.id !== CLASSIC);
        const images = [...new Set(resolved.flatMap((set) => [...collectSetImages(set), ...collectSetDecalSources(set)]))];
        if (images.length > 0) imagesLoaded = decalRegistry.preload(images);
    }
    const fontLoaded = await ensureNumeralFont();
    if (renderer && renderer.capabilities) setTextureAnisotropy(renderer.capabilities.getMaxAnisotropy());
    if (renderer && scene) installEnvironment(renderer, scene);
    if (imagesLoaded) await imagesLoaded;
    return fontLoaded;
}
