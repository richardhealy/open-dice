/**
 * Match a per-die result against a rule's `match` clause.
 *
 * Supported forms:
 *   match: 'any'                         — always true
 *   match: 'clean'                       — die's visible face === authoritative value
 *   match: 'variance'                    — visible diverged from authoritative
 *   match: { type: 'd20', visible: 20 }  — partial object match against the per-die result
 *                                           (other recognized keys: value, target, type)
 *   match: (perDie, die) => boolean      — custom predicate
 */
function ruleMatches(match, perDie, die) {
    if (match == null || match === 'any') return true;
    if (typeof match === 'function') return match(perDie, die);
    if (match === 'clean') return perDie.visible === perDie.value;
    if (match === 'variance') return perDie.visible !== perDie.value;
    if (typeof match === 'object') {
        for (const key of Object.keys(match)) {
            if (perDie[key] !== match[key]) return false;
        }
        return true;
    }
    return false;
}

/**
 * Evaluate a list of rules against a settled batch and schedule effects on the roller.
 *
 * Per-rule effects:
 * - `scope: 'die'`   → effect runs once per matching die.
 * - `scope: 'once'`  → effect runs once across all matching dice in this batch (still
 *                      requires at least one matching die).
 *
 * Rules are evaluated in order; later rules can match the same die.
 */
export function runEffectsRules(rules, batch, batchResult, roller) {
    if (!rules || rules.length === 0) return;

    for (const rule of rules) {
        const plays = Array.isArray(rule.play) ? rule.play : [rule.play];
        // Tracking is per-rule so different rules can each fire their own 'once' effects.
        const playedOnce = new Set();

        for (let i = 0; i < batchResult.results.length; i++) {
            const perDie = batchResult.results[i];
            const die = batch.dice[i];
            if (!ruleMatches(rule.match, perDie, die)) continue;

            for (const spec of plays) {
                if (!spec || typeof spec.create !== 'function') continue;
                if (spec.scope === 'once') {
                    if (playedOnce.has(spec)) continue;
                    playedOnce.add(spec);
                }
                const effect = spec.create({ die, result: perDie, batchResult, roller });
                if (effect && typeof effect.update === 'function') {
                    roller.effects.push(effect);
                }
            }
        }
    }
}
