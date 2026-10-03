import * as THREE from 'three';
// Namespace import: listDiceSets does not exist until Task 11, and a named import of a
// missing export is a link-time error.
import * as lib from '../../src/index.js';
import { EXAMPLE_DESIGNS } from '../../examples/designs/index.js';
import { paintNumeral, fitDieNumeralSize, TEXTURE_SIZE, NUMERAL_SIZE, CORNER_SIZE, CORNER_OFFSET, FIT_MARGIN } from '../../src/sets/face-painter.js';
import { FACE_FRAMES, frameEdges, frameRadius } from '../../src/sets/face-frame.js';
import { drawDecalImage } from '../../src/face-texture.js';
import { D100_TEXT_OFFSET_Y } from '../../src/dice-models/d100.js';

const { DiceRoller, createDie, registerDiceSet } = lib;
const SIZE = 320;
const container = document.getElementById('stage');
const roller = new DiceRoller({ container, width: SIZE, height: SIZE });

// The library ships no designs; like any host, the fixture registers the example designs.
for (const def of EXAMPLE_DESIGNS) registerDiceSet(def);

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
// `target` paints that value on the face the pose turns up (the d20 pose shows face 0), so a
// design's "20" decal can be viewed.
window.__renderDie = async (type, setId, half = 'units', { preload = true, key = null, target } = {}) => {
    if (setId !== 'classic' && typeof roller.preloadSets === 'function') {
        await roller.preloadSets(preload ? [setId] : []);
    }
    if (current) roller.scene.remove(current.mesh);
    const options = setId === 'classic' ? {} : { set: setId };
    // The roller's registry is passed so set images (and their repaint) go through the same
    // path as in the app; sets without images, and classic, paint exactly as without one.
    // With a target, find the face this pose turns up (ask the library, as a settled roll does)
    // and paint the target there.
    let upIndex;
    if (target !== undefined) {
        const probe = createDie(type, true, half !== 'tens', undefined, undefined, null, null, null,
            null, null, null, false, null, null, options);
        probe.mesh.quaternion.copy(poseFor(type));
        upIndex = lib.getDieValue(probe, new THREE.Vector3(0, 1, 0))[1];
    }
    const die = createDie(type, true, half !== 'tens', target, upIndex, null, roller.scene, null,
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

/**
 * Exhaustive fit probe: every numeral of every registered design, on every die type and face
 * value (d4 corners and the d100 tens included), painted through the real paintNumeral with
 * the embedded fonts; ink pixels outside the true face polygon are counted. Each d20 decal is
 * drawn the way the decal pipeline draws it and checked against the face less its band margin.
 */
const PROBE_VALUES = {
    d4: [1, 2, 3, 4], d6: [1, 2, 3, 4, 5, 6], d8: [1, 2, 3, 4, 5, 6, 7, 8], d10: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    d12: Array.from({ length: 12 }, (_, i) => i + 1), d20: Array.from({ length: 20 }, (_, i) => i + 1),
    d100: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, '00', 10, 20, 30, 40, 50, 60, 70, 80, 90],
};

function inkOutside(canvas, edges, margin = 0) {
    const ctx = canvas.getContext('2d');
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let outside = 0, ink = 0;
    for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
            if (data[(y * canvas.width + x) * 4 + 3] <= 40) continue;
            ink++;
            const px = x + 0.5, py = y + 0.5;
            if (edges.some(({ n, h }) => n[0] * px + n[1] * py > h - margin + 0.75)) outside++;
        }
    }
    return { outside, ink };
}

// `fit: false` paints at the design size, the pre-fit behaviour (proves the probe catches overflow).
window.__fitProbe = async ({ fit: useFit = true } = {}) => {
    await lib.prepareDiceSets({ renderer: roller.renderer, scene: roller.scene });
    const ts = TEXTURE_SIZE;
    const glyphs = [];
    const decals = [];
    const ids = lib.listDiceSets().map((s) => s.id).filter((id) => id !== 'classic' && id !== FIXTURE_IMAGE_SET);
    for (const id of ids) {
        const set = lib.getDiceSet(id);
        for (const type of Object.keys(PROBE_VALUES)) {
            const edges = frameEdges(FACE_FRAMES[type], ts);
            for (const value of PROBE_VALUES[type]) {
                const corner = type === 'd4';
                const text = String(value);
                const x = ts / 2, y = corner ? ts / 2 - ts * CORNER_OFFSET : ts / 2 + (type === 'd100' ? D100_TEXT_OFFSET_Y : 0);
                const basePx = ts * (corner ? CORNER_SIZE : NUMERAL_SIZE) * set.numeral.scale;
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = ts;
                const ctx = canvas.getContext('2d');
                paintNumeral(ctx, text, { x, y, sizePx: basePx, set, mode: 'albedo', fit: useFit ? { type, ts, corner } : null });
                const fitted = fitDieNumeralSize({ ctx, text, set, type, basePx, x, y, ts, corner });
                const half = type === 'd100' ? (text.length >= 2 ? 'tens' : 'units') : '';
                glyphs.push({ id, type, half, text, ratio: fitted / basePx, ...inkOutside(canvas, edges) });
            }
        }
        const decal = set.decals && set.decals.d20 && set.decals.d20['20'];
        if (decal) {
            const img = await roller.decalRegistry.load(decal.src);
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = ts;
            drawDecalImage(canvas.getContext('2d'), img, decal, ts);
            const margin = frameRadius(FACE_FRAMES.d20, ts) * FIT_MARGIN.band;
            decals.push({ id, ...inkOutside(canvas, frameEdges(FACE_FRAMES.d20, ts), margin) });
        }
    }
    return { glyphs, decals };
};

/** Ink pixels of a decal drawn at `scale` that reach into the d20's edge band (sizing helper). */
window.__decalOutside = async (src, scale) => {
    const ts = TEXTURE_SIZE;
    const img = await roller.decalRegistry.load(src);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = ts;
    drawDecalImage(canvas.getContext('2d'), img, { src, scale }, ts);
    return inkOutside(canvas, frameEdges(FACE_FRAMES.d20, ts), frameRadius(FACE_FRAMES.d20, ts) * FIT_MARGIN.band).outside;
};

/** The d20 "20" decal of each registered design, for the sizing helper. */
window.__designDecals = () => lib.listDiceSets().map((s) => lib.getDiceSet(s.id))
    .filter((set) => set.decals && set.decals.d20 && set.decals.d20['20'])
    .map((set) => ({ id: set.id, src: set.decals.d20['20'].src, scale: set.decals.d20['20'].scale }));
