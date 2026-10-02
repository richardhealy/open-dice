import { ensureNumeralFont } from './fonts/numerals.js';
import { installEnvironment } from './environment.js';

/**
 * Load the numeral font and, when a renderer and scene are given, install the reflection
 * environment. DiceRoller does this itself before its first set roll; call it yourself
 * before using `createDie(..., { set })` directly (for example a picker preview), otherwise
 * the first faces are painted with the fallback serif.
 * @returns {Promise<boolean>} whether the embedded font loaded
 */
export async function prepareDiceSets({ renderer, scene } = {}) {
    const fontLoaded = await ensureNumeralFont();
    if (renderer && scene) installEnvironment(renderer, scene);
    return fontLoaded;
}
