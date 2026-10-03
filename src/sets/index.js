import { validateSet } from './validate.js';
import { BUILTIN_SETS } from './builtin/index.js';

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

/** Validate and register a set. Returns its id. Throws on an invalid or duplicate definition. */
export function registerDiceSet(definition) {
    const set = validateSet(definition);
    if (set.id === CLASSIC || registry.has(set.id)) {
        throw new Error(`open-dice-dnd: a dice set with id "${set.id}" already exists.`);
    }
    registry.set(set.id, set);
    return set.id;
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

function registerBuiltins() {
    for (const def of BUILTIN_SETS) registerDiceSet(def);
}

/** Tests only: drop every registered set and re-register the built-ins. */
export function _resetRegistryForTests() {
    registry.clear();
    warned.clear();
    registerBuiltins();
}

registerBuiltins();
