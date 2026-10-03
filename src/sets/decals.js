/**
 * A design's own decals. They are ordinary decal options, `{ src, scale?, offsetX?, offsetY?,
 * rotation? }`, keyed by die type and then by face value, so they travel through exactly the
 * same pipeline as the decals a host passes per die: the DecalRegistry loads them, the face
 * painter draws them in place of the numeral, secret rolls hide them.
 */

/**
 * The decals for one die of `type`: the design's, overlaid by the die's own `decals` option.
 * The die's entry wins per value, and `null` for a value switches the design's decal off.
 * Keyed by die type so a design's "20" mark lands on the d20 and never on the d100's tens die.
 */
export function setDecalsFor(set, type, dieDecals) {
    const own = set && set.decals ? set.decals[type] : null;
    if (!own) return dieDecals || null;
    if (!dieDecals) return own;
    return { ...own, ...dieDecals };
}

/** Every decal image a design references, once, for preloading. */
export function collectSetDecalSources(set) {
    const out = [];
    for (const byValue of Object.values((set && set.decals) || {})) {
        for (const decal of Object.values(byValue || {})) {
            if (decal && decal.src && !out.includes(decal.src)) out.push(decal.src);
        }
    }
    return out;
}
