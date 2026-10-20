/**
 * Loads short impact sounds and plays one (randomly picked) per collision event.
 *
 * Each sound is fetched and decoded once into a Web Audio buffer; a collision plays it through
 * its own buffer source and gain node, so several dice contacting at once overlap freely,
 * without the new `<audio>` element per collision this used to clone. The gain is the same
 * linear volume the element had.
 *
 * Browsers start audio only after the user has interacted with the page. The shared
 * AudioContext resumes on the first pointer, key or touch event and whenever a sound plays;
 * until it runs, and for any sound Web Audio cannot load or decode, a sound plays exactly as
 * before: a clone of an `<audio>` element, which the browser plays or blocks as it always has.
 *
 * Volume scales with impact strength so glancing contacts stay quiet and only real hits
 * are loud. A short per-die cooldown prevents the rapid-fire scratchy noise that
 * otherwise plays as a die rolls to rest on the floor.
 */

let sharedContext;   // undefined: not created yet; null: no Web Audio here
const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchend'];

function unlock() {
    if (sharedContext && sharedContext.state !== 'running') sharedContext.resume().catch(() => {});
    if (sharedContext && sharedContext.state === 'running') {
        for (const type of UNLOCK_EVENTS) window.removeEventListener(type, unlock, true);
    }
}

/** The page's AudioContext, created on first use; null where Web Audio is unavailable. */
function audioContext() {
    if (sharedContext !== undefined) return sharedContext;
    sharedContext = null;
    const Context = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
    if (!Context) return null;
    try {
        sharedContext = new Context();
    } catch {
        return null;
    }
    if (sharedContext.state !== 'running') {
        for (const type of UNLOCK_EVENTS) window.addEventListener(type, unlock, { capture: true, passive: true });
    }
    return sharedContext;
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
        // One entry per loaded sound: { buffer: AudioBuffer|null, element: HTMLAudioElement|null }.
        this.sounds = [];
        this.enabled = true;
        this.volume = volume;
    }

    async preload(srcs) {
        const context = audioContext();
        this.sounds = (await Promise.all(srcs.map(src => this._load(src, context))))
            .filter(Boolean);
    }

    /**
     * One sound: fetched once, decoded for Web Audio, and an `<audio>` element over the same
     * bytes for playback before audio is allowed. When it cannot be fetched (a cross-origin
     * file without CORS, say) the element loads `src` itself, as it always did.
     */
    async _load(src, context) {
        if (context && typeof fetch === 'function') {
            let data = null;
            try {
                const response = await fetch(src);
                if (response.ok) data = await response.arrayBuffer();
            } catch {
                data = null;
            }
            if (data) {
                const url = URL.createObjectURL(new Blob([data], { type: mimeType(src) }));
                const [buffer, element] = await Promise.all([
                    decode(context, data).catch(() => null),
                    this._loadAudio(url, src),
                ]);
                if (buffer || element) return { buffer, element };
                return null;
            }
        }
        const element = await this._loadAudio(src);
        return element ? { buffer: null, element } : null;
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
        if (context && context.state === 'suspended') context.resume().catch(() => {});
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

/** Tests: forget the shared AudioContext so the next preload creates one. */
export function _resetAudioContextForTests() {
    if (typeof window !== 'undefined') for (const type of UNLOCK_EVENTS) window.removeEventListener(type, unlock, true);
    sharedContext = undefined;
}
