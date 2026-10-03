import { NUMERAL_FONT_DATA } from './numerals-data.js';

/**
 * The numeral fonts ship inside the bundle as digits-only subsets (about 2 KB each) and are
 * registered under neutral family names, so a subset is never distributed under the
 * original font's name. Canvas text falls back through the system families listed here if
 * the FontFace API is missing or a load fails.
 *
 * - `OpenDiceNumerals`: Cinzel Bold, an engraved serif (the default numeral font).
 * - `OpenDiceMono`: Share Tech Mono (a single regular weight), for circuit and console looks.
 */
export const NUMERAL_FONTS = {
    OpenDiceNumerals: { fallback: 'Georgia, "Times New Roman", serif', weight: '700' },
    OpenDiceMono: { fallback: '"Courier New", monospace', weight: '400' },
};

/** The default family; kept with its stack for callers written against 1.4. */
export const NUMERAL_FONT_FAMILY = 'OpenDiceNumerals';
export const NUMERAL_FONT_FALLBACK = `${NUMERAL_FONT_FAMILY}, ${NUMERAL_FONTS[NUMERAL_FONT_FAMILY].fallback}`;

/**
 * The canvas font-family list for a set's `numeral.font`: an embedded family followed by
 * its system fallback, or any other family name verbatim (the browser resolves it).
 */
export function fontStack(family) {
    const embedded = NUMERAL_FONTS[family];
    return embedded ? `${family}, ${embedded.fallback}` : family;
}

let fontPromise = null;
let fontReady = false;

/**
 * True once every embedded family has loaded or failed, so canvas text painted from now on
 * is final. Textures painted before this are keyed apart.
 */
export function isNumeralFontReady() {
    return fontReady;
}

async function loadFamily(family) {
    try {
        const face = new FontFace(
            family,
            `url(data:font/woff2;base64,${NUMERAL_FONT_DATA[family]})`,
            { weight: NUMERAL_FONTS[family].weight },
        );
        await face.load();
        document.fonts.add(face);
        return true;
    } catch (err) {
        console.warn(`open-dice-dnd: the numeral font ${family} failed to load; using ${NUMERAL_FONTS[family].fallback} instead.`, err);
        return false;
    }
}

/** Loads every embedded family. Resolves true once all are usable by canvas, false when any cannot be loaded. */
export function ensureNumeralFont() {
    if (fontPromise) return fontPromise;
    fontPromise = (async () => {
        if (typeof document === 'undefined' || typeof FontFace === 'undefined' || !document.fonts) {
            return false;
        }
        const results = await Promise.all(Object.keys(NUMERAL_FONTS).map(loadFamily));
        fontReady = true;
        return results.every(Boolean);
    })();
    return fontPromise;
}

export function _resetNumeralFontForTests() {
    fontPromise = null;
    fontReady = false;
}

export function _setNumeralFontReadyForTests(value) {
    fontReady = !!value;
    fontPromise = value ? Promise.resolve(true) : null;
}
