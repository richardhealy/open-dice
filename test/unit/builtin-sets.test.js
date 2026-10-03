import { describe, it, expect } from 'vitest';
import { BUILTIN_SETS } from '../../src/sets/builtin/index.js';
import { listDiceSets, getDiceSet } from '../../src/sets/index.js';
import { validateSet } from '../../src/sets/validate.js';

describe('built-in sets', () => {
    it('ships the five launch sets in catalogue order after classic', () => {
        expect(listDiceSets().map((s) => s.id)).toEqual(['classic', 'ruby-jewel', 'emerald-jewel', 'sapphire-jewel', 'obsidian-gold', 'ember-dragonhide']);
    });

    it('every definition validates as written', () => {
        for (const def of BUILTIN_SETS) expect(() => validateSet(def)).not.toThrow();
    });

    it('matches the spec recipes', () => {
        const ruby = getDiceSet('ruby-jewel');
        expect(ruby.family).toBe('gem');
        expect(ruby.edge.metal).toBe('gold');
        expect(ruby.numeral.style).toBe('engraved');
        expect(ruby.decor).toEqual([{ art: 'filigree', image: null, metal: 'gold', color: null, relief: 0.6, scale: 1, glow: 0 }]);
        expect(ruby.body.glow).toEqual({ color: '#FF2D55', intensity: 0.18 });
        const emerald = getDiceSet('emerald-jewel');
        expect(emerald.decor).toEqual(ruby.decor);
        expect(emerald.body.color).not.toBe(ruby.body.color);
        const obsidian = getDiceSet('obsidian-gold');
        expect(obsidian.family).toBe('glass');
        expect(obsidian.numeral).toMatchObject({ style: 'inlay', metal: 'gold', scale: 1.05 });
        expect(obsidian.decor).toBeNull();
        const ember = getDiceSet('ember-dragonhide');
        expect(ember.family).toBe('textured');
        expect(ember.body.texture.kind).toBe('scales');
        expect(ember.body.normalStrength).toBe(0.8);
        expect(ember.edge.metal).toBe('iron');
        expect(ember.numeral).toMatchObject({ style: 'glow', glow: { color: '#FF7A1A', intensity: 1.6 } });
        for (const s of listDiceSets()) expect(s.swatch.length).toBeGreaterThanOrEqual(1);
    });
});
