/**
 * Pixel ratio for the WebGL canvas. Drawing at the device ratio keeps numerals and edges
 * crisp on high-density screens: a Retina canvas drawn at 1x is upscaled by the browser and
 * every glyph edge doubles. Capped at 2 because 3x displays quadruple the fill cost of a
 * full-screen dice overlay for no visible gain. Pass `pixelRatio: 1` to opt out entirely.
 */
export function resolvePixelRatio(option, deviceRatio) {
    if (typeof option === 'number' && Number.isFinite(option) && option > 0) return option;
    const device = typeof deviceRatio === 'number' && Number.isFinite(deviceRatio) && deviceRatio > 0 ? deviceRatio : 1;
    return Math.min(device, 2);
}

/**
 * Keep the drawing buffer (css size x ratio) within the GPU's maximum texture size, which a
 * canvas sized to a large map image can exceed at 2x. Never drops below 1: a canvas that is
 * already too large at 1x is the caller's situation, not ours to shrink.
 */
export function clampPixelRatioToBuffer(ratio, width, height, maxSize) {
    if (!(maxSize > 0)) return ratio;
    const largest = Math.max(width || 0, height || 0);
    if (!(largest > 0)) return ratio;
    return Math.max(1, Math.min(ratio, maxSize / largest));
}
