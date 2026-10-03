import { describe, it, expect } from 'vitest';
import { validateSet } from '../../src/sets/validate.js';
import { shade } from '../../src/sets/color.js';

const minimalGem = () => ({
    id: 'my-gem', name: 'My Gem', family: 'gem',
    body: { color: '#B5173A' },
    edge: { metal: 'gold' },
    numeral: { color: '#2A0912', style: 'engraved' },
    swatch: ['#B5173A'],
});

const PREFIX = 'open-dice-dnd: invalid dice set — ';

/** Validate a patched definition and return the failing field named in the error (or null when it validates). */
function failingField(patch) {
    try {
        validateSet({ ...minimalGem(), ...patch });
        return null;
    } catch (error) {
        expect(error.message.startsWith(PREFIX)).toBe(true);
        return error.message.slice(PREFIX.length).split(':')[0];
    }
}

const withBody = (body) => ({ body: { color: '#B5173A', ...body } });
const withTexture = (texture) => withBody({ texture });

describe('validateSet', () => {
    it('numeral.outline is optional; when given it needs a hex colour and a width 0.02..0.2 (default 0.08)', () => {
        const base = { id: 'o', name: 'o', family: 'gem', body: { color: '#123456' }, edge: { metal: 'gold' }, swatch: ['#123456'] };
        expect(validateSet({ ...base, numeral: { color: '#ffffff', style: 'flat' } }).numeral.outline).toBeNull();
        expect(validateSet({ ...base, numeral: { color: '#ffffff', style: 'flat', outline: { color: '#000000' } } }).numeral.outline).toEqual({ color: '#000000', width: 0.08 });
        expect(validateSet({ ...base, numeral: { color: '#ffffff', style: 'flat', outline: { color: '#000000', width: 0.12 } } }).numeral.outline).toEqual({ color: '#000000', width: 0.12 });
        expect(() => validateSet({ ...base, numeral: { color: '#ffffff', style: 'flat', outline: { width: 0.1 } } })).toThrow(/numeral\.outline\.color/);
        expect(() => validateSet({ ...base, numeral: { color: '#ffffff', style: 'flat', outline: { color: '#000000', width: 0.5 } } })).toThrow(/numeral\.outline\.width/);
    });

    it('applies family defaults and freezes the result', () => {
        const set = validateSet(minimalGem());
        expect(Object.isFrozen(set)).toBe(true);
        expect(set.body).toMatchObject({ color: '#B5173A', depthColor: '#B5173A', roughness: 0.16, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06, glow: null, texture: null, normalStrength: 0, envMapIntensity: 1 });
        expect(set.numeral).toEqual({ font: 'OpenDiceNumerals', weight: 700, color: '#2A0912', style: 'engraved', metal: null, glow: null, scale: 1, outline: null });
        expect(set.decor).toBeNull();
        expect(set.edge).toEqual({ metal: 'gold' });
    });

    it('keeps explicit overrides', () => {
        const set = validateSet({ ...minimalGem(), body: { color: '#111111', roughness: 0.4, texture: { kind: 'marble', color2: '#222222', scale: 2, contrast: 0.3 } }, decor: { art: 'filigree', metal: 'silver', relief: 0.5 } });
        expect(set.body.roughness).toBe(0.4);
        expect(set.body.texture).toEqual({ kind: 'marble', color2: '#222222', scale: 2, contrast: 0.3, perFace: false });
        expect(set.decor).toHaveLength(1);
        expect(set.decor[0]).toMatchObject({ art: 'filigree', metal: 'silver', relief: 0.5 });
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

    it('accepts the seven pattern kinds with their own fields: pour needs a palette, circuit a color2, felt derives color2', () => {
        // pour: palette 2..6, warp 0..8 (4), scale (3), optional lacing, color2/contrast optional
        const pour = validateSet({ ...minimalGem(), ...withTexture({ kind: 'pour', palette: ['#2F5BA8', '#EEE4D2', '#D9A441', '#B23A2E'] }) }).body.texture;
        expect(pour).toEqual({ kind: 'pour', palette: ['#2F5BA8', '#EEE4D2', '#D9A441', '#B23A2E'], warp: 4, scale: 3, lacing: null, color2: null, contrast: 0.3, perFace: false });
        const laced = validateSet({ ...minimalGem(), ...withTexture({ kind: 'pour', palette: ['#000000', '#ffffff'], warp: 2, scale: 5, lacing: { color: '#FFF4E0' }, color2: '#123456', contrast: 0.5 }) }).body.texture;
        expect(laced).toMatchObject({ warp: 2, scale: 5, lacing: { color: '#FFF4E0', width: 0.02 }, color2: '#123456', contrast: 0.5 });
        expect(validateSet({ ...minimalGem(), ...withTexture({ kind: 'pour', palette: ['#000000', '#ffffff'], lacing: { color: '#FFF4E0', width: 0.05 } }) }).body.texture.lacing.width).toBe(0.05);
        expect(failingField(withTexture({ kind: 'pour' }))).toBe('body.texture.palette');
        expect(failingField(withTexture({ kind: 'pour', palette: ['#000000'] }))).toBe('body.texture.palette');
        expect(failingField(withTexture({ kind: 'pour', palette: ['#000000', '#111111', '#222222', '#333333', '#444444', '#555555', '#666666'] }))).toBe('body.texture.palette');
        expect(failingField(withTexture({ kind: 'pour', palette: ['#000000', 'white'] }))).toBe('body.texture.palette[1]');
        expect(failingField(withTexture({ kind: 'pour', palette: ['#000000', '#ffffff'], warp: 9 }))).toBe('body.texture.warp');
        expect(failingField(withTexture({ kind: 'pour', palette: ['#000000', '#ffffff'], lacing: { width: 0.02 } }))).toBe('body.texture.lacing.color');
        expect(failingField(withTexture({ kind: 'pour', palette: ['#000000', '#ffffff'], lacing: { color: '#ffffff', width: 0.2 } }))).toBe('body.texture.lacing.width');

        // circuit: color2 required, density 5..120 (40), grid 6..24 (12), contrast (0.6)
        const circuit = validateSet({ ...minimalGem(), ...withTexture({ kind: 'circuit', color2: '#3CFF78' }) }).body.texture;
        expect(circuit).toEqual({ kind: 'circuit', color2: '#3CFF78', density: 40, grid: 12, contrast: 0.6, scale: 3, perFace: false });
        expect(validateSet({ ...minimalGem(), ...withTexture({ kind: 'circuit', color2: '#3CFF78', density: 80, grid: 20, contrast: 0.2 }) }).body.texture).toMatchObject({ density: 80, grid: 20, contrast: 0.2 });
        expect(failingField(withTexture({ kind: 'circuit' }))).toBe('body.texture.color2');
        expect(failingField(withTexture({ kind: 'circuit', color2: '#3CFF78', density: 200 }))).toBe('body.texture.density');
        expect(failingField(withTexture({ kind: 'circuit', color2: '#3CFF78', grid: 3 }))).toBe('body.texture.grid');

        // felt: color2 defaults to the body shaded -0.35, contrast 0.3
        const felt = validateSet({ ...minimalGem(), ...withTexture({ kind: 'felt' }) }).body.texture;
        expect(felt).toEqual({ kind: 'felt', color2: shade('#B5173A', -0.35), contrast: 0.3, scale: 3, perFace: false });
        expect(validateSet({ ...minimalGem(), ...withTexture({ kind: 'felt', color2: '#101010', contrast: 0.6 }) }).body.texture).toMatchObject({ color2: '#101010', contrast: 0.6 });

        // the four existing kinds still require color2
        for (const kind of ['noise', 'marble', 'veins', 'scales']) {
            expect(failingField(withTexture({ kind }))).toBe('body.texture.color2');
            expect(validateSet({ ...minimalGem(), ...withTexture({ kind, color2: '#222222' }) }).body.texture).toEqual({ kind, color2: '#222222', scale: 3, contrast: 0.3, perFace: false });
        }

        // perFace: boolean on every kind, default false
        expect(validateSet({ ...minimalGem(), ...withTexture({ kind: 'veins', color2: '#222222', perFace: true }) }).body.texture.perFace).toBe(true);
        expect(validateSet({ ...minimalGem(), ...withTexture({ kind: 'pour', palette: ['#000000', '#ffffff'], perFace: true }) }).body.texture.perFace).toBe(true);
        expect(failingField(withTexture({ kind: 'veins', color2: '#222222', perFace: 'yes' }))).toBe('body.texture.perFace');
        expect(failingField(withTexture({ kind: 'felt', perFace: 1 }))).toBe('body.texture.perFace');
    });

    it('accepts body.emissive as { color, intensity 0..4 }', () => {
        expect(validateSet(minimalGem()).body.emissive).toBeNull();
        expect(validateSet({ ...minimalGem(), ...withBody({ emissive: { color: '#3CFF78', intensity: 0.35 } }) }).body.emissive).toEqual({ color: '#3CFF78', intensity: 0.35 });
        expect(validateSet({ ...minimalGem(), ...withBody({ emissive: { color: '#3CFF78' } }) }).body.emissive.intensity).toBe(1);
        expect(failingField(withBody({ emissive: { intensity: 1 } }))).toBe('body.emissive.color');
        expect(failingField(withBody({ emissive: { color: '#3CFF78', intensity: 5 } }))).toBe('body.emissive.intensity');
        expect(failingField(withBody({ emissive: 'bright' }))).toBe('body.emissive');
    });

    it('accepts body.vignette 0..1, defaulting to 0.85 for gem and glass and 0 otherwise', () => {
        expect(validateSet(minimalGem()).body.vignette).toBe(0.85);
        expect(validateSet({ ...minimalGem(), family: 'glass' }).body.vignette).toBe(0.85);
        expect(validateSet({ ...minimalGem(), family: 'metal' }).body.vignette).toBe(0);
        expect(validateSet({ ...minimalGem(), family: 'textured', ...withTexture({ kind: 'felt' }) }).body.vignette).toBe(0);
        expect(validateSet({ ...minimalGem(), family: 'textured', ...withTexture({ kind: 'felt' }), body: { color: '#B5173A', texture: { kind: 'felt' }, vignette: 0.45 } }).body.vignette).toBe(0.45);
        expect(validateSet({ ...minimalGem(), ...withBody({ vignette: 0 }) }).body.vignette).toBe(0);
        expect(failingField(withBody({ vignette: 2 }))).toBe('body.vignette');
        expect(failingField(withBody({ vignette: -0.1 }))).toBe('body.vignette');
    });

    it('accepts body.image { src, fit cover|tile, scale 0.25..8 } and body.normalImage { src }', () => {
        const plain = validateSet(minimalGem()).body;
        expect(plain.image).toBeNull();
        expect(plain.normalImage).toBeNull();
        expect(validateSet({ ...minimalGem(), ...withBody({ image: { src: 'https://example.test/marble.jpg' } }) }).body.image).toEqual({ src: 'https://example.test/marble.jpg', fit: 'cover', scale: 1 });
        expect(validateSet({ ...minimalGem(), ...withBody({ image: { src: 'tile.png', fit: 'tile', scale: 4 } }) }).body.image).toEqual({ src: 'tile.png', fit: 'tile', scale: 4 });
        expect(validateSet({ ...minimalGem(), ...withBody({ normalImage: { src: 'normal.png' } }) }).body.normalImage).toEqual({ src: 'normal.png' });
        expect(failingField(withBody({ image: { fit: 'cover' } }))).toBe('body.image.src');
        expect(failingField(withBody({ image: { src: '' } }))).toBe('body.image.src');
        expect(failingField(withBody({ image: 'marble.jpg' }))).toBe('body.image');
        expect(failingField(withBody({ image: { src: 'a.png', fit: 'stretch' } }))).toBe('body.image.fit');
        expect(failingField(withBody({ image: { src: 'a.png', scale: 10 } }))).toBe('body.image.scale');
        expect(failingField(withBody({ normalImage: {} }))).toBe('body.normalImage.src');
        expect(failingField(withBody({ normalImage: 'normal.png' }))).toBe('body.normalImage');
    });

    it('normalises decor to an array of 1..6 layers, each metal or colour, art or image', () => {
        expect(validateSet({ ...minimalGem(), decor: null }).decor).toBeNull();
        // Review Focus 1: a 1.4.0 object decor becomes a one-element array carrying the same fields.
        const legacy = validateSet({ ...minimalGem(), decor: { art: 'filigree', metal: 'gold', relief: 0.6 } }).decor;
        expect(Array.isArray(legacy)).toBe(true);
        expect(legacy).toHaveLength(1);
        expect(legacy[0]).toEqual({ art: 'filigree', image: null, metal: 'gold', color: null, relief: 0.6, scale: 1, glow: 0 });
        expect(validateSet({ ...minimalGem(), decor: { art: 'filigree', metal: 'gold' } }).decor[0].relief).toBe(0.6);

        const layers = validateSet({ ...minimalGem(), decor: [
            { art: 'filigree', metal: 'silver', relief: 0.5, scale: 1.5 },
            { art: 'filigree', color: '#CDEFEB', glow: 0.6, relief: 0.3 },
            { image: { src: 'https://example.test/filigree.png' }, metal: 'gold', relief: 0.6 },
            { image: { src: 'tint.png' }, color: '#FF00FF' },
        ] }).decor;
        expect(layers).toEqual([
            { art: 'filigree', image: null, metal: 'silver', color: null, relief: 0.5, scale: 1.5, glow: 0 },
            { art: 'filigree', image: null, metal: null, color: '#CDEFEB', relief: 0.3, scale: 1, glow: 0.6 },
            { art: null, image: { src: 'https://example.test/filigree.png' }, metal: 'gold', color: null, relief: 0.6, scale: 1, glow: 0 },
            { art: null, image: { src: 'tint.png' }, metal: null, color: '#FF00FF', relief: 0.6, scale: 1, glow: 0 },
        ]);
        expect(validateSet({ ...minimalGem(), decor: Array.from({ length: 6 }, () => ({ art: 'filigree', metal: 'gold' })) }).decor).toHaveLength(6);

        const gold = (patch) => ({ art: 'filigree', metal: 'gold', ...patch });
        expect(failingField({ decor: { art: 'filigree', metal: 'gold', color: '#ffffff' } })).toBe('decor');   // object form keeps the 1.4.0 field names
        expect(failingField({ decor: { art: 'dragons', metal: 'gold' } })).toBe('decor.art');
        expect(failingField({ decor: [{ art: 'filigree', relief: 0.5 }] })).toBe('decor[0]');
        expect(failingField({ decor: Array.from({ length: 7 }, () => gold()) })).toBe('decor');
        expect(failingField({ decor: [] })).toBe('decor');
        expect(failingField({ decor: 'filigree' })).toBe('decor');
        expect(failingField({ decor: [gold(), { art: 'dragons', metal: 'gold' }] })).toBe('decor[1].art');
        expect(failingField({ decor: [{ art: 'filigree', metal: 'platinum' }] })).toBe('decor[0].metal');
        expect(failingField({ decor: [{ art: 'filigree', color: 'teal' }] })).toBe('decor[0].color');
        expect(failingField({ decor: [{ image: {}, metal: 'gold' }] })).toBe('decor[0].image.src');
        expect(failingField({ decor: [{ image: 'a.png', metal: 'gold' }] })).toBe('decor[0].image');
        expect(failingField({ decor: [{ metal: 'gold' }] })).toBe('decor[0]');
        expect(failingField({ decor: [{ art: 'filigree', image: { src: 'a.png' }, metal: 'gold' }] })).toBe('decor[0]');
        expect(failingField({ decor: [gold({ relief: 2 })] })).toBe('decor[0].relief');
        expect(failingField({ decor: [gold({ scale: 3 })] })).toBe('decor[0].scale');
        expect(failingField({ decor: [{ art: 'filigree', color: '#ffffff', glow: 5 }] })).toBe('decor[0].glow');
        expect(failingField({ decor: [gold({ glow: 1 })] })).toBe('decor[0].glow');
    });

    it('accepts emblems keyed by face value, as objects or art-id shorthands', () => {
        expect(validateSet(minimalGem()).emblems).toBeNull();
        const emblems = validateSet({ ...minimalGem(), emblems: {
            '20': { art: 'sunburst', metal: 'gold', scale: 0.9 },
            '1': 'skull',
            '10': { art: 'star', color: '#FFFFFF', relief: 0.2 },
            '5': { art: 'crown' },
        } }).emblems;
        expect(emblems).toEqual({
            '20': { art: 'sunburst', metal: 'gold', color: null, scale: 0.9, relief: 0.5 },
            '1': { art: 'skull', metal: null, color: '#2A0912', scale: 0.8, relief: 0.5 },
            '10': { art: 'star', metal: null, color: '#FFFFFF', scale: 0.8, relief: 0.2 },
            '5': { art: 'crown', metal: null, color: '#2A0912', scale: 0.8, relief: 0.5 },
        });
        expect(failingField({ emblems: { '20': 'dragon' } })).toBe('emblems.20.art');
        expect(failingField({ emblems: { '20': { art: 'dragon', metal: 'gold' } } })).toBe('emblems.20.art');
        expect(failingField({ emblems: { '20': { metal: 'gold' } } })).toBe('emblems.20.art');
        expect(failingField({ emblems: { '20': { art: 'sunburst', metal: 'gold', color: '#ffffff' } } })).toBe('emblems.20');
        expect(failingField({ emblems: { '20': { art: 'sunburst', metal: 'platinum' } } })).toBe('emblems.20.metal');
        expect(failingField({ emblems: { '20': { art: 'sunburst', scale: 0.2 } } })).toBe('emblems.20.scale');
        expect(failingField({ emblems: { '20': { art: 'sunburst', scale: 1.3 } } })).toBe('emblems.20.scale');
        expect(failingField({ emblems: { '20': { art: 'sunburst', relief: 2 } } })).toBe('emblems.20.relief');
        expect(failingField({ emblems: { '20': 7 } })).toBe('emblems.20');
        expect(failingField({ emblems: 'sunburst' })).toBe('emblems');
        expect(failingField({ emblems: ['sunburst'] })).toBe('emblems');
    });

    it('accepts any non-empty string as numeral.font and defaults otherwise', () => {
        const numeral = (font) => validateSet({ ...minimalGem(), numeral: { color: '#2A0912', style: 'engraved', font } }).numeral.font;
        expect(numeral('OpenDiceMono')).toBe('OpenDiceMono');
        expect(numeral('Papyrus')).toBe('Papyrus');
        expect(numeral(undefined)).toBe('OpenDiceNumerals');
        expect(numeral('   ')).toBe('OpenDiceNumerals');
        expect(numeral(12)).toBe('OpenDiceNumerals');
    });

    it('keeps the "open-dice-dnd: invalid dice set — <field>:" message form for every new field', () => {
        for (const patch of [
            withTexture({ kind: 'pour' }),
            withBody({ emissive: { color: 'green' } }),
            withBody({ vignette: 2 }),
            withBody({ image: {} }),
            { decor: [{ art: 'filigree' }] },
            { emblems: { '20': 'dragon' } },
        ]) {
            expect(() => validateSet({ ...minimalGem(), ...patch })).toThrow(/^open-dice-dnd: invalid dice set — [a-zA-Z0-9.\[\]]+: /);
        }
    });
});
