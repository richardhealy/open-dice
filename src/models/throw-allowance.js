/**
 * One flask per throw. A model die with a liquid block is the costliest die on the table: a
 * 48-point hull in the physics (every edge pair of two touching hulls is tested each step,
 * and the whole throw is simulated before the first frame) and a glass shell with a draught
 * in the render. So in one throw only the first die of each design and die type that has a
 * liquid model rolls as the model; the others roll as that design's procedural die, with the
 * same look as the rest of its set. Designs without liquid are not capped.
 */

/**
 * Per entry of a throw config, whether that die may roll as its design's model. The choice
 * follows the order of the throw, so a replay (the same config with `rolled`) makes it too.
 * @param {Array<{ dice: string, set?: string|object }>} diceConfig
 * @param {(roll: object) => { id?: string, models?: object } | null} setFor the resolved design of a config entry
 * @returns {boolean[]}
 */
export function modelDiceAllowance(diceConfig, setFor) {
    const seen = new Set();
    return diceConfig.map((roll) => {
        const set = setFor(roll);
        const model = set && set.models ? set.models[roll.dice] : null;
        if (!model || !model.liquid) return true;
        const key = `${set.id}\u0000${roll.dice}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
