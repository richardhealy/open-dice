import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { D8_GEOMETRY, getChamferGeometry, makeGeometry } from '../geometry.js';
import { createFaceTexture } from '../face-texture.js';

export function createD8Mesh(size, targetNumber, foundClosestIndex, diceColor = 0xf0f0f0, textColor = '#FFFFFF', backgroundColor = '#3498db', isSecret = false, decals = null, decalRegistry = null) {
    const radius = size;
    const tab = 0;
    const af = -Math.PI / 4 / 2;

    const vectors = D8_GEOMETRY.vertices.map(v => new THREE.Vector3().fromArray(v).normalize());

    const chamferGeometry = getChamferGeometry(vectors, D8_GEOMETRY.faces, 0.965);

    const geometry = makeGeometry(chamferGeometry.vectors, chamferGeometry.faces, radius, tab, af);

    const materials = [];

    const faceValues = [' ', '0', '1', '2', '3', '4', '5', '6', '7', '8',
        '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'];

    if (targetNumber != null && foundClosestIndex != null) {
      const targetIndex = foundClosestIndex + 1;
      if (targetIndex >= 0 && targetIndex < faceValues.length) {
          const currentIndex = faceValues.indexOf(String(targetNumber));
          if (currentIndex !== -1) {
              const temp = faceValues[targetIndex];
              faceValues[targetIndex] = String(targetNumber);
              faceValues[currentIndex] = temp;
          }
      }
    }

    let maxMaterialIndex = 0;
    for (let i = 0; i < geometry.groups.length; i++) {
        maxMaterialIndex = Math.max(maxMaterialIndex, geometry.groups[i].materialIndex);
    }

    for (let i = 0; i <= maxMaterialIndex; i++) {
        const value = i > 0 && i < faceValues.length ? faceValues[i] : '';
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

export function createD8Body(size, material) {
    const cannonVertices = D8_GEOMETRY.vertices.map(v => new CANNON.Vec3(v[0] * size, v[1] * size, v[2] * size));
    const cannonFaces = D8_GEOMETRY.faces.map(face => face.slice(0, face.length - 1));
    const shape = new CANNON.ConvexPolyhedron({ vertices: cannonVertices, faces: cannonFaces });
    return new CANNON.Body({ mass: 1, shape, material });
}
