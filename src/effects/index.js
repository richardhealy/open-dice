/**
 * Public effects API.
 *
 * Usage (declarative):
 *   import { DiceRoller, effects } from 'open-dice-dnd';
 *   new DiceRoller({
 *     effects: [
 *       { match: { type: 'd20', visible: 20 }, play: [
 *         effects.glow({ color: 0xfacc15 }),
 *         effects.haloRing(),
 *         effects.confetti(),
 *       ]},
 *       { match: 'clean', play: effects.glow({ color: 0x4ade80 }) },
 *     ],
 *   });
 *
 * Usage (preset):
 *   import { DiceRoller, presets } from 'open-dice-dnd';
 *   new DiceRoller({ effects: presets.classicCrit });
 *
 * Usage (imperative — from any callback or external code):
 *   diceRoller.playEffect(effects.glow({ color: 0xff0000 }), die);
 *
 * Adding your own effect:
 *   Export a factory `myEffect(options) -> { scope: 'die'|'once', create(ctx) -> { update(): boolean } }`.
 *   Use it in a rule just like the built-ins.
 */

export { glow } from './glow.js';
export { scalePulse } from './scale-pulse.js';
export { haloRing } from './halo-ring.js';
export { screenShake } from './screen-shake.js';
export { slowMoZoom } from './slow-mo-zoom.js';
export { particleBurst } from './particle-burst.js';
export { confetti } from './confetti.js';
export { fire } from './fire.js';
export { trail } from './trail.js';
export { bloodSplat, acidSplat } from './splat.js';
export { frost } from './frost.js';
export { electric } from './electric.js';
export { psychic } from './psychic.js';
export { necrotic } from './necrotic.js';
export { radiant } from './radiant.js';
export { thunder } from './thunder.js';
export { slashing } from './slashing.js';
export { runEffectsRules } from './runner.js';
export { presets } from './presets.js';
