
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { D4_GEOMETRY, getChamferGeometry, makeGeometry } from '../geometry.js';

function createD4TextTexture(text, color, backColor) {
    let canvas = document.createElement("canvas");
    let context = canvas.getContext("2d");
    let ts = calculateTextureSize(50 / 2 + 50 * 2) * 2;
    canvas.width = canvas.height = ts;
    context.font = ts / 5 + "pt Arial";
    context.fillStyle = backColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = color;
    for (let i in text) {
        context.fillText(text[i], canvas.width / 2,
            canvas.height / 2 - ts * 0.3);
        context.translate(canvas.width / 2, canvas.height / 2);
        context.rotate(Math.PI * 2 / 3); // Rotate for each number
        context.translate(-canvas.width / 2, -canvas.height / 2);
    }
    let texture = new THREE.Texture(canvas);
    texture.needsUpdate = true;
    return texture;
}

function calculateTextureSize(approx) {
    return Math.max(128, Math.pow(2, Math.floor(Math.log(approx) / Math.log(2))));
}

export function createD4Mesh(size, targetNumber, foundClosestIndex) {
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
        if (n === foundClosestIndex) return targetNumber;
        if (n === targetNumber) return foundClosestIndex;
        return n;
      })
    );


    for (let i = 0; i < faceTexts.length; ++i) {
        let texture = createD4TextTexture(faceTexts[i], '#FFFFFF', '#4caf4c');
        materials.push(new THREE.MeshPhongMaterial({
            specular: 0x172022,
            color: 0xf0f0f0,
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
