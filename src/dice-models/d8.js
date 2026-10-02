import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { D8_GEOMETRY, getChamferGeometry, makeGeometry } from '../geometry.js';
import { buildFaceMaterials } from '../sets/face-materials.js';

export function createD8Mesh(size, targetNumber, foundClosestIndex, diceColor = 0xf0f0f0, textColor = '#FFFFFF', backgroundColor = '#3498db', isSecret = false, decals = null, decalRegistry = null, options = {}) {
    const radius = size;
    const tab = 0;
    const af = -Math.PI / 4 / 2;

    const vectors = D8_GEOMETRY.vertices.map(v => new THREE.Vector3().fromArray(v).normalize());

    const chamferGeometry = getChamferGeometry(vectors, D8_GEOMETRY.faces, 0.965);

    const geometry = makeGeometry(chamferGeometry.vectors, chamferGeometry.faces, radius, tab, af);


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

    // Indexed by material index: 0 is the chamfer slot; faces start at 1.
    const faces = faceValues.map((value, i) => (i > 0 && String(value).trim() !== '' ? { text: String(value) } : null));
    const materials = buildFaceMaterials({
        type: 'd8',
        geometry,
        faces,
        colors: { diceColor, textColor, backgroundColor },
        isSecret,
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

export function createD8Body(size, material) {
    const cannonVertices = D8_GEOMETRY.vertices.map(v => new CANNON.Vec3(v[0] * size, v[1] * size, v[2] * size));
    const cannonFaces = D8_GEOMETRY.faces.map(face => face.slice(0, face.length - 1));
    const shape = new CANNON.ConvexPolyhedron({ vertices: cannonVertices, faces: cannonFaces });
    return new CANNON.Body({ mass: 1, shape, material });
}
