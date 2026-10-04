import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { setModelLoader, loadModel, loadedModel, loadSetModels, clearModelCache, isModelSettled, DEFAULT_MODEL_LOAD_TIMEOUT_MS } from '../../src/models/loader.js';

describe('model loader', () => {
    let warn;
    beforeEach(() => {
        clearModelCache();
        setModelLoader(null);
        warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => warn.mockRestore());

    it('resolves null and warns once per src without a loader', async () => {
        expect(await loadModel('a.glb')).toBeNull();
        expect(await loadModel('a.glb')).toBeNull();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toMatch(/a\.glb.*setModelLoader/);
    });

    it('loads once per src, accepting a scene or a { scene } result', async () => {
        const scene = new THREE.Group();
        const loader = vi.fn(async (src) => (src === 'a.glb' ? { scene } : scene));
        setModelLoader(loader);
        const [one, two] = await Promise.all([loadModel('a.glb'), loadModel('a.glb')]);
        expect(one).toBe(scene);
        expect(two).toBe(scene);
        expect(await loadModel('b.glb')).toBe(scene);
        expect(loader).toHaveBeenCalledTimes(2);
        expect(loadedModel('a.glb')).toBe(scene);
        expect(loadedModel('missing.glb')).toBeNull();
    });

    it('a failed load resolves null, warns once and is not retried until the cache is cleared', async () => {
        const loader = vi.fn(async () => { throw new Error('404'); });
        setModelLoader(loader);
        expect(await loadModel('x.glb')).toBeNull();
        expect(await loadModel('x.glb')).toBeNull();
        expect(loader).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toMatch(/x\.glb.*404/);
        clearModelCache();
        expect(await loadModel('x.glb')).toBeNull();
        expect(loader).toHaveBeenCalledTimes(2);
    });

    it('a load that never answers fails after the timeout, so a roll falls back instead of waiting forever', async () => {
        setModelLoader(() => new Promise(() => {}), { timeoutMs: 20 });
        const started = Date.now();
        expect(await loadModel('slow.glb')).toBeNull();
        expect(Date.now() - started).toBeLessThan(1000);
        expect(isModelSettled('slow.glb')).toBe(true);
        expect(warn.mock.calls[0][0]).toMatch(/slow\.glb.*timed out after 20 ms/);
        expect(DEFAULT_MODEL_LOAD_TIMEOUT_MS).toBe(20000);
    });

    it('rejects a loader result that is not an Object3D', async () => {
        setModelLoader(async () => ({ nope: true }));
        expect(await loadModel('y.glb')).toBeNull();
        expect(warn.mock.calls[0][0]).toMatch(/y\.glb.*no 3D object/);
    });

    it('loads every model a set uses, each src once', async () => {
        const loader = vi.fn(async () => new THREE.Group());
        setModelLoader(loader);
        const set = { id: 's', models: { d4: { src: 'p.glb' }, d6: { src: 'c.glb' }, d8: { src: 'p.glb' } } };
        await loadSetModels([set, { id: 'classic', models: null }, set]);
        expect(loader.mock.calls.map((c) => c[0]).sort()).toEqual(['c.glb', 'p.glb']);
        expect(loadedModel('c.glb')).not.toBeNull();
    });

    it('only accepts a function or null', () => {
        expect(() => setModelLoader('nope')).toThrow(TypeError);
        expect(() => setModelLoader(null)).not.toThrow();
    });
});

describe('model dice in the public API', () => {
    it('exports the model dice functions and constants', async () => {
        const lib = await import('../../src/index.js');
        for (const name of ['setModelLoader', 'clearModelCache', 'analyzeModelDie', 'testModelDie', 'remapModelValues', 'dieShape', 'shapeToGlb', 'dieMaterials']) {
            expect(typeof lib[name]).toBe('function');
        }
        expect(lib.MODEL_DIE_TYPES).toEqual(['d4', 'd6', 'd8', 'd10', 'd12', 'd20']);
        expect(lib.MODEL_DIE_VALUES.d4).toEqual([1, 2, 3, 4]);
    });

    it('prepareDiceSets loads the models of the sets it is given', async () => {
        const { prepareDiceSets } = await import('../../src/sets/prepare.js');
        const { validateSet } = await import('../../src/sets/validate.js');
        const { cubeDesign } = await import('./helpers/models.js');
        clearModelCache();
        const loader = vi.fn(async () => new THREE.Group());
        setModelLoader(loader);
        const set = validateSet(cubeDesign('m', 'm.glb'));
        await prepareDiceSets({ sets: [set], decalRegistry: { preload: async () => [] } });
        expect(loader).toHaveBeenCalledWith('m.glb');
        expect(loadedModel('m.glb')).not.toBeNull();
        setModelLoader(null);
    });
});
