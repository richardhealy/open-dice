import { NUMERAL_FONT_WOFF2_BASE64 } from './numerals-data.js';

/**
 * The numeral font ships inside the bundle as a digits-only subset (about 2 KB) and is
 * registered under a neutral family name, so the subset is never distributed under the
 * original font's name. Canvas text falls back through the system serifs if the FontFace
 * API is missing or the load fails.
 */
export const NUMERAL_FONT_FAMILY = 'OpenDiceNumerals';
export const NUMERAL_FONT_FALLBACK = `${NUMERAL_FONT_FAMILY}, Georgia, "Times New Roman", serif`;

let fontPromise = null;

/** Resolves true once the font is usable by canvas, false when it cannot be loaded. */
export function ensureNumeralFont() {
    if (fontPromise) return fontPromise;
    fontPromise = (async () => {
        if (typeof document === 'undefined' || typeof FontFace === 'undefined' || !document.fonts) {
            return false;
        }
        try {
            const face = new FontFace(
                NUMERAL_FONT_FAMILY,
                `url(data:font/woff2;base64,${NUMERAL_FONT_WOFF2_BASE64})`,
                { weight: '700' },
            );
            await face.load();
            document.fonts.add(face);
            return true;
        } catch (err) {
            console.warn('open-dice-dnd: the numeral font failed to load; using a system serif instead.', err);
            return false;
        }
    })();
    return fontPromise;
}

export function _resetNumeralFontForTests() {
    fontPromise = null;
}
