import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { D4_GEOMETRY, getChamferGeometry, makeGeometry } from '../geometry.js';
import { createD4FaceTexture } from '../face-texture.js';

export function createD4Mesh(size, targetNumber, foundClosestIndex, diceColor = 0xf0f0f0, textColor = '#FFFFFF', backgroundColor = '#9b59b6', isSecret = false, decals = null, decalRegistry = null) {
    const radius = size * 1.2;
    const tab = -0.1;
    const af = Math.PI * 7 / 6;

    const vectors = D4_GEOMETRY.vertices.map(v => new THREE.Vector3().fromArray(v).normalize());
    const chamferGeometry = getChamferGeometry(vectors, D4_GEOMETRY.faces, 0.96);
    const geometry = makeGeometry(chamferGeometry.vectors, chamferGeometry.faces, radius, tab, af);

    const materials = [];
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

    for (let i = 0; i < faceTexts.length; ++i) {
        const texture = createD4FaceTexture({
            values: faceTexts[i],
            textColor,
            backgroundColor,
            // In secret mode the corners were rewritten to '?' above, so decal keys won't
            // match — the value stays hidden naturally without leaking via an icon.
            decals,
            decalRegistry,
        });
        materials.push(new THREE.MeshPhongMaterial({
            specular: 0x172022,
            color: diceColor,
            shininess: 40,
            flatShading: true,
            map: texture
        }));
    }

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
