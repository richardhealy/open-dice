import * as THREE from 'three';
// Namespace import: listDiceSets does not exist until Task 11, and a named import of a
// missing export is a link-time error.
import * as lib from '../../src/index.js';

const { DiceRoller, createDie } = lib;
const SIZE = 320;
const container = document.getElementById('stage');
const roller = new DiceRoller({ container, width: SIZE, height: SIZE });
// The game camera frames an 18-unit-tall table; zoom in so one die fills the frame.
roller.camera.zoom = 5.2;
roller.camera.updateProjectionMatrix();

window.__renders = {};
let current = null;

/** Deterministic pose: a chosen face normal rotated to +Y, then tilted so three faces show. */
function poseFor(type) {
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    if (type === 'd20') {
        // Face [0, 11, 5] of D20_GEOMETRY has normal direction (-1, 1, 1).
        q.setFromUnitVectors(new THREE.Vector3(-1, 1, 1).normalize(), up);
    } else if (type === 'd6') {
        q.identity();
    } else {
        q.setFromUnitVectors(new THREE.Vector3(0, 1, 0.0001).normalize(), up);
    }
    const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.42, 0.55, 0.0, 'XYZ'));
    return tilt.multiply(q);
}

window.__renderDie = async (type, setId) => {
    if (setId !== 'classic' && typeof roller.preloadSets === 'function') {
        await roller.preloadSets([setId]);
    }
    if (current) roller.scene.remove(current.mesh);
    const options = setId === 'classic' ? {} : { set: setId };
    const die = createDie(type, true, true, undefined, undefined, null, roller.scene, null,
        null, null, null, false, null, null, options);
    die.mesh.quaternion.copy(poseFor(type));
    die.mesh.position.set(0, 1.2, 0);
    current = die;

    roller.renderer.render(roller.scene, roller.camera);
    const out = document.createElement('canvas');
    out.width = out.height = SIZE;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#2b2f36';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.drawImage(roller.renderer.domElement, 0, 0);
    window.__renders[`${setId}-${type}`] = ctx.getImageData(0, 0, SIZE, SIZE).data;
    return out.toDataURL('image/png');
};

window.__loadBaseline = (url) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
        const c = document.createElement('canvas');
        c.width = c.height = SIZE;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        window.__renders.baseline = ctx.getImageData(0, 0, SIZE, SIZE).data;
        resolve();
    };
    img.onerror = reject;
    img.src = url;
});

window.__diff = (a, b) => {
    const A = window.__renders[a], B = window.__renders[b];
    if (!A || !B) throw new Error(`missing render ${!A ? a : b}`);
    let differing = 0;
    for (let i = 0; i < A.length; i += 4) {
        if (Math.abs(A[i] - B[i]) > 8 || Math.abs(A[i + 1] - B[i + 1]) > 8 || Math.abs(A[i + 2] - B[i + 2]) > 8) differing++;
    }
    return differing / (A.length / 4);
};

window.__listSets = () => (typeof lib.listDiceSets === 'function'
    ? lib.listDiceSets().map((s) => s.id)
    : ['classic']);

window.__ready = true;
