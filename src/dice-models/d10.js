
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { D10_GEOMETRY, getChamferGeometry, makeGeometry } from '../geometry.js';

function createTextTexture(text, color, backColor) {
    let canvas = document.createElement("canvas");
    let context = canvas.getContext("2d");
    let ts = calculateTextureSize(50 / 2 + 50 * 1.0) * 2;
    canvas.width = canvas.height = ts;

    context.font = ts / (1 + 2 * 1.0) + "pt Arial";
    context.fillStyle = backColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = color;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    context.fillText(text, centerX, centerY);

    // add underline for 6 and 9 (and their variants like 60, 90)
    if (text === "6" || text === "9" || text === "60" || text === "90") {
        const metrics = context.measureText(text);
        const textWidth = metrics.width;

        // adjust underline position a little below the text
        const underlineY = centerY + ts * 0.165;
        const underlineX1 = centerX - textWidth / 2;
        const underlineX2 = centerX + textWidth / 2;

        context.beginPath();
        context.strokeStyle = color;
        context.lineWidth = Math.max(3, ts * 0.02); // keep relative thickness
        context.moveTo(underlineX1, underlineY);
        context.lineTo(underlineX2, underlineY);
        context.stroke();
    }

    let texture = new THREE.Texture(canvas);
    texture.needsUpdate = true;
    return texture;
}

function calculateTextureSize(approx) {
    return Math.max(128, Math.pow(2, Math.floor(Math.log(approx) / Math.log(2))));
}

export function createD10Mesh(size, targetNumber, foundClosestIndex, diceColor = 0xf0f0f0, textColor = '#FFFFFF', backgroundColor = '#2ecc71', isSecret = false) {
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
          // find the index of targetNumber
          const currentIndex = faceValues.indexOf(targetNumber === 10 ? 0 : targetNumber);
          if (currentIndex !== -1) {
              // swap
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
        let texture;
        if (i === 0) {
            texture = createTextTexture('', textColor, backgroundColor);
        } else if (i < faceValues.length) {
            // Use "?" if secret mode is enabled
            const displayText = isSecret ? '?' : faceValues[i].toString();
            texture = createTextTexture(displayText, textColor, backgroundColor);
        } else {
            texture = createTextTexture('', textColor, backgroundColor);
        }
        
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
