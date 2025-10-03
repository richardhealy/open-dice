
import * as THREE from 'three';
import { D6_GEOMETRY, getChamferGeometry, makeGeometry } from '../geometry.js';

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
        const underlineY = centerY + ts * 0.15;
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

export function createD6Mesh(size, targetNumber, foundClosestIndex) {
    const radius = size * 0.9;
    const tab = 0.1;
    const af = Math.PI / 4;
    
    const vectors = D6_GEOMETRY.vertices.map(v => new THREE.Vector3().fromArray(v).normalize());
    
    const chamferGeometry = getChamferGeometry(vectors, D6_GEOMETRY.faces, 0.96);
    
    const geometry = makeGeometry(chamferGeometry.vectors, chamferGeometry.faces, radius, tab, af);
    
    const materials = [];
    const faceValues = [' ', '0', '1', '2', '3', '4', '5', '6', '7', '8',
    '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'];

    if (targetNumber != null && foundClosestIndex != null) {
      const targetIndex = foundClosestIndex + 1; 
      if (targetIndex >= 0 && targetIndex < faceValues.length) {
          // find the index of targetNumber
          const currentIndex = faceValues.indexOf(String(targetNumber));
          if (currentIndex !== -1) {
              // swap
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
        let texture;
        if (i === 0) {
            texture = createTextTexture('', '#FFFFFF', '#e74c3c');
        } else if (i < faceValues.length) {
            texture = createTextTexture(faceValues[i], '#FFFFFF', '#e74c3c');
        } else {
            texture = createTextTexture('', '#FFFFFF', '#e74c3c');
        }
        
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
