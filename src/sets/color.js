/**
 * Hex colour helpers shared by the validator and the painter. They live apart from
 * face-painter.js so validate.js can derive defaults (felt's grain colour) without
 * importing the painter, which would form a cycle through the decor and font modules.
 */

export function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]) {
    return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

/** Lighten (amount > 0) or darken (amount < 0) a hex colour by a fraction of the distance to white/black. */
export function shade(hex, amount) {
    const rgb = hexToRgb(hex);
    return rgbToHex(rgb.map((c) => (amount >= 0 ? c + (255 - c) * amount : c * (1 + amount))));
}
