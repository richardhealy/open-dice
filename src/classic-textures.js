/**
 * Classic face textures shared by a roller's dice. Two classic faces with the same numeral,
 * colours, decal, secrecy and texture flags paint the same pixels, so dice share one texture
 * (painted and uploaded once) instead of each painting its own. Entries are reference counted:
 * each die holds its faces until the roller releases them, and a texture no die holds is
 * disposed, so the cache never keeps a texture for every colour pair a table has rolled.
 */
export class ClassicTextureCache {
    constructor() {
        this.entries = new Map();   // key -> { texture, refs }
        this.keys = new Map();      // texture -> key
    }

    /** The texture for `key`, painted by `create` if no die holds one; the caller holds a reference. */
    acquire(key, create) {
        let entry = this.entries.get(key);
        if (!entry) {
            const texture = create();
            entry = { texture, refs: 0 };
            this.entries.set(key, entry);
            this.keys.set(texture, key);
        }
        entry.refs++;
        return entry.texture;
    }

    /** True when `texture` came from this cache. */
    owns(texture) {
        return this.keys.has(texture);
    }

    /** Drop one reference; the last one disposes the texture. Textures from elsewhere are ignored. */
    release(texture) {
        if (!this.owns(texture)) return;
        const key = this.keys.get(texture);
        const entry = this.entries.get(key);
        entry.refs--;
        if (entry.refs <= 0) {
            this.entries.delete(key);
            this.keys.delete(texture);
            texture.dispose();
        }
    }

    /** Dispose every texture (the roller is going away). */
    clear() {
        for (const { texture } of this.entries.values()) texture.dispose();
        this.entries.clear();
        this.keys.clear();
    }

    get size() {
        return this.entries.size;
    }
}
