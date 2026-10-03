import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { buildHull, hullShape } from './hull.js';
import { loadedModel } from './loader.js';
import { labelStyle, labelTexture, labelDecalTexture, labelGeometry } from './labels.js';
import { MODEL_DIE_VALUES } from './spec.js';

/**
 * A model die: a host-supplied 3D model whose convex hull is the physics body, read through
 * the face map of its design's `models` entry, with library-drawn numbers (labels).
 */

const hullCache = new WeakMap();
const warnedHull = new WeakSet();

/** The physics hull of a model entry, built once per (frozen) entry. */
export function modelHull(model) {
    let hull = hullCache.get(model);
    if (!hull) {
        hull = buildHull(model.hull);
        const outside = hull.faces.some((f, i) => hull.normals[i].dot(hull.points[f[0]]) <= 0);
        if (outside && !warnedHull.has(model)) {
            warnedHull.add(model);
            console.warn(`open-dice-dnd: the hull of model "${model.src}" does not contain its centre of mass (the origin); analyse the model with analyzeModelDie.`);
        }
        hullCache.set(model, hull);
    }
    return hull;
}

const templates = new WeakMap();

/**
 * The roller renders in linear space (three r130's default output), the way the procedural
 * dice's canvas textures are painted. Loaders such as GLTFLoader tag colour textures sRGB,
 * which would decode them darker; read them as they are instead, like every other die.
 */
function linearColourTextures(object) {
    object.traverse((o) => {
        if (!o.isMesh) return;
        for (const material of Array.isArray(o.material) ? o.material : [o.material]) {
            if (!material) continue;
            for (const slot of ['map', 'emissiveMap']) {
                const texture = material[slot];
                if (texture && texture.encoding === THREE.sRGBEncoding) {
                    texture.encoding = THREE.LinearEncoding;
                    material.needsUpdate = true;
                }
            }
        }
    });
}

/**
 * The loaded scene placed in the die frame by the entry's transform, with world matrices up
 * to date, or null while the model is not loaded. Cached per scene and entry; dice clone it.
 */
export function modelTemplate(model) {
    const scene = loadedModel(model.src);
    if (!scene) return null;
    let perScene = templates.get(scene);
    if (!perScene) { perScene = new Map(); templates.set(scene, perScene); }
    let template = perScene.get(model);
    if (!template) {
        const placed = new THREE.Group();
        placed.scale.setScalar(model.transform.scale);
        placed.quaternion.fromArray(model.transform.rotation);
        placed.position.fromArray(model.transform.position);
        placed.add(scene.clone(true));
        linearColourTextures(placed);
        template = new THREE.Group();
        template.add(placed);
        template.updateMatrixWorld(true);
        perScene.set(model, template);
    }
    return template;
}

/**
 * Values per face after a replay's swap: the predicted landing value and the target trade
 * places. A d10's ten is its "0" face, as on the classic d10: a target of 10 lands the 0 there
 * and that face reads 10.
 */
function replayValues(type, model, targetNumber, foundClosestIndex) {
    const values = model.faces.map((f) => f.value);
    const tenOnZero = type === 'd10' && targetNumber === 10;
    const target = tenOnZero ? 0 : targetNumber;
    const valid = target != null && foundClosestIndex != null
        && foundClosestIndex >= 0 && foundClosestIndex < values.length && values.includes(target);
    if (!valid) return { values, swap: (v) => v };
    const landing = values[foundClosestIndex];
    const swap = (v) => (v === landing ? target : v === target ? landing : v);
    const swapped = values.map(swap);
    return { values: tenOnZero ? swapped.map((v) => (v === 0 ? 10 : v)) : swapped, swap };
}

function cloneMaterials(object) {
    object.traverse((o) => {
        if (!o.isMesh) return;
        o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
        o.castShadow = true;
        o.receiveShadow = true;
    });
}

/**
 * Show a decal on a label in place of its numeral: at once when the image is loaded, else
 * once it arrives (the numeral stays meanwhile, and for good if the image fails), as a
 * classic face does.
 */
function showDecal(labelMaterial, decal, decalRegistry) {
    const image = decalRegistry.get(decal.src);
    if (image) {
        labelMaterial.map = labelDecalTexture(image, decal);
        return;
    }
    Promise.resolve(decalRegistry.load(decal.src)).then((loaded) => {
        if (!loaded) return;
        labelMaterial.map = labelDecalTexture(loaded, decal);
        labelMaterial.needsUpdate = true;
    }).catch(() => {});
}

/**
 * Build a model die. With `targetNumber` and `foundClosestIndex` (a replay), the labels are
 * permuted so the predicted landing face shows the target, exactly as classic dice repaint.
 * `decals` (`{ [value]: decal }`, the design's merged with the die's own; see createDie) put
 * an image in place of a value's numeral, following the value through a replay; secret dice
 * show none. Invisible dice (the roll prediction) get the body and an empty group.
 * @returns {{ mesh: THREE.Group, body: CANNON.Body, type: string, model: object, faceValues: number[] }}
 */
export function createModelDie({ type, model, set, visible = true, targetNumber, foundClosestIndex, isSecret = false, material = null, decals = null, decalRegistry = null }) {
    const body = new CANNON.Body({ mass: 1, shape: hullShape(modelHull(model)), material: material || undefined });
    // Settles only after resting MODEL_REST_STEPS steps in a row (see physics-config).
    body.modelDie = true;
    const { values, swap } = replayValues(type, model, targetNumber, foundClosestIndex);
    const mesh = new THREE.Group();
    const template = visible ? modelTemplate(model) : null;
    if (template) {
        const visual = template.clone(true);
        cloneMaterials(visual);
        mesh.add(visual);
        const style = labelStyle(set, model);
        const fit = isSecret ? ['?'] : MODEL_DIE_VALUES[type].map(String);
        for (const label of model.labels) {
            const geometry = labelGeometry(template, label);
            if (!geometry) continue;
            const value = swap(label.value);
            const text = isSecret ? '?' : String(value);
            const decal = !isSecret && decals && decalRegistry ? decals[value] : null;
            const labelMaterial = new THREE.MeshStandardMaterial({
                map: labelTexture(text, style, fit),
                transparent: true,
                depthWrite: false,
                polygonOffset: true,
                polygonOffsetFactor: -4,
                polygonOffsetUnits: -4,
                roughness: 0.45,
                metalness: 0,
            });
            if (decal && decal.src) showDecal(labelMaterial, decal, decalRegistry);
            const labelMesh = new THREE.Mesh(geometry, labelMaterial);
            labelMesh.userData.label = true;
            labelMesh.renderOrder = 1;
            mesh.add(labelMesh);
        }
    }
    return { mesh, body, type, model, faceValues: values };
}

const scratchQuaternion = new THREE.Quaternion();

/** [value, faceIndex] of a model die: the face whose `up` lies nearest the world up. */
export function modelDieValue(die, up) {
    const local = up.clone().applyQuaternion(scratchQuaternion.copy(die.mesh.quaternion).invert());
    let best = 0, bestDot = -Infinity;
    die.model.faces.forEach((face, i) => {
        const dot = local.x * face.up[0] + local.y * face.up[1] + local.z * face.up[2];
        if (dot > bestDot) { bestDot = dot; best = i; }
    });
    return [die.faceValues[best], best];
}
