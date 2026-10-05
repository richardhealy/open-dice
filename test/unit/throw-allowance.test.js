import { describe, it, expect } from 'vitest';
import { modelDiceAllowance } from '../../src/models/throw-allowance.js';

// One liquid flask per throw (spec 2026-10-05, liquid dice, "one per throw"): a model die
// with a liquid block is the costliest thing on the table (a 48-point hull in the physics,
// a glass shell and a draught in the render), so in one throw only the first die of each
// design and type that has a liquid model rolls as the model; the others roll as that
// design's procedural die. Designs without liquid are not capped.

const sets = {
    potion: { id: 'potion', models: { d4: { src: 'p.glb', liquid: { color: '#B3122A' } } } },
    dry: { id: 'dry', models: { d4: { src: 'd.glb' } } },
    wet20: { id: 'wet20', models: { d20: { src: 'w.glb', liquid: { color: '#3F9BE0' } } } },
    classic: { id: 'classic' },
};
const setFor = (roll) => sets[roll.set || 'classic'];
const d = (dice, set) => (set ? { dice, set } : { dice });

describe('modelDiceAllowance', () => {
    it('lets the first liquid model die of each design and type roll as the model, the rest procedural', () => {
        expect(modelDiceAllowance([d('d4', 'potion'), d('d4', 'potion'), d('d4', 'potion')], setFor)).toEqual([true, false, false]);
    });

    it('caps per design and type: two liquid designs each get their flask; a d20 flask and a d4 flask both roll', () => {
        expect(modelDiceAllowance([d('d4', 'potion'), d('d20', 'wet20'), d('d4', 'potion'), d('d20', 'wet20')], setFor)).toEqual([true, true, false, false]);
        const both = { id: 'both', models: { d4: sets.potion.models.d4, d20: sets.wet20.models.d20 } };
        expect(modelDiceAllowance([d('d4', 'both'), d('d20', 'both'), d('d4', 'both')], () => both)).toEqual([true, true, false]);
    });

    it('never caps a model without liquid, a type the design gives no model, or classic dice', () => {
        expect(modelDiceAllowance([d('d4', 'dry'), d('d4', 'dry'), d('d6', 'potion'), d('d6', 'potion'), d('d4'), d('d4')], setFor)).toEqual([true, true, true, true, true, true]);
    });

    it('keeps the order of the throw, so a replay makes the same choice', () => {
        const config = [d('d6', 'potion'), d('d4', 'potion'), d('d4', 'dry'), d('d4', 'potion')];
        expect(modelDiceAllowance(config, setFor)).toEqual([true, true, true, false]);
        expect(modelDiceAllowance(config.map((c) => ({ ...c, rolled: 3 })), setFor)).toEqual([true, true, true, false]);
    });
});
