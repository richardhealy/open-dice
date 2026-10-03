import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { setCanvasFactories } from '../../src/sets/canvas-factory.js';
import { buildFaceMaterials, materialCount, collectSetImages, blendNormalPixels, PLACEHOLDER_MATERIAL } from '../../src/sets/face-materials.js';
import { clearDiceSetCaches, cacheSize, setTextureAnisotropy } from '../../src/sets/texture-cache.js';
import { _resetRegistryForTests } from '../../src/sets/index.js';
import { _setNumeralFontReadyForTests } from '../../src/sets/fonts/numerals.js';
import { _clearPatternCacheForTests } from '../../src/sets/face-painter.js';
import { makeRecordingCanvas, callsNamed } from './helpers/canvas-stub.js';
import { GEM, INLAY, GLOW, NO_EDGE, CIRCUIT, VINES, EMBLEM, IMAGE, GLOW_ALL, BODY_IMAGE_SRC, DECOR_IMAGE_SRC, NORMAL_IMAGE_SRC } from './helpers/sets.js';
import { hexToRgb, scaleColor } from '../../src/sets/color.js';
import { getEmblem } from '../../src/sets/decor/emblems.js';

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
        _clearPatternCacheForTests();
        _setNumeralFontReadyForTests(true);
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
        const corner = canvases.at(-1);
        expect(canvases).toHaveLength(3);                                   // classic is never cached: one canvas per slot
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

    it('classic textures are per die, not cached (review I3: colour churn would pin them forever)', () => {
        const a = buildFaceMaterials({ type: 'd6', geometry: geometryWithGroups(2), faces: [null, { text: '1' }], colors: COLORS });
        const b = buildFaceMaterials({ type: 'd6', geometry: geometryWithGroups(2), faces: [null, { text: '1' }], colors: COLORS });
        expect(b[1].map).not.toBe(a[1].map);
        expect(cacheSize()).toBe(0);
    });

    it('set textures painted before the numeral font is ready are not reused once it is (review I2)', () => {
        _setNumeralFontReadyForTests(false);
        const early = buildFaceMaterials({ type: 'd6', geometry: geometryWithGroups(2), faces: [null, { text: '6' }], set: INLAY });
        _setNumeralFontReadyForTests(true);
        const late = buildFaceMaterials({ type: 'd6', geometry: geometryWithGroups(2), faces: [null, { text: '6' }], set: INLAY });
        expect(late[1].map).not.toBe(early[1].map);
        const again = buildFaceMaterials({ type: 'd6', geometry: geometryWithGroups(2), faces: [null, { text: '6' }], set: INLAY });
        expect(again[1].map).toBe(late[1].map);
    });

    it('the body pattern is computed once per set and die type, not once per face (review I4)', () => {
        buildFaceMaterials({ type: 'd20', geometry: geometryWithGroups(4), faces: [null, { text: '1' }, { text: '2' }, { text: '3' }], set: GEM });
        const patternPaints = canvases.filter((c) => c.calls.some((x) => x.name === 'putImageData') && !c.calls.some((x) => x.name === 'fillText'));
        // one pattern canvas (putImageData, no text) + one normal map canvas; every face draws the pattern with drawImage
        expect(patternPaints).toHaveLength(2);
        const faceCanvases = canvases.filter((c) => c.calls.some((x) => x.name === 'fillText'));
        for (const c of faceCanvases) {
            expect(c.calls.filter((x) => x.name === 'putImageData')).toHaveLength(0);
            expect(c.calls.filter((x) => x.name === 'drawImage').length).toBeGreaterThanOrEqual(1);
        }
    });

    it('set textures take the configured anisotropy; classic textures are untouched', () => {
        setTextureAnisotropy(8);
        const mats = buildFaceMaterials({ type: 'd20', geometry: geometryWithGroups(3), faces: FACES, set: GEM });
        expect(mats[1].map.anisotropy).toBe(8);
        expect(mats[1].roughnessMap.anisotropy).toBe(8);
        expect(mats[1].normalMap.anisotropy).toBe(8);
        const classic = buildFaceMaterials({ type: 'd20', geometry: geometryWithGroups(2), faces: [null, { text: '1' }], colors: COLORS });
        expect(classic[1].map.anisotropy).toBe(1);
        setTextureAnisotropy(1);
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
        expect(albedo.calls.filter((c) => c.name === 'drawImage' && c.args[0] === img)).toHaveLength(1);   // the icon, once
        expect(mr.calls.filter((c) => c.name === 'fillText').length).toBe(1);       // the first paint only; the repaint has no glyph
    });
});

