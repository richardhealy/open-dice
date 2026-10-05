import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { validateSet } from '../../src/sets/validate.js';
import { setCanvasFactories } from '../../src/sets/canvas-factory.js';
import { clearDiceSetCaches } from '../../src/sets/texture-cache.js';
import { makeRecordingCanvas, callsNamed } from './helpers/canvas-stub.js';
import { setModelLoader, loadModel, clearModelCache } from '../../src/models/loader.js';
import { createModelDie, modelDieValue, modelTemplate } from '../../src/models/model-die.js';
import { createDie, getDieValue, dieMaterials } from '../../src/dice.js';
import { cubeDesign, boxScene, CUBE_UPS, liquidCubeDesign, flaskScene } from './helpers/models.js';
import { labelGeometry } from '../../src/models/labels.js';

const UP = new THREE.Vector3(0, 1, 0);
/** Turn a die so the face with this up vector points up. */
function restOn(die, faceUp) {
    die.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(...faceUp), UP);
    die.body.quaternion.set(die.mesh.quaternion.x, die.mesh.quaternion.y, die.mesh.quaternion.z, die.mesh.quaternion.w);
}
const labelTexts = (die, canvases) => die.mesh.children
    .filter((c) => c.userData.label)
    .map((m) => callsNamed(m.material.map.image, 'fillText')[0].args[0]);

