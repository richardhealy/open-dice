import * as THREE from 'three';
import { D6_GEOMETRY, getChamferGeometry, makeGeometry } from '../geometry.js';
import { buildFaceMaterials } from '../sets/face-materials.js';

export function createD6Mesh(size, targetNumber, foundClosestIndex, diceColor = 0xf0f0f0, textColor = '#FFFFFF', backgroundColor = '#e74c3c', isSecret = false, decals = null, decalRegistry = null, options = {}) {
    const radius = size * 0.9;
    const tab = 0.1;
    const af = Math.PI / 4;

    const vectors = D6_GEOMETRY.vertices.map(v => new THREE.Vector3().fromArray(v).normalize());

    const chamferGeometry = getChamferGeometry(vectors, D6_GEOMETRY.faces, 0.96);

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
        type: 'd6',
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
