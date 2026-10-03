import { describe, it, expect } from 'vitest';
import { BUILTIN_SETS } from '../../src/sets/builtin/index.js';
import { listDiceSets, getDiceSet } from '../../src/sets/index.js';
import { validateSet } from '../../src/sets/validate.js';

describe('built-in sets', () => {
    it('ships the ten built-in sets in catalogue order after classic', () => {
        expect(listDiceSets().map((s) => s.id)).toEqual([
            'classic', 'ruby-jewel', 'emerald-jewel', 'sapphire-jewel', 'obsidian-gold', 'ember-dragonhide',
            'tidepool-pour', 'witchlight-vines', 'mainframe', 'rosewood-knotwork', 'rose-felt',
        ]);
    });

    it('every definition validates as written', () => {
        expect(BUILTIN_SETS).toHaveLength(10);
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

    it('matches the pattern-set recipes', () => {
        const tidepool = getDiceSet('tidepool-pour');
        expect(tidepool.body.texture).toMatchObject({ kind: 'pour', perFace: true });
        expect(tidepool.body.texture.palette).toHaveLength(4);
        expect(tidepool.body.texture.lacing).not.toBeNull();
        expect(tidepool.numeral).toMatchObject({ style: 'engraved', color: '#D4AF37', scale: 1.1 });
        expect(tidepool.edge.metal).toBe('gold');
        expect(tidepool.decor).toHaveLength(1);
        expect(tidepool.decor[0]).toMatchObject({ art: 'frame', metal: 'gold' });

        const witchlight = getDiceSet('witchlight-vines');
        expect(witchlight.decor).toHaveLength(1);
        expect(witchlight.decor[0]).toMatchObject({ art: 'vines', metal: null, glow: 0.6 });
        expect(witchlight.decor[0].color).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(witchlight.numeral.style).toBe('glow');
        expect(witchlight.edge.metal).toBe('silver');
        expect(witchlight.body.vignette).toBe(0.6);

        const mainframe = getDiceSet('mainframe');
        expect(mainframe.numeral.font).toBe('OpenDiceMono');
        expect(mainframe.numeral.style).toBe('glow');
        expect(mainframe.body.texture.kind).toBe('circuit');
        expect(mainframe.body.emissive).toEqual({ color: mainframe.body.texture.color2, intensity: 0.35 });
        expect(mainframe.edge.metal).toBe('iron');
        expect(mainframe.decor).toBeNull();

        const rosewood = getDiceSet('rosewood-knotwork');
        expect(rosewood.body.texture.kind).toBe('pour');
        expect(rosewood.body.texture.warp).toBeLessThan(4);
        expect(rosewood.decor).toHaveLength(1);
        expect(rosewood.decor[0]).toMatchObject({ art: 'knotwork', metal: 'gold' });
        expect(rosewood.numeral.style).toBe('engraved');
        expect(rosewood.edge.metal).toBe('gold');
        expect(rosewood.emblems['20']).toMatchObject({ art: 'sunburst', metal: 'gold' });

        const felt = getDiceSet('rose-felt');
        expect(felt.body.texture.kind).toBe('felt');
        expect(felt.body.vignette).toBe(0.45);
        expect(felt.body.roughness).toBe(1);
        expect(felt.body.clearcoat).toBe(0);
        expect(felt.edge.metal).toBe('none');
        expect(felt.decor).toHaveLength(1);
        expect(felt.decor[0]).toMatchObject({ art: 'corners', metal: null });
        expect(felt.decor[0].color).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(felt.numeral.style).toBe('engraved');
    });
});