describe('model dice', () => {
    let set, scene, restore, canvases;
    beforeEach(async () => {
        canvases = [];
        restore = setCanvasFactories({ canvas: (size) => { const c = makeRecordingCanvas(size); canvases.push(c); return c; } });
        clearDiceSetCaches();
        clearModelCache();
        set = validateSet(cubeDesign());
        scene = boxScene();
        setModelLoader(async () => scene);
        await loadModel('cube.glb');
    });
    afterEach(() => { restore(); setModelLoader(null); });

    it('builds its body from the hull and its look from a per-die clone of the model', () => {
        const material = new CANNON.Material('dice');
        const die = createModelDie({ type: 'd6', model: set.models.d6, set, visible: true, material });
        expect(die.body.shapes[0]).toBeInstanceOf(CANNON.ConvexPolyhedron);
        expect(die.body.shapes[0].faces).toHaveLength(6);
        expect(die.body.mass).toBe(1);
        expect(die.body.material).toBe(material);
        const meshes = [];
        die.mesh.traverse((o) => { if (o.isMesh && !o.userData.label) meshes.push(o); });
        expect(meshes).toHaveLength(1);
        expect(meshes[0].geometry).toBe(scene.children[0].geometry);      // geometry shared
        expect(meshes[0].material).not.toBe(scene.children[0].material);  // material per die
        expect(meshes[0].castShadow).toBe(true);
        expect(die.mesh.children.filter((c) => c.userData.label)).toHaveLength(6);
    });

    it('reads the value whose up points up', () => {
        const die = createModelDie({ type: 'd6', model: set.models.d6, set, visible: false });
        for (const [value, up] of Object.entries(CUBE_UPS)) {
            restOn(die, up);
            expect(modelDieValue(die, UP)[0]).toBe(Number(value));
        }
        // A slight tilt still reads the nearest face.
        restOn(die, [0.2, 1, 0.1]);
        expect(modelDieValue(die, UP)[0]).toBe(1);
    });

    it('labels show their values; a replay swaps the landing value with the target on every label', () => {
        const plain = createModelDie({ type: 'd6', model: set.models.d6, set, visible: true });
        expect(labelTexts(plain).sort()).toEqual(['1', '2', '3', '4', '5', '6']);
        const landing = set.models.d6.faces.findIndex((f) => f.value === 5);
        const replay = createModelDie({ type: 'd6', model: set.models.d6, set, visible: true, targetNumber: 2, foundClosestIndex: landing });
        restOn(replay, CUBE_UPS[5]);
        expect(modelDieValue(replay, UP)[0]).toBe(2);
        restOn(replay, CUBE_UPS[2]);
        expect(modelDieValue(replay, UP)[0]).toBe(5);
        const byValue = Object.fromEntries(set.models.d6.labels.map((l, i) => [l.value, labelTexts(replay)[i]]));
        expect(byValue).toEqual({ 1: '1', 2: '5', 3: '3', 4: '4', 5: '2', 6: '6' });
    });

    it('a d10 replays a 10 as its 0 face, like the classic d10, and reads it back as 10', async () => {
        const ups = Array.from({ length: 10 }, (_, i) => [Math.cos((i * Math.PI) / 5), i % 2 ? 0.3 : -0.3, Math.sin((i * Math.PI) / 5)]);
        const d10 = validateSet({
            id: 'ten', name: 'Ten', family: 'glass', body: { color: '#225588' }, numeral: { color: '#FFFFFF' }, swatch: ['#225588'],
            models: { d10: {
                src: 'cube.glb',
                hull: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0, 0.6, 0], [0, -0.5, 0.5]],
                faces: ups.map((up, value) => ({ value, up })),
                labels: ups.map((up, value) => ({ value, position: up.map((v) => v * 0.4), normal: up, up: [0, 1, 0], size: 0.3 })),
            } },
        }).models.d10;
        const landing = d10.faces.findIndex((f) => f.value === 7);
        const die = createModelDie({ type: 'd10', model: d10, set, visible: true, targetNumber: 10, foundClosestIndex: landing });
        restOn(die, d10.faces[landing].up);
        expect(modelDieValue(die, UP)[0]).toBe(10);
        const byValue = Object.fromEntries(d10.labels.map((l, i) => [l.value, labelTexts(die)[i]]));
        expect(byValue[7]).toBe('0');          // the landing face shows the d10's "0"
        expect(byValue[0]).toBe('7');          // and the old "0" face took the 7
    });

    it('a target the die cannot show leaves the faces alone', () => {
        const die = createModelDie({ type: 'd6', model: set.models.d6, set, visible: false, targetNumber: 9, foundClosestIndex: 0 });
        expect(die.faceValues).toEqual(set.models.d6.faces.map((f) => f.value));
    });

    it('secret labels show a question mark', () => {
        const die = createModelDie({ type: 'd6', model: set.models.d6, set, visible: true, isSecret: true });
        expect(new Set(labelTexts(die))).toEqual(new Set(['?']));
    });

    it('an invisible prediction die has a body but no visuals', () => {
        const die = createModelDie({ type: 'd6', model: set.models.d6, set, visible: false });
        expect(die.mesh.children).toHaveLength(0);
        expect(die.body.shapes).toHaveLength(1);
    });

    it('createDie gives the model die once the model is loaded and the procedural die otherwise', async () => {
        const die = createDie('d6', true, true, undefined, undefined, null, null, null, null, null, null, false, null, null, { set });
        expect(die.model).toBe(set.models.d6);
        expect(die.body.linearDamping).toBe(0.1);
        restOn(die, CUBE_UPS[3]);
        expect(getDieValue(die, UP)[0]).toBe(3);
        // A d8 has no model in this design: procedural as before.
        const d8 = createDie('d8', true, true, undefined, undefined, null, null, null, null, null, null, false, null, null, { set });
        expect(d8.model).toBeUndefined();
        // Before the model loads (or when it failed) the d6 is procedural too.
        clearModelCache();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const fallback = createDie('d6', true, true, undefined, undefined, null, null, null, null, null, null, false, null, null, { set });
        expect(fallback.model).toBeUndefined();
        warn.mockRestore();
    });

    it("reads the model's colour textures as they are: the roller renders in linear space", async () => {
        const map = new THREE.Texture();
        map.encoding = THREE.sRGBEncoding;
        const emissiveMap = new THREE.Texture();
        emissiveMap.encoding = THREE.sRGBEncoding;
        const tinted = new THREE.Group();
        tinted.add(new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), new THREE.MeshStandardMaterial({ map, emissiveMap })));
        const tintedSet = validateSet(cubeDesign('tinted', 'tinted.glb'));
        setModelLoader(async () => tinted);
        await loadModel('tinted.glb');
        const die = createModelDie({ type: 'd6', model: tintedSet.models.d6, set: tintedSet, visible: true });
        const body = []; die.mesh.traverse((o) => { if (o.isMesh && !o.userData.label) body.push(o.material); });
        expect(body[0].map.encoding).toBe(THREE.LinearEncoding);
        expect(body[0].emissiveMap.encoding).toBe(THREE.LinearEncoding);
    });

    it('dieMaterials reaches every material of a model die, and dice never share one', () => {
        const a = createModelDie({ type: 'd6', model: set.models.d6, set, visible: true });
        const b = createModelDie({ type: 'd6', model: set.models.d6, set, visible: true });
        const ma = dieMaterials(a), mb = dieMaterials(b);
        expect(ma).toHaveLength(7); // the model's one material and six labels
        expect(ma.some((m) => mb.includes(m))).toBe(false);
        const classic = createDie('d6', true, true, undefined, undefined);
        expect(dieMaterials(classic)).toEqual(classic.mesh.material);
    });
});

