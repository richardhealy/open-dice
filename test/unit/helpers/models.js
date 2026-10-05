import * as THREE from 'three';

/** A box-shaped d6 design: hull, faces (opposite faces sum to 7) and one label per face. */
export const CUBE_UPS = { 1: [0, 1, 0], 6: [0, -1, 0], 2: [1, 0, 0], 5: [-1, 0, 0], 3: [0, 0, 1], 4: [0, 0, -1] };
const H = 0.55;

export function cubeModel(src = 'cube.glb') {
    const hull = [];
    for (const x of [-H, H]) for (const y of [-H, H]) for (const z of [-H, H]) hull.push([x, y, z]);
    const faces = Object.entries(CUBE_UPS).map(([value, up]) => ({ value: Number(value), up }));
    const labels = faces.map(({ value, up }) => ({
        value,
        position: up.map((v) => v * H),
        normal: up,
        up: Math.abs(up[1]) > 0.5 ? [0, 0, -1] : [0, 1, 0],
        size: 0.5,
    }));
    return { src, hull, faces, labels };
}

export function cubeDesign(id = 'cube-design', src = 'cube.glb') {
    return {
        id, name: 'Cube Design', family: 'glass',
        body: { color: '#22446A' },
        numeral: { color: '#FFFFFF' },
        swatch: ['#22446A'],
        models: { d6: cubeModel(src) },
    };
}

/** The scene a loader would return for the cube design: one box mesh. */
export function boxScene(color = 0x8844aa) {
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(2 * H, 2 * H, 2 * H), new THREE.MeshStandardMaterial({ color })));
    return scene;
}

/** The cube design with a draught inside: everything above y = 0.56 (the stopper) keeps its own look. */
export function liquidCubeDesign(id = 'liquid-cube', src = 'flask.glb', liquid = {}) {
    const design = cubeDesign(id, src);
    design.models.d6 = { ...design.models.d6, liquid: { color: '#2255AA', neck: H + 0.01, ...liquid } };
    return design;
}

/** The scene a loader would return for it: the box plus a small cylinder standing 0.02 above it (a stopper). */
export function flaskScene() {
    const scene = boxScene();
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.2, 8), new THREE.MeshStandardMaterial({ color: 0x8b5a2b }));
    cap.name = 'stopper';
    cap.position.y = H + 0.12;
    scene.add(cap);
    return scene;
}
