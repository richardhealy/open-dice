import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { D4_GEOMETRY, getChamferGeometry, makeGeometry } from '../geometry.js';
import { buildFaceMaterials } from '../sets/face-materials.js';

export function createD4Mesh(size, targetNumber, foundClosestIndex, diceColor = 0xf0f0f0, textColor = '#FFFFFF', backgroundColor = '#9b59b6', isSecret = false, decals = null, decalRegistry = null, options = {}) {
    const radius = size * 1.2;
    const tab = -0.1;
    const af = Math.PI * 7 / 6;

    const vectors = D4_GEOMETRY.vertices.map(v => new THREE.Vector3().fromArray(v).normalize());
    const chamferGeometry = getChamferGeometry(vectors, D4_GEOMETRY.faces, 0.96);
    const geometry = makeGeometry(chamferGeometry.vectors, chamferGeometry.faces, radius, tab, af);

    const d4FaceTexts = [
        [[], [0, 0, 0], [2, 4, 3], [1, 3, 4], [2, 1, 4], [1, 2, 3]],
        [[], [0, 0, 0], [2, 3, 4], [3, 1, 4], [2, 4, 1], [3, 2, 1]],
        [[], [0, 0, 0], [4, 3, 2], [3, 4, 1], [4, 2, 1], [3, 1, 2]],
        [[], [0, 0, 0], [4, 2, 3], [1, 4, 3], [4, 1, 2], [1, 3, 2]]
    ];

    const faceTexts = d4FaceTexts[0].map(subArray =>
      subArray.map(n => {
        if (isSecret && n !== 0) return '?';
        if (n === foundClosestIndex) return targetNumber;
        if (n === targetNumber) return foundClosestIndex;
        return n;
      })
    );

    // Indexed by material index: 0 is the chamfer slot ([]), 1 is unused ([0, 0, 0]), 2..5 are faces.
    const faces = faceTexts.map((values) => (values.length ? { values } : null));
    const materials = buildFaceMaterials({
        type: 'd4',
        geometry,
        faces,
        colors: { diceColor, textColor, backgroundColor },
        isSecret,
        // Secret corners were rewritten to '?' above, so decal keys cannot match — the value
        // stays hidden without leaking through an icon.
        decals,
        decalRegistry,
        set: options.set,
        visible: options.visible !== false,
    });

    const mesh = new THREE.Mesh(geometry, materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

export function createD4Body(size, material) {
    const cannonVertices = D4_GEOMETRY.vertices.map(v => new CANNON.Vec3(v[0] * size, v[1] * size, v[2] * size));
    const cannonFaces = D4_GEOMETRY.faces.map(face => face.slice(0, face.length - 1));
    const shape = new CANNON.ConvexPolyhedron({ vertices: cannonVertices, faces: cannonFaces });
    return new CANNON.Body({ mass: 1, shape, material });
}
