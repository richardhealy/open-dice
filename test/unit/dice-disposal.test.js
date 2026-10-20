import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { ClassicTextureCache } from '../../src/classic-textures.js';
import { createDie, dieMaterials } from '../../src/dice.js';
import { PLACEHOLDER_MATERIAL } from '../../src/sets/face-materials.js';
import { registerDiceSet, _resetRegistryForTests } from '../../src/sets/index.js';
import { setCanvasFactories } from '../../src/sets/canvas-factory.js';
import { clearDiceSetCaches } from '../../src/sets/texture-cache.js';
import { setModelLoader, loadModel, clearModelCache } from '../../src/models/loader.js';
import { modelTemplate } from '../../src/models/model-die.js';
import { makeRecordingCanvas } from './helpers/canvas-stub.js';
import { cubeDesign, boxScene } from './helpers/models.js';
import { GEM } from './helpers/sets.js';
import { headlessRoller } from './helpers/roller.js';

/**
 * D2: classic dice used to paint a texture per face per die and nothing was ever disposed, so
 * GPU memory grew with every roll. Classic faces now come from a reference-counted cache per
 * roller, each die type has one geometry, and a die's own materials are disposed when it leaves.
 */

const TYPES = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];
const ALL = TYPES.map((dice) => ({ dice }));

/** Predict and spawn a batch on a headless roller, as roll() does (no frames needed). */
async function spawn(r, config) {
    const prediction = await r._predict(config);
    return r._spawnBatch(config, 'main', prediction, () => {});
}

const textures = (dice) => new Set(dice.flatMap((d) => dieMaterials(d).map((m) => m.map).filter(Boolean)));

describe('ClassicTextureCache', () => {
    it('shares one texture per key and disposes it when the last holder lets go', () => {
        const cache = new ClassicTextureCache();
        const create = vi.fn(() => new THREE.Texture());
        const a = cache.acquire('k', create);
        const b = cache.acquire('k', create);
        expect(a).toBe(b);
        expect(create).toHaveBeenCalledTimes(1);
        const dispose = vi.spyOn(a, 'dispose');
        cache.release(a);
        expect(dispose).not.toHaveBeenCalled();
        cache.release(b);
        expect(dispose).toHaveBeenCalledTimes(1);
        expect(cache.size).toBe(0);
        // Released again, or a texture it never handed out: ignored.
        cache.release(a);
        const foreign = new THREE.Texture();
        const foreignDispose = vi.spyOn(foreign, 'dispose');
        cache.release(foreign);
        expect(foreignDispose).not.toHaveBeenCalled();
        expect(dispose).toHaveBeenCalledTimes(1);
    });
});

describe('classic faces from the cache look exactly as before', () => {
    let restore;
    beforeEach(() => { restore = setCanvasFactories({ canvas: (size) => makeRecordingCanvas(size) }); });
    afterEach(() => restore());

    it('paints every face of every type with the same canvas calls and texture flags as an uncached die', () => {
        for (const type of TYPES) {
            for (const isFirst of type === 'd100' ? [true, false] : [true]) {
                const args = [type, true, isFirst, 7, 2, null, null, null, 0x123456, '#ABCDEF', '#102030', false, null, null];
                const plain = createDie(...args, {});
                const cached = createDie(...args, { classicTextures: new ClassicTextureCache() });
                const a = dieMaterials(plain), b = dieMaterials(cached);
                expect(b.length).toBe(a.length);
                a.forEach((m, i) => {
                    expect(b[i].map.image.calls).toEqual(m.map.image.calls);
                    for (const flag of ['flipY', 'generateMipmaps', 'minFilter', 'magFilter', 'wrapS', 'wrapT']) expect(b[i].map[flag]).toBe(m.map[flag]);
                    expect(b[i].color.getHex()).toBe(m.color.getHex());
                });
                expect(cached.mesh.geometry).toBe(plain.mesh.geometry);   // one geometry per type
            }
        }
    });

    it('gives faces that differ in numeral, colour, secrecy or decal their own textures, and shares the rest', () => {
        const cache = new ClassicTextureCache();
        const make = (over = {}) => {
            const o = { text: '#FFFFFF', bg: '#e74c3c', secret: false, decals: null, color: 0xf0f0f0, ...over };
            return createDie('d6', true, true, undefined, undefined, null, null, null, o.color, o.text, o.bg, o.secret, o.decals, null, { classicTextures: cache });
        };
        const base = textures([make()]);
        expect([...textures([make({ color: 0x00ff00 })])]).toEqual([...base]);   // body colour lives in the material
        for (const over of [{ text: '#000000' }, { bg: '#000000' }, { secret: true }, { decals: { 3: { src: 'x.svg' } } }]) {
            const other = textures([make(over)]);
            expect([...other].some((t) => !base.has(t))).toBe(true);
        }
    });

    it('createDie without a cache still paints each die its own textures', () => {
        const a = createDie('d6', true, true);
        const b = createDie('d6', true, true);
        expect([...textures([a])].some((t) => textures([b]).has(t))).toBe(false);
    });
});

