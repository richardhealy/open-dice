import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SoundManager, _resetAudioContextForTests } from '../../src/sound-manager.js';

/**
 * D3: collision sounds used to clone an `<audio>` element per collision. They now play from
 * Web Audio buffers decoded once, with the same linear volume, and fall back to the element
 * whenever Web Audio cannot play (blocked before a user gesture, unavailable, undecodable).
 */

class FakeAudio {
    constructor(src) { this.src = src; this.listeners = {}; this.volume = 1; FakeAudio.created.push(this); }
    addEventListener(type, fn) { this.listeners[type] = fn; }
    load() { setTimeout(() => (FakeAudio.failing.has(this.src) ? this.listeners.error() : this.listeners.canplaythrough()), 0); }
    cloneNode() { const c = new FakeAudio(this.src); c.clonedFrom = this; return c; }
    play() { FakeAudio.played.push({ src: this.src, volume: this.volume }); return Promise.resolve(); }
}

class FakeContext {
    constructor() { this.state = FakeContext.initialState; this.started = []; this.destination = { name: 'out' }; FakeContext.instances.push(this); }
    resume() { this.state = 'running'; return Promise.resolve(); }
    decodeAudioData(data) {
        if (FakeContext.undecodable) return Promise.reject(new Error('EncodingError'));
        return Promise.resolve({ decodedBytes: data.byteLength });
    }
    createBufferSource() {
        const ctx = this;
        return { buffer: null, connect(node) { this.to = node; return node; }, start() { ctx.started.push({ buffer: this.buffer, gain: this.to.gain.value, out: this.to.to }); } };
    }
    createGain() { return { gain: { value: 1 }, connect(dest) { this.to = dest; return dest; } }; }
}

let fetches;
function install({ webAudio = true, fetchFails = false } = {}) {
    FakeAudio.created = []; FakeAudio.played = []; FakeAudio.failing = new Set();
    FakeContext.instances = []; FakeContext.initialState = 'running'; FakeContext.undecodable = false;
    fetches = [];
    const listeners = {};
    vi.stubGlobal('window', {
        AudioContext: webAudio ? FakeContext : undefined,
        addEventListener: (type, fn) => { listeners[type] = fn; },
        removeEventListener: (type) => { delete listeners[type]; },
        listeners,
    });
    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal('fetch', async (src) => {
        fetches.push(src);
        if (fetchFails) throw new TypeError('Failed to fetch (CORS)');
        return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3, src.length]).buffer };
    });
    _resetAudioContextForTests();
}

