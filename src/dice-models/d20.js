import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { D20_GEOMETRY, getChamferGeometry, makeGeometry } from '../geometry.js';
import { buildFaceMaterials } from '../sets/face-materials.js';

export function createD20Mesh(size, targetNumber, foundClosestIndex, diceColor = 0xf0f0f0, textColor = '#FFFFFF', backgroundColor = '#f39c12', isSecret = false, decals = null, decalRegistry = null, options = {}) {
    const radius = size;
    const tab = -0.2;
    const af = -Math.PI / 4 / 2;

    const vectors = D20_GEOMETRY.vertices.map(v => new THREE.Vector3().fromArray(v).normalize());

    const chamferGeometry = getChamferGeometry(vectors, D20_GEOMETRY.faces, 0.955);

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
        type: 'd20',
        geometry,
        faces,
        colors: { diceColor, textColor, backgroundColor },
        isSecret,
        decals,
        decalRegistry,
        // The d20 has always used these texture flags; the classic path keeps them.
        textureTuning: { flipY: true, generateMipmaps: false, linearFilter: true, clamp: true },
        set: options.set,
        visible: options.visible !== false,
    });

    const mesh = new THREE.Mesh(geometry, materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return mesh;
}

export function createD20Body(size, material) {
    const cannonVertices = D20_GEOMETRY.vertices.map(v => {
        const vec = new CANNON.Vec3(v[0], v[1], v[2]);
        return vec.unit().scale(size * 0.9);
    });
    const cannonFaces = D20_GEOMETRY.faces.map(face => face.slice(0, face.length - 1));
    const shape = new CANNON.ConvexPolyhedron({ vertices: cannonVertices, faces: cannonFaces });
    return new CANNON.Body({ mass: 1, shape, material });
}
