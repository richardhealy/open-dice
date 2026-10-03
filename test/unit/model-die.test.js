import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { validateSet } from '../../src/sets/validate.js';
import { setCanvasFactories } from '../../src/sets/canvas-factory.js';
import { clearDiceSetCaches } from '../../src/sets/texture-cache.js';
import { makeRecordingCanvas, callsNamed } from './helpers/canvas-stub.js';
import { setModelLoader, loadModel, clearModelCache } from '../../src/models/loader.js';
import { createModelDie, modelDieValue } from '../../src/models/model-die.js';
import { createDie, getDieValue, dieMaterials } from '../../src/dice.js';
import { cubeDesign, boxScene, CUBE_UPS } from './helpers/models.js';

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
