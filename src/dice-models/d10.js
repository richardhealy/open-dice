import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { D10_GEOMETRY, getChamferGeometry, makeGeometry } from '../geometry.js';
import { createFaceTexture } from '../face-texture.js';

export function createD10Mesh(size, targetNumber, foundClosestIndex, diceColor = 0xf0f0f0, textColor = '#FFFFFF', backgroundColor = '#2ecc71', isSecret = false, decals = null, decalRegistry = null) {
    const radius = size * 0.9;
    const tab = 0;
    const af = Math.PI * 6 / 5;

    const vectors = D10_GEOMETRY.vertices.map(v => new THREE.Vector3().fromArray(v).normalize());

    const chamferGeometry = getChamferGeometry(vectors, D10_GEOMETRY.faces, 0.945);

    const geometry = makeGeometry(chamferGeometry.vectors, chamferGeometry.faces, radius, tab, af);

    const materials = [];
    const faceValues = ['', 1, 0, 2, 9, 3, 8, 4, 7, 5, 6];

    if (targetNumber != null && foundClosestIndex != null) {
      const targetIndex = foundClosestIndex;
      if (targetIndex >= 0 && targetIndex < faceValues.length) {
          const currentIndex = faceValues.indexOf(targetNumber === 10 ? 0 : targetNumber);
          if (currentIndex !== -1) {
              const temp = faceValues[targetIndex];
              faceValues[targetIndex] = targetNumber === 10 ? 0 : targetNumber;
              faceValues[currentIndex] = temp;
          }
      }
    }

    let maxMaterialIndex = 0;
    for (let i = 0; i < geometry.groups.length; i++) {
        maxMaterialIndex = Math.max(maxMaterialIndex, geometry.groups[i].materialIndex);
    }

    for (let i = 0; i <= maxMaterialIndex; i++) {
        const value = i > 0 && i < faceValues.length ? faceValues[i].toString() : '';
        const decal = (value && decals) ? decals[value] : null;
        const texture = createFaceTexture({
            text: value,
            textColor,
            backgroundColor,
            decal,
            decalRegistry,
            isSecret,
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

export function createD10Body(size, material) {
    const cannonVertices = D10_GEOMETRY.vertices.map(v => new CANNON.Vec3(v[0] * size, v[1] * size, v[2] * size));
    const cannonFaces = [];
    D10_GEOMETRY.faces.forEach(face => {
        const cleanedFace = face.slice(0, face.length - 1);
        if (cleanedFace.length === 4) {
            cannonFaces.push([cleanedFace[0], cleanedFace[1], cleanedFace[2]]);
            cannonFaces.push([cleanedFace[0], cleanedFace[2], cleanedFace[3]]);
        } else if (cleanedFace.length === 3) {
            cannonFaces.push(cleanedFace);
        }
    });
    const shape = new CANNON.ConvexPolyhedron({ vertices: cannonVertices, faces: cannonFaces });
    return new CANNON.Body({ mass: 1, shape, material });
}
