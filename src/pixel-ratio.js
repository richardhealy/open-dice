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
