import { describe, it, expect } from 'vitest';
import { validateSet } from '../../src/sets/validate.js';

const minimalGem = () => ({
    id: 'my-gem', name: 'My Gem', family: 'gem',
    body: { color: '#B5173A' },
    edge: { metal: 'gold' },
    numeral: { color: '#2A0912', style: 'engraved' },
    swatch: ['#B5173A'],
});

describe('validateSet', () => {
    it('applies family defaults and freezes the result', () => {
        const set = validateSet(minimalGem());
        expect(Object.isFrozen(set)).toBe(true);
        expect(set.body).toMatchObject({ color: '#B5173A', depthColor: '#B5173A', roughness: 0.16, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06, glow: null, texture: null, normalStrength: 0, envMapIntensity: 1 });
        expect(set.numeral).toEqual({ font: 'OpenDiceNumerals', weight: 700, color: '#2A0912', style: 'engraved', metal: null, glow: null, scale: 1 });
        expect(set.decor).toBeNull();
        expect(set.edge).toEqual({ metal: 'gold' });
    });

    it('keeps explicit overrides', () => {
        const set = validateSet({ ...minimalGem(), body: { color: '#111111', roughness: 0.4, texture: { kind: 'marble', color2: '#222222', scale: 2, contrast: 0.3 } }, decor: { art: 'filigree', metal: 'silver', relief: 0.5 } });
        expect(set.body.roughness).toBe(0.4);
        expect(set.body.texture).toEqual({ kind: 'marble', color2: '#222222', scale: 2, contrast: 0.3 });
        expect(set.decor).toEqual({ art: 'filigree', metal: 'silver', relief: 0.5 });
    });

    const bad = (patch, field) => {
        const def = { ...minimalGem(), ...patch };
        expect(() => validateSet(def)).toThrow(new RegExp(`invalid dice set — ${field.replace('.', '\\.')}:`));
    };

    it('rejects malformed definitions with the failing field named', () => {
        bad({ id: 'Ruby Jewel' }, 'id');
        bad({ name: '' }, 'name');
        bad({ family: 'plastic' }, 'family');
        bad({ body: { color: 'red' } }, 'body.color');
        bad({ edge: { metal: 'platinum' } }, 'edge.metal');
        bad({ numeral: { color: '#000000', style: 'inlay' } }, 'numeral.metal');
        bad({ numeral: { color: '#000000', style: 'glow' } }, 'numeral.glow');
        bad({ numeral: { color: '#000000', style: 'flat', scale: 5 } }, 'numeral.scale');
        bad({ family: 'textured' }, 'body.texture');
        bad({ body: { color: '#000000', texture: { kind: 'plaid', color2: '#111111' } } }, 'body.texture.kind');
        bad({ decor: { art: 'dragons', metal: 'gold', relief: 0.5 } }, 'decor.art');
        bad({ swatch: [] }, 'swatch');
        expect(() => validateSet(null)).toThrow(/definition/);
    });
});
