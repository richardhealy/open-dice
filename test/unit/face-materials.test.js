import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { setCanvasFactories } from '../../src/sets/canvas-factory.js';
import { buildFaceMaterials, materialCount, PLACEHOLDER_MATERIAL } from '../../src/sets/face-materials.js';
import { clearDiceSetCaches, cacheSize } from '../../src/sets/texture-cache.js';
import { _resetRegistryForTests } from '../../src/sets/index.js';
import { makeRecordingCanvas } from './helpers/canvas-stub.js';
import { GEM, INLAY, GLOW, NO_EDGE } from './helpers/sets.js';

function geometryWithGroups(count) {
    const g = new THREE.BufferGeometry();
    for (let i = 0; i < count; i++) g.addGroup(i * 3, 3, i);
    return g;
}
const FACES = [null, { text: '1' }, { text: '2' }];
const COLORS = { diceColor: 0xf0f0f0, textColor: '#FFFFFF', backgroundColor: '#e74c3c' };

describe('buildFaceMaterials', () => {
    let canvases, restore;
    beforeEach(() => {
        clearDiceSetCaches();
        _resetRegistryForTests();
        canvases = [];
        restore = setCanvasFactories({
            canvas: (size) => { const c = makeRecordingCanvas(size); canvases.push(c); return c; },
            path2D: (d) => ({ d }),
        });
    });
    afterEach(() => { restore(); vi.restoreAllMocks(); });

    it('materialCount is max group index + 1', () => {
        expect(materialCount(geometryWithGroups(21))).toBe(21);
    });

    it('classic: Phong materials with today\'s parameters, one canvas texture per slot', () => {
        const mats = buildFaceMaterials({ type: 'd6', geometry: geometryWithGroups(3), faces: FACES, colors: COLORS });
        expect(mats).toHaveLength(3);
        for (const m of mats) {
            expect(m).toBeInstanceOf(THREE.MeshPhongMaterial);
            expect(m.color.getHex()).toBe(0xf0f0f0);
            expect(m.specular.getHex()).toBe(0x172022);
            expect(m.shininess).toBe(40);
            expect(m.flatShading).toBe(true);
            expect(m.map).toBeInstanceOf(THREE.Texture);
            expect(m.map.generateMipmaps).toBe(true);
        }
        expect(canvases).toHaveLength(3);
    });

    it('classic: the d20 texture tuning is applied only when passed', () => {
        const tuned = buildFaceMaterials({ type: 'd20', geometry: geometryWithGroups(2), faces: [null, { text: '20' }], colors: COLORS,
            textureTuning: { flipY: true, generateMipmaps: false, linearFilter: true, clamp: true } });
        expect(tuned[1].map.generateMipmaps).toBe(false);
        expect(tuned[1].map.minFilter).toBe(THREE.LinearFilter);
        expect(tuned[1].map.wrapS).toBe(THREE.ClampToEdgeWrapping);
    });

    it('classic: d4 corner faces use the corner painter', () => {
        const mats = buildFaceMaterials({ type: 'd4', geometry: geometryWithGroups(3), faces: [null, null, { values: [2, 4, 3] }], colors: COLORS });
        // The two blank slots share one cached texture, so the corner canvas is the last one made.
        const corner = canvases.at(-1);
        expect(canvases).toHaveLength(2);
        expect(corner.calls.filter((c) => c.name === 'fillText').map((c) => c.args[0])).toEqual(['2', '4', '3']);
        expect(mats[2].map.image).toBe(corner);
    });

    it('invisible dice get one shared placeholder and paint nothing', () => {
        const mats = buildFaceMaterials({ type: 'd20', geometry: geometryWithGroups(21), faces: FACES, colors: COLORS, set: GEM, visible: false });
        expect(mats).toHaveLength(21);
        expect(new Set(mats).size).toBe(1);
        expect(mats[0]).toBe(PLACEHOLDER_MATERIAL);
        expect(mats[0]).toBeInstanceOf(THREE.MeshBasicMaterial);
        expect(canvases).toHaveLength(0);
    });

    it('gem set: gold edge at index 0, physical faces with albedo, MR and the shared normal map', () => {
        const mats = buildFaceMaterials({ type: 'd20', geometry: geometryWithGroups(3), faces: FACES, set: GEM });
        expect(mats[0]).toBeInstanceOf(THREE.MeshPhysicalMaterial);
        expect(mats[0].color.getHexString()).toBe('d4af37');
        expect(mats[0].metalness).toBe(1);
        for (const m of mats.slice(1)) {
            expect(m).toBeInstanceOf(THREE.MeshPhysicalMaterial);
            expect(m.map).toBeInstanceOf(THREE.Texture);
            expect(m.roughnessMap).toBeInstanceOf(THREE.Texture);
            expect(m.metalnessMap).toBe(m.roughnessMap);
            expect(m.normalMap).toBeInstanceOf(THREE.Texture);
            expect(m.emissiveMap).toBeNull();
            expect(m.emissive.getHexString()).toBe('ff2d55');
        }
        expect(mats[1].normalMap).toBe(mats[2].normalMap);
        expect(mats[1].map).not.toBe(mats[2].map);
    });

    it('inlay set: MR map, no normal map; glow set: emissive map and a texture normal map, no MR', () => {
        const inlay = buildFaceMaterials({ type: 'd6', geometry: geometryWithGroups(2), faces: [null, { text: '6' }], set: INLAY });
        expect(inlay[1].roughnessMap).toBeInstanceOf(THREE.Texture);
        expect(inlay[1].normalMap).toBeNull();
        expect(inlay[1].emissiveMap).toBeNull();
        const glow = buildFaceMaterials({ type: 'd6', geometry: geometryWithGroups(2), faces: [null, { text: '6' }], set: GLOW });
        expect(glow[1].emissiveMap).toBeInstanceOf(THREE.Texture);
        expect(glow[1].emissive.getHexString()).toBe('ffffff');
        expect(glow[1].emissiveIntensity).toBe(1.6);
        expect(glow[1].normalMap).toBeInstanceOf(THREE.Texture);
        expect(glow[1].roughnessMap).toBeNull();
        expect(glow[0].color.getHexString()).toBe('5c5f66');   // iron edge
    });

    it("edge 'none': index 0 is a body material over a blank face, not a metal", () => {
        const mats = buildFaceMaterials({ type: 'd8', geometry: geometryWithGroups(2), faces: [null, { text: '8' }], set: NO_EDGE });
        expect(mats[0]).toBeInstanceOf(THREE.MeshPhysicalMaterial);
        expect(mats[0].metalness).toBe(0);
        expect(mats[0].clearcoat).toBe(1);
        expect(mats[0].map).toBeInstanceOf(THREE.Texture);
    });

    it('the second build of the same faces reuses every texture', () => {
        const a = buildFaceMaterials({ type: 'd20', geometry: geometryWithGroups(3), faces: FACES, set: GEM });
        const painted = canvases.length;
        const size = cacheSize();
        const b = buildFaceMaterials({ type: 'd20', geometry: geometryWithGroups(3), faces: FACES, set: GEM });
        expect(canvases.length).toBe(painted);
        expect(cacheSize()).toBe(size);
        expect(b[1].map).toBe(a[1].map);
        expect(b[1].roughnessMap).toBe(a[1].roughnessMap);
        expect(b[1]).not.toBe(a[1]);   // materials are per die (effects mutate them)
    });

    it('an unknown set id renders classic and warns', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const mats = buildFaceMaterials({ type: 'd6', geometry: geometryWithGroups(2), faces: [null, { text: '3' }], colors: COLORS, set: 'not-a-set' });
        expect(mats[1]).toBeInstanceOf(THREE.MeshPhongMaterial);
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('repaints all maps of a face once a pending decal loads', async () => {
        let img = null;
        const registry = { get: () => img, load: () => { img = { width: 8, height: 8 }; return Promise.resolve(img); } };
        const mats = buildFaceMaterials({ type: 'd6', geometry: geometryWithGroups(2), faces: [null, { text: '1' }], set: INLAY,
            decals: { '1': { src: '/sword.svg' } }, decalRegistry: registry });
        const albedo = mats[1].map.image, mr = mats[1].roughnessMap.image;
        const before = albedo.calls.length;
        await new Promise((r) => setTimeout(r, 0));
        await new Promise((r) => setTimeout(r, 0));
        expect(albedo.calls.length).toBeGreaterThan(before);
        expect(albedo.calls.filter((c) => c.name === 'drawImage')).toHaveLength(1);
        expect(mr.calls.filter((c) => c.name === 'fillText').length).toBe(1);       // the first paint only; the repaint has no glyph
    });
});
