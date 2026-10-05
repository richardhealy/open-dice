import { describe, it, expect } from 'vitest';
import { validateSet } from '../../src/sets/validate.js';
import { MODEL_DIE_TYPES, MODEL_DIE_VALUES } from '../../src/models/spec.js';
import { shade } from '../../src/sets/color.js';

const PREFIX = 'open-dice-dnd: invalid dice set — ';
const TETRA = [[1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1]];

const base = () => ({
    id: 'potion', name: 'Potion', family: 'glass',
    body: { color: '#8A0F1E' },
    numeral: { color: '#FFFFFF' },
    swatch: ['#8A0F1E'],
});

const d4Model = (patch = {}) => ({
    src: '/models/potion-d4.glb',
    hull: TETRA,
    faces: [1, 2, 3, 4].map((value, i) => ({ value, up: TETRA[i] })),
    labels: [{ value: 4, position: [0.2, 0.3, 0.1], normal: [0, 0, 2], up: [0, 3, 0], size: 0.3 }],
    ...patch,
});

function failing(models) {
    try {
        validateSet({ ...base(), models });
        return null;
    } catch (error) {
        expect(error.message.startsWith(PREFIX)).toBe(true);
        return error.message.slice(PREFIX.length);
    }
}

describe('models in a design', () => {
    it('is optional and resolves to null', () => {
        expect(validateSet(base()).models).toBeNull();
        expect(validateSet({ ...base(), models: null }).models).toBeNull();
    });

    it('keeps a valid d4 model with unit vectors and frozen data', () => {
        const set = validateSet({ ...base(), models: { d4: d4Model({ transform: { scale: 0.5, position: [0, -0.2, 0], rotation: [0, 0, 0, 2] } }) } });
        const m = set.models.d4;
        expect(m.src).toBe('/models/potion-d4.glb');
        expect(m.hull).toHaveLength(4);
        expect(m.faces.map((f) => f.value)).toEqual([1, 2, 3, 4]);
        expect(Math.hypot(...m.faces[0].up)).toBeCloseTo(1, 12);
        expect(m.labels[0].normal).toEqual([0, 0, 1]);
        expect(m.labels[0].up).toEqual([0, 1, 0]);
        expect(m.transform).toEqual({ scale: 0.5, position: [0, -0.2, 0], rotation: [0, 0, 0, 1] });
        expect(m.numeral).toBeNull();
        expect(Object.isFrozen(m.faces[0].up)).toBe(true);
    });

    it('defaults the transform and labels', () => {
        const m = validateSet({ ...base(), models: { d4: d4Model({ labels: undefined }) } }).models.d4;
        expect(m.transform).toEqual({ scale: 1, position: [0, 0, 0], rotation: [0, 0, 0, 1] });
        expect(m.labels).toEqual([]);
    });

    it('knows the value set of every model die type', () => {
        expect(MODEL_DIE_TYPES).toEqual(['d4', 'd6', 'd8', 'd10', 'd12', 'd20']);
        expect(MODEL_DIE_VALUES.d10).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
        expect(MODEL_DIE_VALUES.d20).toHaveLength(20);
    });

    it('rejects unknown die types, d100 included', () => {
        expect(failing({ d100: d4Model() })).toMatch(/^models\.d100: unknown die type/);
        expect(failing({ d7: d4Model() })).toMatch(/^models\.d7: unknown die type/);
        expect(failing([d4Model()])).toMatch(/^models: must map die types/);
    });

    it('needs a src', () => {
        expect(failing({ d4: d4Model({ src: '' }) })).toMatch(/^models\.d4\.src: required/);
    });

    it('checks the hull', () => {
        expect(failing({ d4: d4Model({ hull: TETRA.slice(0, 3) }) })).toMatch(/^models\.d4\.hull: must list 4 to 128 points/);
        expect(failing({ d4: d4Model({ hull: [...TETRA.slice(0, 3), [1, 'x', 0]] }) })).toMatch(/^models\.d4\.hull\[3\]: must be \[x, y, z\]/);
        expect(failing({ d4: d4Model({ hull: [...TETRA.slice(0, 3), [9, 0, 0]] }) })).toMatch(/^models\.d4\.hull\[3\]: must lie within 5 units/);
    });

    it('refuses a hull that spans no volume or does not surround its centre of mass', () => {
        expect(failing({ d4: d4Model({ hull: [[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]] }) })).toMatch(/^models\.d4\.hull: the points are flat/);
        expect(failing({ d4: d4Model({ hull: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]] }) })).toMatch(/^models\.d4\.hull: the points are flat/);
        const shifted = TETRA.map(([x, y, z]) => [x + 3, y, z]);
        expect(failing({ d4: d4Model({ hull: shifted }) })).toMatch(/^models\.d4\.hull: must surround the origin/);
    });

    it('needs exactly one face per value', () => {
        expect(failing({ d4: d4Model({ faces: d4Model().faces.slice(0, 3) }) })).toMatch(/^models\.d4\.faces: a d4 needs 4 faces/);
        const dup = d4Model().faces.map((f, i) => (i === 3 ? { ...f, value: 1 } : f));
        expect(failing({ d4: d4Model({ faces: dup }) })).toMatch(/^models\.d4\.faces\[3\]\.value: 1 appears twice/);
        const wrong = d4Model().faces.map((f, i) => (i === 3 ? { ...f, value: 5 } : f));
        expect(failing({ d4: d4Model({ faces: wrong }) })).toMatch(/^models\.d4\.faces\[3\]\.value: a d4 has values 1, 2, 3, 4/);
        const flat = d4Model().faces.map((f, i) => (i === 0 ? { ...f, up: [0, 0, 0] } : f));
        expect(failing({ d4: d4Model({ faces: flat }) })).toMatch(/^models\.d4\.faces\[0\]\.up: must be a non-zero/);
    });

    it('accepts a d10 with values 0 to 9', () => {
        const ups = Array.from({ length: 10 }, (_, i) => [Math.cos(i), Math.sin(i), i % 2 ? 1 : -1]);
        const set = validateSet({ ...base(), models: { d10: { src: 'x.glb', hull: TETRA, faces: ups.map((up, value) => ({ value, up })) } } });
        expect(set.models.d10.faces.map((f) => f.value)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('checks labels', () => {
        const label = d4Model().labels[0];
        expect(failing({ d4: d4Model({ labels: [{ ...label, value: 9 }] }) })).toMatch(/^models\.d4\.labels\[0\]\.value: a d4 has values/);
        expect(failing({ d4: d4Model({ labels: [{ ...label, size: 3 }] }) })).toMatch(/^models\.d4\.labels\[0\]\.size: must be between 0.05 and 2/);
        expect(failing({ d4: d4Model({ labels: [{ ...label, up: [0, 0, 1] }] }) })).toMatch(/^models\.d4\.labels\[0\]\.up: must not be parallel to the normal/);
    });

    it('checks the numeral override and the transform', () => {
        expect(failing({ d4: d4Model({ numeral: { color: 'red' } }) })).toMatch(/^models\.d4\.numeral\.color: must be a #rrggbb colour/);
        const ok = validateSet({ ...base(), models: { d4: d4Model({ numeral: { color: '#FFFFFF', outline: { color: '#4A0A0A' } } }) } });
        expect(ok.models.d4.numeral).toEqual({ color: '#FFFFFF', outline: { color: '#4A0A0A', width: 0.08 } });
        expect(failing({ d4: d4Model({ transform: { scale: 0 } }) })).toMatch(/^models\.d4\.transform\.scale: must be a positive number/);
        expect(failing({ d4: d4Model({ transform: { rotation: [0, 0, 0, 0] } }) })).toMatch(/^models\.d4\.transform\.rotation: must be a non-zero quaternion/);
    });
});

describe('liquid in a model', () => {
    const liquid = (patch = {}) => ({ color: '#B3122A', ...patch });
    const withLiquid = (l) => validateSet({ ...base(), models: { d4: d4Model({ liquid: l }) } }).models.d4.liquid;

    it('is optional, fills its defaults and is frozen', () => {
        expect(validateSet({ ...base(), models: { d4: d4Model() } }).models.d4.liquid).toBeNull();
        expect(withLiquid(null)).toBeNull();
        const l = withLiquid(liquid());
        expect(l).toEqual({
            color: '#B3122A', surfaceColor: shade('#B3122A', 0.35), glow: null, level: 0.6, thickness: 0.06,
            glass: { color: '#FFFFFF', opacity: 0.35, roughness: 0.08 }, neck: null, slosh: 1,
        });
        expect(Object.isFrozen(l)).toBe(true);
        expect(Object.isFrozen(l.glass)).toBe(true);
    });

    it('keeps what is given, one glass field at a time', () => {
        const l = withLiquid(liquid({
            surfaceColor: '#FF8A96', glow: { color: '#FF3B4E', intensity: 0.3 }, level: 0.5, thickness: 0.1,
            glass: { opacity: 0.5 }, neck: 0.83, slosh: 0,
        }));
        expect(l.surfaceColor).toBe('#FF8A96');
        expect(l.glow).toEqual({ color: '#FF3B4E', intensity: 0.3 });
        expect(l.level).toBe(0.5);
        expect(l.thickness).toBe(0.1);
        expect(l.glass).toEqual({ color: '#FFFFFF', opacity: 0.5, roughness: 0.08 });
        expect(l.neck).toBe(0.83);
        expect(l.slosh).toBe(0);
        expect(withLiquid(liquid({ glow: { color: '#FF3B4E' } })).glow.intensity).toBe(0.3);
    });

    it('names the field that is wrong', () => {
        const bad = (l) => failing({ d4: d4Model({ liquid: l }) });
        expect(bad('red')).toBe('models.d4.liquid: must be { color, surfaceColor, glow, level, thickness, glass, neck, slosh }');
        expect(bad({ level: 0.5 })).toBe('models.d4.liquid.color: must be a #rrggbb colour');
        expect(bad(liquid({ level: 0.96 }))).toBe('models.d4.liquid.level: must be a number between 0.05 and 0.95');
        expect(bad(liquid({ thickness: 0 }))).toBe('models.d4.liquid.thickness: must be a number between 0.01 and 0.3');
        expect(bad(liquid({ neck: 9 }))).toBe('models.d4.liquid.neck: must be a number between -5 and 5');
        expect(bad(liquid({ slosh: 3 }))).toBe('models.d4.liquid.slosh: must be a number between 0 and 2');
        expect(bad(liquid({ glass: 'clear' }))).toBe('models.d4.liquid.glass: must be { color, opacity, roughness }');
        expect(bad(liquid({ glass: { opacity: 1 } }))).toBe('models.d4.liquid.glass.opacity: must be a number between 0.05 and 0.95');
        expect(bad(liquid({ glow: { color: 'pink' } }))).toBe('models.d4.liquid.glow.color: must be a #rrggbb colour');
    });
});
