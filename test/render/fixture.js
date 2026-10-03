import * as THREE from 'three';
// Namespace import: listDiceSets does not exist until Task 11, and a named import of a
// missing export is a link-time error.
import * as lib from '../../src/index.js';

const { DiceRoller, createDie, registerDiceSet } = lib;
const SIZE = 320;
const container = document.getElementById('stage');
const roller = new DiceRoller({ container, width: SIZE, height: SIZE });

/** A 64x64 PNG data URL painted here, so the image path needs no network. */
function pngDataUrl(paint) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    paint(c.getContext('2d'));
    return c.toDataURL('image/png');
}

// Test-only set exercising image textures: a checkerboard body image and a ring with alpha as
// a metal decoration image layer. Registered at load; the harness renders it on its own and
// keeps it out of the catalogue loop and the previews.
const FIXTURE_IMAGE_SET = 'fixture-image';
const checkerboard = pngDataUrl((ctx) => {
    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            ctx.fillStyle = (x + y) % 2 === 0 ? '#EEE4D2' : '#2F5BA8';
            ctx.fillRect(x * 8, y * 8, 8, 8);
        }
    }
});
const ring = pngDataUrl((ctx) => {
    ctx.strokeStyle = '#D4AF37';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(32, 32, 24, 0, Math.PI * 2);
    ctx.stroke();
});
registerDiceSet({
    id: FIXTURE_IMAGE_SET,
    name: 'Fixture Image',
    family: 'textured',
    body: {
        color: '#3A3A3A',
        depthColor: '#1E1E1E',
        roughness: 0.5,
        vignette: 0,
        // The fallback painted until the images load; the body image replaces it.
        texture: { kind: 'noise', color2: '#505050', contrast: 0.2 },
        image: { src: checkerboard, fit: 'cover' },
        normalStrength: 0.3,
    },
    edge: { metal: 'gold' },
    numeral: { color: '#111111', style: 'engraved' },
    decor: [{ image: { src: ring }, metal: 'gold', relief: 0.6 }],
    swatch: ['#2F5BA8', '#EEE4D2', '#D4AF37'],
});
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

// `half` is 'tens' to render the second die of a d100 pair (isFirst = false), else the units.
// `preload: false` skips the set's image preload (the font and environment still load) so the
// die paints its fallback; `key` stores the pixels under another name than `<set>-<type>`.
window.__renderDie = async (type, setId, half = 'units', { preload = true, key = null } = {}) => {
    if (setId !== 'classic' && typeof roller.preloadSets === 'function') {
        await roller.preloadSets(preload ? [setId] : []);
    }
    if (current) roller.scene.remove(current.mesh);
    const options = setId === 'classic' ? {} : { set: setId };
    // The roller's registry is passed so set images (and their repaint) go through the same
    // path as in the app; sets without images, and classic, paint exactly as without one.
    const die = createDie(type, true, half !== 'tens', undefined, undefined, null, roller.scene, null,
        null, null, null, false, null, roller.decalRegistry, options);
    die.mesh.quaternion.copy(poseFor(type));
    die.mesh.position.set(0, 1.2, 0);
    current = die;

    roller.renderer.render(roller.scene, roller.camera);
    // Output in device pixels: at devicePixelRatio 1 (the harness) this is exactly SIZE, so
    // the baselines are unaffected; at 2 it shows whether the renderer draws at full density.
    const px = Math.round(SIZE * (window.devicePixelRatio || 1));
    const out = document.createElement('canvas');
    out.width = out.height = px;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#2b2f36';
    ctx.fillRect(0, 0, px, px);
    ctx.drawImage(roller.renderer.domElement, 0, 0, px, px);
    window.__renders[key || `${setId}-${type}${half === 'tens' ? '-tens' : ''}`] = ctx.getImageData(0, 0, px, px).data;
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

// The catalogue the harness loops over: every registered set except the fixture-only ones.
window.__listSets = () => (typeof lib.listDiceSets === 'function'
    ? lib.listDiceSets().map((s) => s.id).filter((id) => id !== FIXTURE_IMAGE_SET)
    : ['classic']);

window.__ready = true;