describe('buildFaceMaterials: map modes, images and shared emissive intensity', () => {
    let canvases, restore;
    beforeEach(() => {
        clearDiceSetCaches();
        _clearPatternCacheForTests();
        _setNumeralFontReadyForTests(true);
        _resetRegistryForTests();
        canvases = [];
        restore = setCanvasFactories({
            canvas: (size) => { const c = makeRecordingCanvas(size); canvases.push(c); return c; },
            path2D: (d) => ({ d }),
        });
    });
    afterEach(() => { restore(); vi.restoreAllMocks(); });

    const flush = async () => { await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0)); };
    const build = (set, type = 'd20', faces = FACES, decalRegistry = null) =>
        buildFaceMaterials({ type, geometry: geometryWithGroups(faces.length), faces, set, decalRegistry });
    const drawn = (canvas) => callsNamed(canvas, 'drawImage').map((d) => d.args[0]);
    /** A registry whose images exist only after load() was called for them, one tick later. */
    function lateRegistry(images) {
        const loaded = {};
        return {
            get: (src) => loaded[src],
            load: (src) => Promise.resolve().then(() => { if (images[src]) loaded[src] = images[src]; return loaded[src] || null; }),
        };
    }
    const EMPTY = { get: () => undefined, load: () => Promise.resolve(null) };
    const flatNumerals = (set) => ({ ...set.numeral, style: 'flat', glow: null });

    it('collectSetImages lists the body, normal and decoration image sources once each, in that order', () => {
        expect(collectSetImages(GEM)).toEqual([]);
        expect(collectSetImages(IMAGE)).toEqual([BODY_IMAGE_SRC, DECOR_IMAGE_SRC]);
        const set = {
            ...IMAGE, body: { ...IMAGE.body, normalImage: { src: NORMAL_IMAGE_SRC } },
            decor: [
                { art: null, image: { src: BODY_IMAGE_SRC }, metal: 'gold', color: null, relief: 0.6, scale: 1, glow: 0 },
                { art: 'frame', image: null, metal: 'gold', color: null, relief: 0.6, scale: 1, glow: 0 },
                { art: null, image: { src: DECOR_IMAGE_SRC }, metal: null, color: '#ffffff', relief: 0.6, scale: 1, glow: 0 },
            ],
        };
        expect(collectSetImages(set)).toEqual([BODY_IMAGE_SRC, NORMAL_IMAGE_SRC, DECOR_IMAGE_SRC]);
        // A hand-built set may still carry one decor object rather than an array.
        expect(collectSetImages({ ...GEM, decor: { art: null, image: { src: DECOR_IMAGE_SRC }, metal: 'gold' } })).toEqual([DECOR_IMAGE_SRC]);
    });

    it('an MR map exists for inlay numerals, a metal decor layer, a metal image layer or a metal emblem, and not otherwise', () => {
        const mr = (set) => build(set)[1].roughnessMap;
        expect(mr(INLAY)).toBeInstanceOf(THREE.Texture);                                                  // inlay numerals
        expect(mr(GEM)).toBeInstanceOf(THREE.Texture);                                                    // gold filigree
        expect(mr({ ...GEM, id: 'plain', decor: null })).toBeNull();                                      // engraved, nothing metal
        expect(mr(VINES)).toBeNull();                                                                      // colour decor is dielectric
        expect(mr({ ...GEM, id: 'gold-emblem', decor: null, emblems: EMBLEM.emblems })).toBeInstanceOf(THREE.Texture);   // gold sunburst
        expect(mr({ ...GEM, id: 'flat-emblem', decor: null, emblems: { '1': 'skull' } })).toBeNull();      // numeral-coloured emblem
        const goldImage = { ...IMAGE, id: 'gold-image', numeral: GEM.numeral };
        expect(mr(goldImage)).toBeInstanceOf(THREE.Texture);                                              // an image layer painted as gold
        const tintedImage = { ...goldImage, id: 'tinted-image', decor: [{ ...IMAGE.decor[0], metal: null, color: '#ffffff' }] };
        expect(mr(tintedImage)).toBeNull();
    });

    it('an emissive map exists for glow numerals, a body emissive, a glow decor layer or a glow emblem, and not otherwise', () => {
        const face = (set) => build(set)[1];
        expect(face(GLOW).emissiveMap).toBeInstanceOf(THREE.Texture);
        expect(face(GEM).emissiveMap).toBeNull();
        const bodyOnly = { ...CIRCUIT, id: 'body-only', numeral: flatNumerals(CIRCUIT) };
        expect(face(bodyOnly).emissiveMap).toBeInstanceOf(THREE.Texture);
        expect(face(bodyOnly).emissiveIntensity).toBe(0.35);
        const decorOnly = { ...VINES, id: 'decor-only', numeral: flatNumerals(VINES) };
        expect(face(decorOnly).emissiveMap).toBeInstanceOf(THREE.Texture);
        expect(face(decorOnly).emissiveIntensity).toBe(0.6);
        const emblemOnly = { ...GEM, id: 'emblem-only', decor: null,
            emblems: { '20': { art: 'sunburst', metal: null, color: '#FFFFFF', scale: 0.9, relief: 0.5, glow: 0.8 } } };
        expect(face(emblemOnly).emissiveMap).toBeInstanceOf(THREE.Texture);
        expect(face(emblemOnly).emissiveIntensity).toBe(0.8);
        const dull = { ...VINES, id: 'dull', numeral: flatNumerals(VINES), decor: [{ ...VINES.decor[0], glow: 0 }] };
        expect(face(dull).emissiveMap).toBeNull();
        expect(face(dull).roughnessMap).toBeNull();
    });

    it('glow numerals, a glowing body and glowing decor share one intensity: the brightest at full, the others scaled (Review Focus 5)', () => {
        const m = build(GLOW_ALL, 'd20', [null, { text: '7' }])[1];
        expect(m.emissiveIntensity).toBe(1.6);
        expect(m.emissive.getHexString()).toBe('ffffff');
        const em = m.emissiveMap.image;
        const fills = callsNamed(em, 'set:fillStyle').map((c) => c.args[0]);
        expect(fills[0]).toBe('#000000');                                                                 // starts black
        // Body: the circuit mask drawn in the emissive colour at 0.35 / 1.6 (about 0.22).
        const mask = drawn(em)[0];
        expect(canvases).toContain(mask);
        const lit = hexToRgb(scaleColor('#3CFF78', 0.35 / 1.6));
        const data = callsNamed(mask, 'putImageData')[0].args[0].data;
        let on = 0;
        for (let i = 0; i < data.length; i += 4) if (data[i] === lit[0] && data[i + 1] === lit[1] && data[i + 2] === lit[2]) on++;
        expect(on).toBeGreaterThan(0);
        // Decor: the vines stroked at 0.6 / 1.6 = 0.375.
        expect(callsNamed(em, 'set:strokeStyle').map((c) => c.args[0])).toContain(scaleColor('#CDEFEB', 0.6 / 1.6));
        // Numerals: the brightest layer, so painted in the exact colour the set declares.
        expect(fills.at(-1)).toBe('#3CFF78');
        expect(callsNamed(em, 'fillText').map((c) => c.args[0])).toEqual(['7']);
        // Nothing is clipped to black.
        expect(lit.every((c) => c > 0)).toBe(true);
        expect(hexToRgb(scaleColor('#CDEFEB', 0.6 / 1.6)).every((c) => c > 0)).toBe(true);
    });

    it('faces painted before the set\'s images arrive are repainted on arrival and never reused afterwards (img:<n>)', async () => {
        const body = { width: 256, height: 256 }, decor = { width: 256, height: 256 };
        const registry = lateRegistry({ [BODY_IMAGE_SRC]: body, [DECOR_IMAGE_SRC]: decor });
        const early = build(IMAGE, 'd6', [null, { text: '6' }], registry);
        const albedo = early[1].map.image, mr = early[1].roughnessMap.image;
        expect(drawn(albedo)).not.toContain(body);                                                        // the marble fallback
        expect(drawn(mr)).toHaveLength(0);
        expect(early[1].map.version).toBe(1);
        await flush();
        expect(drawn(albedo)).toContain(body);                                                            // repainted with the image
        expect(drawn(mr).length).toBeGreaterThan(0);                                                      // the gold alpha fill
        expect(early[1].map.version).toBe(2);
        expect(early[1].roughnessMap.version).toBe(2);
        const late = build(IMAGE, 'd6', [null, { text: '6' }], registry);
        expect(late[1].map).not.toBe(early[1].map);
        expect(late[1].roughnessMap).not.toBe(early[1].roughnessMap);
        expect(drawn(late[1].map.image)).toContain(body);
        const again = build(IMAGE, 'd6', [null, { text: '6' }], registry);
        expect(again[1].map).toBe(late[1].map);
    });

    it('a set with images and no registry paints its fallback, schedules nothing and never throws (Review Focus 3)', async () => {
        const mats = build(IMAGE, 'd6', [null, { text: '6' }]);
        const albedo = mats[1].map.image;
        const base = drawn(albedo)[0];
        expect(canvases).toContain(base);                                                                 // the marble pattern canvas
        expect(callsNamed(base, 'putImageData')).toHaveLength(1);
        const before = canvases.map((c) => c.calls.length);
        await flush();
        expect(canvases.map((c) => c.calls.length)).toEqual(before);
        expect(mats[1].map.version).toBe(1);
    });

    it('blendNormalPixels adds the generated slopes to the image normals and multiplies their depth', () => {
        const base = new Uint8ClampedArray([128, 128, 255, 255, 140, 120, 250, 255, 250, 10, 255, 255]);
        const relief = new Uint8ClampedArray([160, 100, 250, 255, 128, 128, 255, 255, 200, 50, 128, 255]);
        blendNormalPixels(base, relief);
        expect([...base]).toEqual([160, 100, 250, 255, 140, 120, 250, 255, 255, 0, 128, 255]);
    });

    it('a loaded normal image is the normal-map base with the generated relief blended over it, keyed by images loaded', () => {
        const img = { width: 512, height: 256 };
        const registry = { get: (src) => (src === NORMAL_IMAGE_SRC ? img : undefined), load: () => Promise.resolve(img) };
        const set = { ...GEM, id: 'normal-image', body: { ...GEM.body, normalImage: { src: NORMAL_IMAGE_SRC } } };
        const mats = build(set, 'd20', FACES, registry);
        const normal = mats[1].normalMap.image;
        expect(callsNamed(normal, 'drawImage')[0].args).toEqual([img, 128, 0, 256, 256, 0, 0, 256, 256]);  // centre crop, cover
        const n = normal.calls.map((c) => c.name);
        expect(n.indexOf('getImageData')).toBeGreaterThan(n.indexOf('drawImage'));
        expect(n.indexOf('putImageData')).toBeGreaterThan(n.indexOf('getImageData'));
        expect(mats[2].normalMap).toBe(mats[1].normalMap);
        // Before the image arrives the generated relief stands alone, under another key.
        const before = build(set, 'd20', FACES, EMPTY);
        expect(before[1].normalMap).not.toBe(mats[1].normalMap);
        expect(drawn(before[1].normalMap.image)).toHaveLength(0);
        // A normal image alone is still a normal map; without the image and without relief there is none.
        const bare = { ...set, id: 'normal-image-bare', decor: null, body: { ...set.body, normalStrength: 0 } };
        const alone = build(bare, 'd20', FACES, registry)[1].normalMap;
        expect(alone).toBeInstanceOf(THREE.Texture);
        expect(drawn(alone.image)[0]).toBe(img);
        expect(callsNamed(alone.image, 'getImageData')).toHaveLength(0);
        expect(build(bare, 'd20', FACES, EMPTY)[1].normalMap).toBeNull();
    });

    it('a pending normal image repaints the shared normal canvas when it arrives', async () => {
        const img = { width: 256, height: 256 };
        const registry = lateRegistry({ [NORMAL_IMAGE_SRC]: img });
        const set = { ...GEM, id: 'normal-late', body: { ...GEM.body, normalImage: { src: NORMAL_IMAGE_SRC } } };
        const mats = build(set, 'd20', FACES, registry);
        const normal = mats[1].normalMap;
        expect(drawn(normal.image)).toHaveLength(0);
        expect(normal.version).toBe(1);
        await flush();
        expect(drawn(normal.image)[0]).toBe(img);
        expect(normal.version).toBe(2);
        const late = build(set, 'd20', FACES, registry);
        expect(late[1].normalMap).not.toBe(normal);
    });

    it('a normal image is requested even when nothing generated paints a map, and is the normal map on the next build', async () => {
        // A designer texture: a body image with its own normal map, no decoration and no pattern
        // relief, so before the image arrives there is no normal map at all to hang a repaint on.
        const img = { width: 256, height: 256 }, body = { width: 256, height: 256 };
        const registry = lateRegistry({ [NORMAL_IMAGE_SRC]: img, [BODY_IMAGE_SRC]: body });
        const requested = [];
        const load = registry.load;
        registry.load = (src) => { requested.push(src); return load(src); };
        const set = { ...IMAGE, id: 'image-normal-only', decor: null, body: { ...IMAGE.body, normalImage: { src: NORMAL_IMAGE_SRC } } };
        const first = build(set, 'd6', [null, { text: '6' }], registry);
        expect(first[1].normalMap).toBeNull();
        expect(requested).toContain(BODY_IMAGE_SRC);
        expect(requested).toContain(NORMAL_IMAGE_SRC);
        await flush();
        const second = build(set, 'd6', [null, { text: '6' }], registry);
        expect(second[1].normalMap).toBeInstanceOf(THREE.Texture);
        expect(drawn(second[1].normalMap.image)[0]).toBe(img);                                           // the image is the base
        expect(callsNamed(second[1].normalMap.image, 'getImageData')).toHaveLength(0);                   // nothing generated to blend over it
        expect(drawn(second[1].map.image)).toContain(body);
        expect(build(set, 'd6', [null, { text: '6' }], registry)[1].normalMap).toBe(second[1].normalMap);
    });

    it('the normal map takes a loaded decoration image\'s alpha as relief, and a late one repaints it on arrival (final review)', async () => {
        const img = { width: 256, height: 256 };
        const set = { ...IMAGE, id: 'image-relief', body: { ...IMAGE.body, image: null } };
        const whiteFills = () => canvases.filter((c) => callsNamed(c, 'set:fillStyle')[0]?.args[0] === '#ffffff' && drawn(c).includes(img));
        const ready = { get: (src) => (src === DECOR_IMAGE_SRC ? img : undefined), load: () => Promise.resolve(img) };
        const mats = build(set, 'd6', [null, { text: '6' }], ready);
        expect(mats[1].normalMap).toBeInstanceOf(THREE.Texture);
        expect(whiteFills()).toHaveLength(1);                                                             // the alpha, white: 0.6 is the strongest relief
        const height = canvases.find((c) => drawn(c).includes(whiteFills()[0]));
        expect(callsNamed(height, 'getImageData')).toHaveLength(1);
        // Late: the first map has no relief from the image; when it lands the shared canvas is repainted in place.
        clearDiceSetCaches();
        _clearPatternCacheForTests();
        canvases = [];
        const late = lateRegistry({ [DECOR_IMAGE_SRC]: img });
        const early = build(set, 'd6', [null, { text: '6' }], late);
        const normal = early[1].normalMap;
        expect(normal.version).toBe(1);
        expect(whiteFills()).toHaveLength(0);
        await flush();
        expect(whiteFills()).toHaveLength(1);
        expect(normal.version).toBe(2);
        expect(callsNamed(normal.image, 'putImageData')).toHaveLength(2);                                // painted twice, into the same canvas
        expect(build(set, 'd6', [null, { text: '6' }], late)[1].normalMap).not.toBe(normal);             // img:1 keys a fresh texture
    });

    it('a face that carries an emblem gets its own normal map with the emblem\'s relief; the other faces share the set\'s (final review)', () => {
        const faces = [null, { text: '20' }, { text: '7' }, { text: '1' }];
        const [, twenty, seven, one] = build(EMBLEM, 'd20', faces);
        for (const m of [twenty, seven, one]) expect(m.normalMap).toBeInstanceOf(THREE.Texture);
        expect(twenty.normalMap).not.toBe(seven.normalMap);
        expect(one.normalMap).not.toBe(seven.normalMap);
        expect(twenty.normalMap).not.toBe(one.normalMap);
        // The height maps behind them: the shared one holds the filigree alone (6 fills); the 1 adds the
        // skull (2); the 20 adds the sunburst, white at 0.5 against the decor's 0.6.
        const sun = getEmblem('sunburst').length;
        const heights = canvases.filter((c) => callsNamed(c, 'getImageData').length === 1);
        expect(heights.map((c) => callsNamed(c, 'fill').length).sort((a, b) => a - b)).toEqual([6, 8, 6 + sun]);
        const raised = heights.find((c) => callsNamed(c, 'fill').length === 6 + sun);
        expect(callsNamed(raised, 'set:fillStyle').at(-1).args[0]).toBe(scaleColor('#ffffff', 0.5 / 0.6));
        // Cached per face; a secret face and the d100 pair use the shared map; a d4 face is keyed by its corners.
        const again = build(EMBLEM, 'd20', faces);
        expect(again[1].normalMap).toBe(twenty.normalMap);
        expect(again[2].normalMap).toBe(seven.normalMap);
        const secret = buildFaceMaterials({ type: 'd20', geometry: geometryWithGroups(2), faces: [null, { text: '20' }], set: EMBLEM, isSecret: true });
        expect(secret[1].normalMap).toBe(seven.normalMap);
        const tens = build(EMBLEM, 'd100', [null, { text: '20' }, { text: '90' }]);
        expect(tens[1].normalMap).toBe(tens[2].normalMap);
        const d4 = build(EMBLEM, 'd4', [null, { values: [1, 2, 3] }, { values: [2, 3, 4] }]);
        expect(d4[1].normalMap).not.toBe(d4[2].normalMap);
    });

    it('a failed image warns once per source and leaves the fallback', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const registry = { get: () => undefined, load: (src) => Promise.reject(new Error(`nope ${src}`)) };
        const first = build(IMAGE, 'd6', [null, { text: '6' }], registry);
        build(IMAGE, 'd6', [null, { text: '5' }], registry);
        await flush();
        const messages = warn.mock.calls.map((c) => String(c[0]));
        expect(messages.filter((m) => m.includes(BODY_IMAGE_SRC))).toHaveLength(1);
        expect(messages.filter((m) => m.includes(DECOR_IMAGE_SRC))).toHaveLength(1);
        expect(first[1].map.version).toBe(1);
    });
});