describe('collision sounds through Web Audio', () => {
    beforeEach(() => install());
    afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); _resetAudioContextForTests(); });

    it('fetches and decodes each sound once, and plays a collision without cloning an element', async () => {
        const sm = new SoundManager({ volume: 0.8 });
        await sm.preload(['a.ogg', 'b.ogg', 'c.ogg']);
        expect(fetches).toEqual(['a.ogg', 'b.ogg', 'c.ogg']);
        expect(sm.sounds.length).toBe(3);
        expect(sm.sounds.every((s) => s.buffer)).toBe(true);
        const elements = FakeAudio.created.length;
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        for (let i = 0; i < 20; i++) sm.play(0.5);
        expect(FakeAudio.created.length).toBe(elements);   // no clone per collision
        expect(FakeAudio.played).toEqual([]);
        const ctx = FakeContext.instances[0];
        expect(ctx.started.length).toBe(20);
        expect(ctx.started[0].buffer).toBe(sm.sounds[1].buffer);   // same random pick as before
        expect(ctx.started[0].gain).toBeCloseTo(0.4, 12);         // volume * impact, linear, as element.volume was
        expect(ctx.started[0].out).toBe(ctx.destination);
    });

    it('clamps the gain to [0, 1] exactly as the element volume was clamped', async () => {
        const sm = new SoundManager({ volume: 1 });
        await sm.preload(['a.ogg']);
        sm.setVolume(3);
        sm.play(1);
        sm.play(-2);
        expect(FakeContext.instances[0].started.map((s) => s.gain)).toEqual([1, 0]);
    });

    it('muted: plays nothing', async () => {
        const sm = new SoundManager();
        await sm.preload(['a.ogg']);
        sm.setEnabled(false);
        sm.play(1);
        expect(FakeContext.instances[0].started).toEqual([]);
        expect(FakeAudio.played).toEqual([]);
    });

    it('before a user gesture (context suspended): plays the element as before and asks to resume; the first gesture resumes', async () => {
        FakeContext.initialState = 'suspended';
        const sm = new SoundManager({ volume: 1 });
        await sm.preload(['a.ogg']);
        const ctx = FakeContext.instances[0];
        const resume = vi.spyOn(ctx, 'resume').mockImplementation(() => new Promise(() => {}));   // still pending
        sm.play(0.25);
        expect(ctx.started).toEqual([]);
        expect(FakeAudio.played).toEqual([{ src: sm.sounds[0].element.src, volume: 0.25 }]);
        expect(resume).toHaveBeenCalled();
        resume.mockRestore();
        expect(Object.keys(window.listeners).sort()).toEqual(['keydown', 'pointerdown', 'touchend']);
        window.listeners.pointerdown();
        expect(ctx.state).toBe('running');
        sm.play(0.25);
        expect(ctx.started.length).toBe(1);
    });

    it('the element made for the fallback plays the fetched bytes: no second download', async () => {
        const sm = new SoundManager();
        await sm.preload(['a.ogg']);
        expect(fetches).toEqual(['a.ogg']);
        expect(sm.sounds[0].element.src.startsWith('blob:')).toBe(true);
    });

    it('without Web Audio: loads and clones <audio> elements exactly as before', async () => {
        install({ webAudio: false });
        const sm = new SoundManager({ volume: 0.5 });
        await sm.preload(['a.ogg', 'b.ogg']);
        expect(fetches).toEqual([]);
        expect(sm.sounds.map((s) => s.element.src)).toEqual(['a.ogg', 'b.ogg']);
        vi.spyOn(Math, 'random').mockReturnValue(0);
        sm.play(1);
        expect(FakeAudio.played).toEqual([{ src: 'a.ogg', volume: 0.5 }]);
        expect(FakeAudio.created.at(-1).clonedFrom).toBe(sm.sounds[0].element);
    });

    it('a sound that cannot be fetched (cross-origin without CORS) loads as an element from its src', async () => {
        install({ fetchFails: true });
        const sm = new SoundManager();
        await sm.preload(['https://cdn.example/a.ogg']);
        expect(sm.sounds).toEqual([{ buffer: null, element: expect.objectContaining({ src: 'https://cdn.example/a.ogg' }) }]);
        sm.play(1);
        expect(FakeAudio.played.length).toBe(1);
    });

    it('a sound Web Audio cannot decode plays through its element', async () => {
        FakeContext.undecodable = true;
        const sm = new SoundManager();
        await sm.preload(['a.ogg']);
        expect(sm.sounds[0].buffer).toBeNull();
        sm.play(1);
        expect(FakeAudio.played.length).toBe(1);
        expect(FakeContext.instances[0].started).toEqual([]);
    });

    it('a sound that loads nowhere is dropped with the same warning as before', async () => {
        install({ webAudio: false });
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        FakeAudio.failing.add('missing.ogg');
        const sm = new SoundManager();
        await sm.preload(['missing.ogg', 'a.ogg']);
        expect(sm.sounds.length).toBe(1);
        expect(warn).toHaveBeenCalledWith('SoundManager: failed to load "missing.ogg"');
    });

    it('rollers share one AudioContext', async () => {
        await new SoundManager().preload(['a.ogg']);
        await new SoundManager().preload(['b.ogg']);
        expect(FakeContext.instances.length).toBe(1);
    });
});
