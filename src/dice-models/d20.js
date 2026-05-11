import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { D20_GEOMETRY, getChamferGeometry, makeGeometry } from '../geometry.js';
import { createFaceTexture } from '../face-texture.js';

export function createD20Mesh(size, targetNumber, foundClosestIndex, diceColor = 0xf0f0f0, textColor = '#FFFFFF', backgroundColor = '#f39c12', isSecret = false, decals = null, decalRegistry = null) {
    const radius = size;
    const tab = -0.2;
    const af = -Math.PI / 4 / 2;

    const vectors = D20_GEOMETRY.vertices.map(v => new THREE.Vector3().fromArray(v).normalize());

    const chamferGeometry = getChamferGeometry(vectors, D20_GEOMETRY.faces, 0.955);

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
        // d20 needs these specific texture settings for correct orientation.
        texture.flipY = true;
        texture.generateMipmaps = false;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;

        const material = new THREE.MeshPhongMaterial({
            specular: 0x172022,
            color: diceColor,
            shininess: 40,
            flatShading: true,
            map: texture
        });
        material.needsUpdate = true;
        material.transparent = false;
        material.opacity = 1.0;
        material.alphaTest = 0;
        material.side = THREE.FrontSide;

        materials.push(material);
    }

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
