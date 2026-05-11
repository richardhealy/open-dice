/**
 * Loads short impact sounds and plays one (randomly picked) per collision event.
 *
 * Uses HTMLAudioElement.cloneNode() so a fresh playback instance is created per call —
 * a single Audio element can't overlap with itself, but cloned ones can, which matters
 * when several dice contact at once.
 *
 * Volume scales with impact strength so glancing contacts stay quiet and only real hits
 * are loud. A short per-die cooldown prevents the rapid-fire scratchy noise that
 * otherwise plays as a die rolls to rest on the floor.
 */
export class SoundManager {
    constructor({ volume = 1 } = {}) {
        this.sounds = [];
        this.enabled = true;
        this.volume = volume;
    }

    async preload(srcs) {
        this.sounds = (await Promise.all(srcs.map(src => this._loadAudio(src))))
            .filter(Boolean);
    }

    _loadAudio(src) {
        return new Promise((resolve) => {
            const audio = new Audio(src);
            audio.preload = 'auto';
            const done = (value) => resolve(value);
            audio.addEventListener('canplaythrough', () => done(audio), { once: true });
            audio.addEventListener('error', () => {
                console.warn(`SoundManager: failed to load "${src}"`);
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
        const node = pick.cloneNode();
        node.volume = Math.max(0, Math.min(1, this.volume * volume));
        node.play().catch(() => { /* autoplay restrictions, ignore */ });
    }

    setEnabled(enabled) {
        this.enabled = enabled;
    }

    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
    }
}