describe('the roller frees what dice own and keeps what they share', () => {
    let restore;
    beforeEach(() => {
        restore = setCanvasFactories({ canvas: (size) => makeRecordingCanvas(size), path2D: (d) => ({ d }) });
        clearDiceSetCaches();
        _resetRegistryForTests();
    });
    afterEach(() => { restore(); vi.restoreAllMocks(); });

    it('a repeated classic roll reuses every face texture and disposes the old dice\'s materials', async () => {
        const r = headlessRoller();
        const first = (await spawn(r, ALL)).dice;
        const firstTextures = textures(first);
        const firstMaterials = first.flatMap(dieMaterials);
        const materialDispose = firstMaterials.map((m) => vi.spyOn(m, 'dispose'));
        const textureDispose = [...firstTextures].map((t) => vi.spyOn(t, 'dispose'));
        const geometryDispose = first.map((d) => vi.spyOn(d.mesh.geometry, 'dispose'));
        r._clearDice();
        expect(materialDispose.every((s) => s.mock.calls.length === 1)).toBe(true);
        const second = (await spawn(r, ALL)).dice;
        expect(textures(second)).toEqual(firstTextures);
        expect(textureDispose.every((s) => s.mock.calls.length === 0)).toBe(true);
        expect(geometryDispose.every((s) => s.mock.calls.length === 0)).toBe(true);
        expect(second.map((d) => d.mesh.geometry)).toEqual(first.map((d) => d.mesh.geometry));
    });

    it('textures no die holds any more are disposed once the next batch is built', async () => {
        const r = headlessRoller();
        const first = (await spawn(r, [{ dice: 'd20', textColor: '#000000' }])).dice;
        const old = [...textures(first)];
        const disposed = old.map((t) => vi.spyOn(t, 'dispose'));
        r._clearDice();
        expect(disposed.some((s) => s.mock.calls.length > 0)).toBe(false);   // kept for the next batch
        await spawn(r, [{ dice: 'd20', textColor: '#FFFFFF' }]);
        expect(disposed.every((s) => s.mock.calls.length === 1)).toBe(true);
        expect(r._classicTextures.size).toBe(textures(r.dice).size);
    });

    it('many rolls keep the cache at what the table shows', async () => {
        const r = headlessRoller();
        const colours = ['#111111', '#222222', '#333333'];
        for (let i = 0; i < 12; i++) {
            r._clearDice();
            await spawn(r, ALL.map((d) => ({ ...d, backgroundColor: colours[i % 3] })));
            expect(r._classicTextures.size).toBe(textures(r.dice).size);
        }
    });

    it('a design die: its materials go, the design\'s cached textures stay', async () => {
        registerDiceSet({ ...GEM, id: 'gem-test' });
        const r = headlessRoller();
        const dice = (await spawn(r, [{ dice: 'd20', set: 'gem-test' }, { dice: 'd6', set: 'gem-test' }])).dice;
        const materials = dice.flatMap(dieMaterials);
        const maps = new Set(materials.flatMap((m) => [m.map, m.normalMap, m.roughnessMap, m.emissiveMap]).filter(Boolean));
        expect(maps.size).toBeGreaterThan(0);
        const materialDispose = materials.map((m) => vi.spyOn(m, 'dispose'));
        const textureDispose = [...maps].map((t) => vi.spyOn(t, 'dispose'));
        r._clearDice();
        await spawn(r, [{ dice: 'd6' }]);
        expect(materialDispose.every((s) => s.mock.calls.length === 1)).toBe(true);
        expect(textureDispose.every((s) => s.mock.calls.length === 0)).toBe(true);
    });

    it('a model die: its cloned and label materials go, the model\'s geometry and textures stay', async () => {
        clearModelCache();
        registerDiceSet(cubeDesign());
        const scene = boxScene();
        const tex = new THREE.Texture();
        scene.children[0].material.map = tex;
        setModelLoader(async () => scene);
        await loadModel('cube.glb');
        try {
            const r = headlessRoller();
            const [die] = (await spawn(r, [{ dice: 'd6', set: 'cube-design' }])).dice;
            expect(die.model).toBeTruthy();
            const materials = dieMaterials(die);
            const template = modelTemplate(die.model);
            const templateMaterials = [];
            const geometries = [];
            template.traverse((o) => { if (o.material) templateMaterials.push(o.material); if (o.geometry) geometries.push(o.geometry); });
            die.mesh.traverse((o) => { if (o.geometry) geometries.push(o.geometry); });
            const keep = [...templateMaterials, ...geometries, tex].map((x) => vi.spyOn(x, 'dispose'));
            const gone = materials.map((m) => vi.spyOn(m, 'dispose'));
            r._clearDice();
            expect(gone.every((s) => s.mock.calls.length === 1)).toBe(true);
            expect(keep.every((s) => s.mock.calls.length === 0)).toBe(true);
            expect(materials.some((m) => templateMaterials.includes(m))).toBe(false);
        } finally {
            setModelLoader(null);
            clearModelCache();
        }
    });

    it('prediction dice share the placeholder material, which is never disposed', async () => {
        const dispose = vi.spyOn(PLACEHOLDER_MATERIAL, 'dispose');
        const r = headlessRoller();
        await spawn(r, ALL);
        r._clearDice();
        await spawn(r, ALL);
        expect(dispose).not.toHaveBeenCalled();
    });

    it('reset() disposes the faded dice\'s materials once the fade is over', async () => {
        const frames = [];
        vi.stubGlobal('requestAnimationFrame', (cb) => { frames.push(cb); return frames.length; });
        const now = vi.spyOn(performance, 'now').mockReturnValue(0);
        try {
            const r = headlessRoller({ renderer: { render() {} }, isAnimating: true, floor: null });
            r._ensureAnimating = () => {};
            const dice = (await spawn(r, [{ dice: 'd8' }])).dice;
            const gone = dice.flatMap(dieMaterials).map((m) => vi.spyOn(m, 'dispose'));
            const done = r.reset();
            expect(gone.some((s) => s.mock.calls.length > 0)).toBe(false);   // still fading
            now.mockReturnValue(600);
            frames.shift()();
            await done;
            expect(gone.every((s) => s.mock.calls.length === 1)).toBe(true);
        } finally { vi.unstubAllGlobals(); }
    });
});
