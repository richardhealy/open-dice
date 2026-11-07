const POWER_PREFERENCES = ['default', 'high-performance', 'low-power'];

/**
 * WebGLRenderer parameters. `powerPreference` tells the browser which GPU to draw on: on a
 * laptop with a built-in and a separate graphics chip (Intel MacBook Pros, many Windows
 * laptops), browsers draw on the built-in one unless a context asks for 'high-performance'.
 * An unknown value is left out, so the browser default applies.
 */
export function rendererOptions(options = {}) {
    const params = { antialias: true, alpha: true };
    if (POWER_PREFERENCES.includes(options.powerPreference)) params.powerPreference = options.powerPreference;
    return params;
}

/**
 * The GPU a WebGL context draws on, and the power preference it was created with. Either is
 * null when the browser hides it or the context is gone; this never throws.
 */
export function readGpuInfo(gl) {
    const info = { gpu: null, powerPreference: null };
    if (!gl) return info;
    try {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
        if (typeof gpu === 'string' && gpu) info.gpu = gpu;
    } catch {
        // A lost context or a driver that refuses the query: unknown.
    }
    try {
        const pref = gl.getContextAttributes()?.powerPreference;
        if (typeof pref === 'string' && pref) info.powerPreference = pref;
    } catch {
        // Same.
    }
    return info;
}
