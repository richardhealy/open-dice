/**
 * Shared helpers and the effect contract.
 *
 * Each effect module exports a factory `name(options)` that returns an "effect spec":
 *   {
 *     scope: 'die' | 'once',   // 'die' = run per matched die; 'once' = run once per batch
 *     create(ctx) -> {          // ctx = { die, result, batchResult, roller }
 *       update(): boolean       // returns true when the effect is finished
 *     }
 *   }
 *
 * The DiceRoller's animate loop pushes `create(ctx)`'s return value onto its `effects`
 * array and calls each one's `update()` per frame, disposing of finished effects.
 *
 * 'once'-scoped effects only fire on the first matching die in a batch — useful for
 * global things like screen-shake or camera zoom that shouldn't stack.
 */

export function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

export function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