describe('decals on model dice', () => {
    // A design's decals (and a die's own) replace the number on their value's face, drawn as on
    // a classic face, so one `decals` entry gives a design its icons on both kinds of die.
    let restore;
    const skull = { width: 64, height: 64 };
    const crown = { width: 64, height: 64 };
    const registryWith = (images) => ({
        get: (src) => images[src],
        load: (src) => (images[src] ? Promise.resolve(images[src]) : Promise.reject(new Error(`404 ${src}`))),
        preload: async () => [],
    });
    const decalSet = (decals, id = 'cube-decals') => validateSet({ ...cubeDesign(id), decals });
    const roll = (set, registry, { target, landing, secret = false, own = null } = {}) =>
        createDie('d6', true, true, target, landing, null, null, null, null, null, null, secret, own, registry, { set });
    /** Each label mesh by the value it was analysed with. */
    const labelsByValue = (die) => {
        const meshes = die.mesh.children.filter((c) => c.userData.label);
        return Object.fromEntries(die.model.labels.map((l, i) => [l.value, meshes[i]]));
    };
    const drawn = (mesh) => callsNamed(mesh.material.map.image, 'drawImage').map((c) => c.args[0]);
    const text = (mesh) => (callsNamed(mesh.material.map.image, 'fillText')[0] || { args: [null] }).args[0];

    beforeEach(async () => {
        restore = setCanvasFactories({ canvas: (size) => makeRecordingCanvas(size) });
        clearDiceSetCaches();
        clearModelCache();
        setModelLoader(async () => boxScene());
        await loadModel('cube.glb');
    });
    afterEach(() => { restore(); setModelLoader(null); });

    it("a design's decal replaces the number on its face, drawn as on a classic face", () => {
        const set = decalSet({ d6: { 6: { src: 'skull.png', scale: 1.2, rotation: 30 } } });
        const labels = labelsByValue(roll(set, registryWith({ 'skull.png': skull })));
        expect(drawn(labels[6])).toEqual([skull]);
        expect(text(labels[6])).toBe(null);
        const canvas = labels[6].material.map.image;
        // 0.7 of the square times the decal's scale, turned by its rotation (face-texture.js drawDecalImage).
        expect(callsNamed(canvas, 'drawImage')[0].args[3]).toBeCloseTo(canvas.width * 0.7 * 1.2);
        expect(callsNamed(canvas, 'rotate')[0].args[0]).toBeCloseTo(Math.PI / 6);
        for (const v of [1, 2, 3, 4, 5]) {
            expect(text(labels[v])).toBe(String(v));
            expect(drawn(labels[v])).toEqual([]);
        }
    });

    it('the icon follows its value through a replay', () => {
        const set = decalSet({ d6: { 6: { src: 'skull.png' } } });
        const landing = set.models.d6.faces.findIndex((f) => f.value === 5);
        const labels = labelsByValue(roll(set, registryWith({ 'skull.png': skull }), { target: 6, landing }));
        expect(drawn(labels[5])).toEqual([skull]);      // the landing face shows the 6, so it shows the 6's icon
        expect(drawn(labels[6])).toEqual([]);
        expect(text(labels[6])).toBe('5');
    });

    it('a secret roll hides the icons with the numbers', () => {
        const set = decalSet({ d6: { 6: { src: 'skull.png' } } });
        const labels = labelsByValue(roll(set, registryWith({ 'skull.png': skull }), { secret: true }));
        for (const mesh of Object.values(labels)) {
            expect(drawn(mesh)).toEqual([]);
            expect(text(mesh)).toBe('?');
        }
    });

    it('the number shows until the image loads, then the icon; an image that fails keeps the number', async () => {
        let arrive;
        const pending = new Promise((resolve) => { arrive = resolve; });
        const registry = { get: () => undefined, load: (src) => (src === 'skull.png' ? pending : Promise.reject(new Error('404'))), preload: async () => [] };
        const set = decalSet({ d6: { 6: { src: 'skull.png' }, 1: { src: 'missing.png' } } });
        const labels = labelsByValue(roll(set, registry));
        expect(text(labels[6])).toBe('6');
        const version = labels[6].material.version;
        arrive(skull);
        await pending;
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(drawn(labels[6])).toEqual([skull]);
        expect(labels[6].material.version).toBeGreaterThan(version);   // the material re-uploads
        expect(text(labels[1])).toBe('1');
        expect(drawn(labels[1])).toEqual([]);
    });

    it("the die's own decal replaces the design's, and null switches it off", () => {
        const set = decalSet({ d6: { 6: { src: 'skull.png' }, 1: { src: 'skull.png' } } });
        const registry = registryWith({ 'skull.png': skull, 'crown.png': crown });
        const labels = labelsByValue(roll(set, registry, { own: { 6: { src: 'crown.png' }, 1: null } }));
        expect(drawn(labels[6])).toEqual([crown]);
        expect(drawn(labels[1])).toEqual([]);
        expect(text(labels[1])).toBe('1');
    });

    it('dice showing the same icon share its texture, as they share numerals', () => {
        const set = decalSet({ d6: { 6: { src: 'skull.png' } } });
        const registry = registryWith({ 'skull.png': skull });
        const a = labelsByValue(roll(set, registry));
        const b = labelsByValue(roll(set, registry));
        expect(drawn(a[6])).toEqual([skull]);
        expect(a[6].material.map).toBe(b[6].material.map);
        expect(a[6].material).not.toBe(b[6].material);
    });
});

