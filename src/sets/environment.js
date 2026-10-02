import * as THREE from 'three';

/**
 * A small procedural "room": a dark shell seen from inside and a few bright panels. Run
 * through PMREMGenerator it becomes the reflection environment for every set material.
 * Written in-library instead of importing three/examples/jsm/environments/RoomEnvironment
 * because the UMD build has no global for the examples modules.
 */
export function createRoomScene() {
    const room = new THREE.Scene();
    const box = new THREE.BoxGeometry(1, 1, 1);

    const shell = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0x141418, side: THREE.BackSide }));
    shell.scale.set(30, 30, 30);
    room.add(shell);

    const panel = (rgb, position, scale) => {
        const mesh = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: new THREE.Color(...rgb) }));
        mesh.position.set(...position);
        mesh.scale.set(...scale);
        room.add(mesh);
    };
    // The renderer has no tone mapping, so radiance far above 1 clips to white; keep these
    // panels just bright enough to read as soft lights in metal and clearcoat.
    panel([1.8, 1.7, 1.55], [0, 14, 0], [10, 0.2, 6]);    // key light overhead
    panel([0.9, 1.0, 1.2], [-14, 6, 4], [0.2, 6, 8]);     // cool fill, left
    panel([0.7, 0.75, 0.9], [14, 4, -6], [0.2, 5, 7]);    // cool fill, right
    panel([1.4, 1.0, 0.6], [2, 3, -14], [8, 4, 0.2]);     // warm rim, back
    panel([0.5, 0.5, 0.5], [0, -14, 0], [12, 0.2, 12]);   // floor bounce
    panel([1.2, 1.1, 1.0], [6, 11, 10], [3, 0.2, 3]);     // small front highlight
    return room;
}

/**
 * Build the PMREM environment once per scene and assign it to `scene.environment`.
 * Returns the texture, or null when generation fails (the dice then render without
 * reflections). Repeated calls are no-ops.
 */
export function installEnvironment(renderer, scene, { generatorFactory } = {}) {
    if (!scene) return null;
    if (scene.environment) return scene.environment;
    try {
        const factory = generatorFactory || ((r) => new THREE.PMREMGenerator(r));
        const generator = factory(renderer);
        const room = createRoomScene();
        const target = generator.fromScene(room, 0.04);
        scene.environment = target.texture;
        generator.dispose();
        room.traverse((object) => {
            if (object.isMesh) object.material.dispose();
        });
        return scene.environment;
    } catch (err) {
        console.warn('open-dice-dnd: could not build the environment map; dice sets render without reflections.', err);
        return null;
    }
}
