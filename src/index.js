/**
 * Dice Roll Engine - A 3D dice rolling library
 * @module open-dice-dnd
 */

export { DiceRoller } from './DiceRoller.js';
export { createDie, getDieValue } from './dice.js';
export { DecalRegistry } from './decal-registry.js';
export { SoundManager } from './sound-manager.js';

// Effects: import individual factories or `presets` to build the `effects: [...]`
// option, or import everything via `import * as effects from 'open-dice-dnd/effects'`.
export {
    glow,
    scalePulse,
    haloRing,
    screenShake,
    slowMoZoom,
    particleBurst,
    confetti,
    fire,
    trail,
    bloodSplat,
    acidSplat,
    frost,
    electric,
    psychic,
    necrotic,
    radiant,
    thunder,
    slashing,
    runEffectsRules,
    presets,
} from './effects/index.js';

// Convenience namespace — `import { effects } from 'open-dice-dnd'` then `effects.glow(...)`.
import * as effectsNamespace from './effects/index.js';
export const effects = effectsNamespace;
