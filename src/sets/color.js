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

/** Packed metal-roughness colour: three reads roughness from G and metalness from B. */
export function mrColor(roughness, metalness) {
    return `rgb(0, ${Math.round(roughness * 255)}, ${Math.round(metalness * 255)})`;
}

/**
 * A colour dimmed toward black by `ratio` (0..1), for layers that share one material
 * intensity. At 1 or above the input is returned verbatim, so the brightest layer keeps the
 * exact string a set declares.
 */
export function scaleColor(hex, ratio) {
    if (!(ratio < 1)) return hex;
    const r = Math.max(0, ratio);
    return rgbToHex(hexToRgb(hex).map((c) => c * r));
}