describe('model dice with a liquid', () => {
    let set, restore, warn;
    const parts = (die) => { const out = []; die.mesh.traverse((o) => { if (o.isMesh && !o.userData.label) out.push(o.name); }); return out.sort(); };
    beforeEach(async () => {
        restore = setCanvasFactories({ canvas: (size) => makeRecordingCanvas(size) });
        clearDiceSetCaches();
        clearModelCache();
        warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        set = validateSet(liquidCubeDesign());
        setModelLoader(async () => flaskScene());
        await loadModel('flask.glb');
    });
    afterEach(() => { restore(); setModelLoader(null); warn.mockRestore(); });

    it('keeps the stopper, draws the box as two glass shells with the draught inside, and labels on top', () => {
        const die = createModelDie({ type: 'd6', model: set.models.d6, set, visible: true });
        expect(parts(die)).toEqual(['liquid-body', 'liquid-shell-inner', 'liquid-shell-outer', 'stopper']);
        const inner = die.mesh.getObjectByName('liquid-shell-inner');
        const outer = die.mesh.getObjectByName('liquid-shell-outer');
        const body = die.mesh.getObjectByName('liquid-body');
        expect(inner.renderOrder).toBe(0);
        expect(outer.renderOrder).toBe(1);
        expect(inner.geometry).toBe(outer.geometry);
        expect(inner.material).not.toBe(outer.material);
        expect(inner.material.side).toBe(THREE.BackSide);
        expect(outer.material.depthWrite).toBe(true);
        expect(body.userData.liquid).toBe('body');
        expect(body.material.userData.liquid).toBe(die.liquid.state.uniforms);
        expect(die.liquid.mesh).toBe(body);
        expect(typeof body.onBeforeRender).toBe('function');
        for (const label of die.mesh.children.filter((c) => c.userData.label)) expect(label.renderOrder).toBe(2);
        expect(die.mesh.children.filter((c) => c.userData.label)).toHaveLength(6);
        const materials = dieMaterials(die).filter((m) => !m.map);        // the labels carry maps
        expect(materials).toHaveLength(4);
        expect(materials.filter((m) => m.transparent)).toHaveLength(2);
    });

    it('builds the liquid material per die and shares one program between dice', () => {
        const a = createModelDie({ type: 'd6', model: set.models.d6, set, visible: true });
        const b = createModelDie({ type: 'd6', model: set.models.d6, set, visible: true });
        const template = modelTemplate(set.models.d6);
        expect(a.liquid.mesh.material).not.toBe(template.getObjectByName('liquid-body').material);
        expect(a.liquid.mesh.material).not.toBe(b.liquid.mesh.material);
        expect(a.liquid.mesh.material.customProgramCacheKey()).toBe(b.liquid.mesh.material.customProgramCacheKey());
        expect(a.liquid.state.uniforms).not.toBe(b.liquid.state.uniforms);
        expect(a.liquid.state.slosh).not.toBe(b.liquid.state.slosh);
        expect(a.liquid.state.cloud).toBe(b.liquid.state.cloud);          // the template's cloud, shared
    });

    it('levels the surface before a render, from the die pose', () => {
        const die = createModelDie({ type: 'd6', model: set.models.d6, set, visible: true });
        die.mesh.position.set(0, 2, 0);
        restOn(die, CUBE_UPS[2]);                                            // a side up
        die.mesh.updateMatrixWorld(true);
        die.liquid.mesh.onBeforeRender();
        expect(die.liquid.state.uniforms.uSurfaceHeight.value).toBeCloseTo(2 + 0.55 * 0.2, 1);   // level 0.6 of a cube: 0.1 above its middle
        expect(die.liquid.state.uniforms.uSurfaceNormal.value.y).toBeCloseTo(1, 6);
    });

    it("feeds the roller's tick to the slosh", () => {
        const die = createModelDie({ type: 'd6', model: set.models.d6, set, visible: true });
        die.liquid.tick({ velocity: { x: 6, y: 0, z: 0 } }, 1 / 60);
        die.liquid.tick({ velocity: { x: 0, y: 0, z: 0 } }, 1 / 60);
        expect(die.liquid.state.slosh.tilt).toBeGreaterThan(0);
    });

    it('cuts labels from the stopper and the outer shell only, never from the draught or the inner shell', () => {
        const plain = validateSet(cubeDesign('plain-cube', 'flask.glb'));
        const template = modelTemplate(set.models.d6);
        const plainTemplate = modelTemplate(plain.models.d6);
        set.models.d6.labels.forEach((label, i) => {
            const cut = labelGeometry(template, label);
            const reference = labelGeometry(plainTemplate, plain.models.d6.labels[i]);
            expect(cut.getAttribute('position').count).toBe(reference.getAttribute('position').count);
        });
    });

    it('an invisible prediction die has no liquid', () => {
        const die = createModelDie({ type: 'd6', model: set.models.d6, set, visible: false });
        expect(die.liquid).toBeUndefined();
        expect(die.mesh.children).toHaveLength(0);
    });

    it('a neck below the whole model gives a draught with no shell, and warns once', () => {
        const low = validateSet(liquidCubeDesign('low-neck', 'flask.glb', { neck: -5 }));
        const a = createModelDie({ type: 'd6', model: low.models.d6, set: low, visible: true });
        const b = createModelDie({ type: 'd6', model: low.models.d6, set: low, visible: true });
        expect(parts(a)).toEqual(['', 'liquid-body', 'stopper']);           // the box mesh has no name
        expect(b.liquid).toBeDefined();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain('nothing lies below its liquid neck');
    });

    it('a design without a liquid is untouched: one mesh, labels at order 2, no liquid', () => {
        const plain = validateSet(cubeDesign('plain-cube', 'flask.glb'));
        const die = createModelDie({ type: 'd6', model: plain.models.d6, set: plain, visible: true });
        expect(parts(die)).toEqual(['', 'stopper']);
        expect(die.liquid).toBeUndefined();
        for (const label of die.mesh.children.filter((c) => c.userData.label)) expect(label.renderOrder).toBe(2);
    });
});
