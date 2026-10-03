import { validateSet } from './validate.js';
import { evictSetTextures } from './texture-cache.js';

export const CLASSIC = 'classic';

/** The pre-1.4 look: Phong, flat colours, Arial. Not a real recipe; the builder special-cases it. */
export const CLASSIC_SET = Object.freeze({
    id: CLASSIC,
    name: 'Classic',
    family: 'classic',
    swatch: Object.freeze(['#f0f0f0']),
});

const registry = new Map();
const warned = new Set();

/**
 * Validate and register a design. Returns its id. Throws on an invalid definition, on the
 * reserved id 'classic', and on an id already registered unless `replace` is true, in which
 * case the new definition takes over and that design's cached textures are dropped so the
 * next roll repaints it. The library ships no designs: the host registers its own.
 */
export function registerDiceSet(definition, options) {
    const replace = !!(options && options.replace);
    const set = validateSet(definition);
    if (set.id === CLASSIC || (registry.has(set.id) && !replace)) {
        throw new Error(`open-dice-dnd: a dice set with id "${set.id}" already exists.`);
    }
    if (registry.has(set.id)) evictSetTextures(set.id);
    registry.set(set.id, set);
    warned.delete(set.id);
    return set.id;
}

/** Remove a registered design and its cached textures. Returns whether it was registered. */
export function unregisterDiceSet(id) {
    if (!registry.has(id)) return false;
    registry.delete(id);
    evictSetTextures(id);
    return true;
}

export function getDiceSet(id) {
    if (id === CLASSIC) return CLASSIC_SET;
    return registry.get(id);
}

/** Picker-friendly summaries, classic first. */
export function listDiceSets() {
    return [CLASSIC_SET, ...registry.values()].map((s) => ({ id: s.id, name: s.name, family: s.family, swatch: [...s.swatch] }));
}

/**
 * Turn whatever a caller passed (nothing, an id, or an already-resolved set) into a resolved
 * set. Unknown ids warn once and fall back to classic so a bad id can never break a roll.
 */
export function resolveSet(idOrSet) {
    if (!idOrSet) return CLASSIC_SET;
    if (typeof idOrSet === 'object') return idOrSet.id === CLASSIC ? CLASSIC_SET : idOrSet;
    const found = getDiceSet(idOrSet);
    if (found) return found;
    if (!warned.has(idOrSet)) {
        warned.add(idOrSet);
        console.warn(`open-dice-dnd: unknown dice set "${idOrSet}"; rendering classic dice instead.`);
    }
    return CLASSIC_SET;
}

/** Tests only: drop every registered design (classic always remains). */
export function _resetRegistryForTests() {
    registry.clear();
    warned.clear();
}
