/**
 * Loads short impact sounds and plays one (randomly picked) per collision event.
 *
 * Where it can, each sound is decoded once into a Web Audio buffer and a collision plays it
 * through its own buffer source and gain node, so several dice contacting at once overlap
 * freely without the new `<audio>` element per collision this used to clone. The gain is the
 * same linear volume the element had.
 *
 * Otherwise a sound plays exactly as before, from a clone of an `<audio>` element, which the
 * browser plays or blocks as it always has:
 * - until the page may start audio. The AudioContext is created only then (on the first
 *   pointer, key or touch event in this frame, or at a collision once the frame has had user
 *   activation), so loading a page never trips the browser's autoplay warning;
 * - on iPhone and iPad, where Web Audio is silenced by the ringer switch and `<audio>` is not;
 * - where Web Audio is missing, or cannot fetch or decode a file.
 *
 * Volume scales with impact strength so glancing contacts stay quiet and only real hits
 * are loud. A short per-die cooldown prevents the rapid-fire scratchy noise that
 * otherwise plays as a die rolls to rest on the floor.
 */

let sharedContext = null;
const waiting = new Set();   // managers whose sounds wait for the context to decode
const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchend'];
let unlockListening = false;

function contextClass() {
    if (typeof window === 'undefined') return null;
    return window.AudioContext || window.webkitAudioContext || null;
}

/** iPhone and iPad (iPadOS reports a Mac with touch): the ringer switch mutes Web Audio there. */
function isIOS() {
    if (typeof navigator === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent || '')
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** True once this frame has had a user gesture; null where the browser cannot tell. */
function hasBeenActive() {
    const activation = typeof navigator !== 'undefined' ? navigator.userActivation : undefined;
    return activation ? !!activation.hasBeenActive : null;
}

/** Create the shared AudioContext (only call once audio may start) and decode what waits for it. */
function startContext() {
    if (sharedContext) return sharedContext;
    const Context = contextClass();
    if (!Context) return null;
    try {
        sharedContext = new Context();
    } catch {
        return null;
    }
    for (const manager of waiting) manager._decodeAll(sharedContext);
    waiting.clear();
    return sharedContext;
}

function unlock() {
    const context = startContext();
    if (context && context.state !== 'running') context.resume().catch(() => {});
    if (context && context.state === 'running') stopListening();
}

function listenForGesture() {
    if (unlockListening || typeof window === 'undefined' || !window.addEventListener) return;
    unlockListening = true;
    for (const type of UNLOCK_EVENTS) window.addEventListener(type, unlock, { capture: true, passive: true });
}

function stopListening() {
    if (!unlockListening) return;
    unlockListening = false;
    if (typeof window === 'undefined' || !window.removeEventListener) return;
    for (const type of UNLOCK_EVENTS) window.removeEventListener(type, unlock, true);
}

/** decodeAudioData with the callback form older Safari needs. */
function decode(context, data) {
    return new Promise((resolve, reject) => {
        const promise = context.decodeAudioData(data, resolve, reject);
        if (promise && typeof promise.then === 'function') promise.then(resolve, reject);
    });
}

export class SoundManager {
    constructor({ volume = 1 } = {}) {
        // One entry per loaded sound: { element, data: ArrayBuffer|null, buffer: AudioBuffer|null }.
        this.sounds = [];
        this.enabled = true;
        this.volume = volume;
    }

    async preload(srcs) {
        const webAudio = !!contextClass() && !isIOS() && typeof fetch === 'function';
        this.sounds = (await Promise.all(srcs.map(src => this._load(src, webAudio))))
            .filter(Boolean);
        if (!webAudio || !this.sounds.some((s) => s.data)) return;
        if (sharedContext) this._decodeAll(sharedContext);
        else {
            waiting.add(this);
            listenForGesture();
        }
    }

    /**
     * One sound: fetched once, kept for decoding once audio may start, with an `<audio>` element
     * over the same bytes for playback until then. When it cannot be fetched (a cross-origin
     * file without CORS, say), or without Web Audio, the element loads `src` itself, as it
     * always did.
     */
    async _load(src, webAudio) {
        if (webAudio) {
            let data = null;
            try {
                const response = await fetch(src);
                if (response.ok) data = await response.arrayBuffer();
            } catch {
                data = null;
            }
            if (data) {
                const url = URL.createObjectURL(new Blob([data], { type: mimeType(src) }));
                const element = await this._loadAudio(url, src);
                // A sound its element cannot play was dropped before, so it still is: the
                // random pick keeps choosing among the same sounds.
                return element ? { element, data, buffer: null } : null;
            }
        }
        const element = await this._loadAudio(src);
        return element ? { element, data: null, buffer: null } : null;
    }

    /** Decode every sound that waits for it; a file Web Audio cannot decode keeps its element. */
    _decodeAll(context) {
        for (const sound of this.sounds) {
            if (!sound.data) continue;
            const data = sound.data;
            sound.data = null;
            decode(context, data).then((buffer) => { sound.buffer = buffer; }, () => {});
        }
    }

    _loadAudio(src, name = src) {
        return new Promise((resolve) => {
            const audio = new Audio(src);
            audio.preload = 'auto';
            const done = (value) => resolve(value);
            audio.addEventListener('canplaythrough', () => done(audio), { once: true });
            audio.addEventListener('error', () => {
                console.warn(`SoundManager: failed to load "${name}"`);
                done(null);
            }, { once: true });
            // Some browsers won't fire canplaythrough until the element is in the DOM or
            // explicitly loaded — kick it.
            audio.load();
        });
    }

    play(volume = 1) {
        if (!this.enabled || this.sounds.length === 0) return;
        const pick = this.sounds[Math.floor(Math.random() * this.sounds.length)];
        const gain = Math.max(0, Math.min(1, this.volume * volume));
        // A frame that has had a user gesture may start audio (an iframe gets its own clicks).
        if (!sharedContext && waiting.has(this) && hasBeenActive()) startContext();
        const context = sharedContext;
        if (pick.buffer && context && context.state === 'running') {
            const source = context.createBufferSource();
            source.buffer = pick.buffer;
            const node = context.createGain();
            node.gain.value = gain;
            source.connect(node);
            node.connect(context.destination);
            source.start();
            return;
        }
        if (context && context.state === 'suspended' && hasBeenActive() !== false) context.resume().catch(() => {});
        if (!pick.element) return;
        const node = pick.element.cloneNode();
        node.volume = gain;
        node.play().catch(() => { /* autoplay restrictions, ignore */ });
    }

    setEnabled(enabled) {
        this.enabled = enabled;
    }

    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
    }
}

function mimeType(src) {
    const ext = String(src).split(/[?#]/)[0].split('.').pop().toLowerCase();
    return { ogg: 'audio/ogg', oga: 'audio/ogg', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', webm: 'audio/webm', opus: 'audio/ogg' }[ext] || '';
}

/** Tests: forget the shared AudioContext and anything waiting for it. */
export function _resetAudioContextForTests() {
    stopListening();
    waiting.clear();
    sharedContext = null;
}
