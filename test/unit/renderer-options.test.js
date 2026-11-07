import { describe, it, expect, vi } from 'vitest';
import { DiceRoller } from '../../src/DiceRoller.js';
import { rendererOptions, readGpuInfo } from '../../src/renderer-options.js';

const proto = DiceRoller.prototype;

describe('rendererOptions: which GPU the dice draw on', () => {
    it('keeps antialias and transparency, and leaves the GPU choice to the browser by default', () => {
        expect(rendererOptions()).toEqual({ antialias: true, alpha: true });
        expect(rendererOptions({})).toEqual({ antialias: true, alpha: true });
    });

    it('passes powerPreference through, so a laptop with two graphics chips can use the faster one', () => {
        expect(rendererOptions({ powerPreference: 'high-performance' }).powerPreference).toBe('high-performance');
        expect(rendererOptions({ powerPreference: 'low-power' }).powerPreference).toBe('low-power');
        expect(rendererOptions({ powerPreference: 'default' }).powerPreference).toBe('default');
    });

    it('drops an unknown value instead of handing WebGL something it rejects', () => {
        expect(rendererOptions({ powerPreference: 'fast' })).toEqual({ antialias: true, alpha: true });
        expect(rendererOptions({ powerPreference: 1 })).toEqual({ antialias: true, alpha: true });
    });
});

describe('readGpuInfo', () => {
    const ext = { UNMASKED_RENDERER_WEBGL: 0x9246 };

    it('reads the unmasked renderer and the power preference the context got', () => {
        const gl = {
            RENDERER: 0x1f01,
            getExtension: (name) => (name === 'WEBGL_debug_renderer_info' ? ext : null),
            getParameter: (p) => (p === 0x9246 ? 'ANGLE (AMD, AMD Radeon Pro 5500M)' : 'WebKit WebGL'),
            getContextAttributes: () => ({ powerPreference: 'high-performance' }),
        };
        expect(readGpuInfo(gl)).toEqual({ gpu: 'ANGLE (AMD, AMD Radeon Pro 5500M)', powerPreference: 'high-performance' });
    });

    it('falls back to the masked renderer when the browser hides the real one', () => {
        const gl = {
            RENDERER: 0x1f01,
            getExtension: () => null,
            getParameter: (p) => (p === 0x1f01 ? 'WebKit WebGL' : null),
            getContextAttributes: () => ({}),
        };
        expect(readGpuInfo(gl)).toEqual({ gpu: 'WebKit WebGL', powerPreference: null });
    });

    it('never throws: no context, a lost context or a throwing driver all read as unknown', () => {
        expect(readGpuInfo(null)).toEqual({ gpu: null, powerPreference: null });
        const throwing = {
            getExtension: () => { throw new Error('lost'); },
            getParameter: () => { throw new Error('lost'); },
            getContextAttributes: () => null,
        };
        expect(readGpuInfo(throwing)).toEqual({ gpu: null, powerPreference: null });
    });
});

function fakeRoller(over = {}) {
    const renderer = {
        capabilities: { maxTextureSize: 16384 },
        setPixelRatio: vi.fn(),
        setSize: vi.fn(),
        render: vi.fn(),
    };
    return {
        width: 1400, height: 900, pixelRatio: 1.5, _pixelRatioOption: 1.5, isAnimating: false,
        scene: {}, camera: {}, renderer,
        _applyPixelRatio: proto._applyPixelRatio, setPixelRatio: proto.setPixelRatio,
        ...over,
    };
}

describe('setPixelRatio: fewer pixels while the roller runs', () => {
    it('applies the new ratio to the canvas at the current size and redraws an idle table', () => {
        const r = fakeRoller();
        expect(r.setPixelRatio(1)).toBe(1);
        expect(r.pixelRatio).toBe(1);
        expect(r.renderer.setPixelRatio).toHaveBeenCalledWith(1);
        expect(r.renderer.setSize).toHaveBeenCalledWith(1400, 900);
        expect(r.renderer.render).toHaveBeenCalledTimes(1);
    });

    it('does not draw an extra frame mid-roll: the running loop draws the next one', () => {
        const r = fakeRoller({ isAnimating: true });
        r.setPixelRatio(1);
        expect(r.renderer.render).not.toHaveBeenCalled();
    });

    it('is kept across a window resize, which re-reads the option', () => {
        const r = fakeRoller();
        r.setPixelRatio(1);
        expect(r._pixelRatioOption).toBe(1);
    });

    it('undefined goes back to the default (device ratio capped at 2), like the constructor option', () => {
        const r = fakeRoller();
        vi.stubGlobal('window', { devicePixelRatio: 3 });
        try {
            expect(r.setPixelRatio(undefined)).toBe(2);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('a roller without a renderer (destroyed or headless) keeps the option for later and does not throw', () => {
        const r = fakeRoller({ renderer: null, pixelRatio: 1.5 });
        expect(r.setPixelRatio(1)).toBe(1.5);
        expect(r._pixelRatioOption).toBe(1);
    });
});

describe('getGpuInfo', () => {
    it('reads the roller\'s own WebGL context', () => {
        const gl = {
            getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 1 }),
            getParameter: () => 'Apple M4 Pro',
            getContextAttributes: () => ({ powerPreference: 'default' }),
        };
        const r = { renderer: { getContext: () => gl }, getGpuInfo: proto.getGpuInfo };
        expect(r.getGpuInfo()).toEqual({ gpu: 'Apple M4 Pro', powerPreference: 'default' });
        expect({ renderer: null, getGpuInfo: proto.getGpuInfo }.getGpuInfo()).toEqual({ gpu: null, powerPreference: null });
    });
});
