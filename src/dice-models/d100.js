
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
    const centerY = canvas.height / 2 + 20;

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

export function createD100Mesh(size, targetNumber, foundClosestIndex, isFirst) {
    const radius = size * 0.9;
    const tab = 0;
    const af = Math.PI * 6 / 5;
    
    const vectors = D10_GEOMETRY.vertices.map(v => new THREE.Vector3().fromArray(v).normalize());
    
    const chamferGeometry = getChamferGeometry(vectors, D10_GEOMETRY.faces, 0.945);
    
    const geometry = makeGeometry(chamferGeometry.vectors, chamferGeometry.faces, radius, tab, af);
    
    const materials = [];
    let faceValues = [];
    if (isFirst) {
      faceValues = ['', '1', '0', '2', '9', '3', '8', '4', '7', '5', '6'];
    } else {
      faceValues = ['', '10', '00', '20', '90', '30', '80', '40', '70', '50', '60'];
    }

    if (targetNumber != null && foundClosestIndex != null) {
      const newTargetNumber = isFirst ? targetNumber % 10 : targetNumber - (targetNumber % 10) 
      const targetIndex = foundClosestIndex; 
      if (targetIndex >= 0 && targetIndex < faceValues.length) {
          // find the index of targetNumber
          const currentIndex = faceValues.indexOf(String(newTargetNumber === 100 || (newTargetNumber === 0 && !isFirst) ? '00' : newTargetNumber));
          if (currentIndex !== -1) {
              // swap
              const temp = faceValues[targetIndex];
              faceValues[targetIndex] = String(newTargetNumber === 100 || (newTargetNumber === 0 && !isFirst) ? '00' : newTargetNumber);
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
            texture = createTextTexture('', '#FFFFFF', '#8B4513');
        } else if (i < faceValues.length) {
            texture = createTextTexture(faceValues[i].toString(), '#FFFFFF', '#8B4513');
        } else {
            texture = createTextTexture('', '#FFFFFF', '#8B4513');
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

export function createD100Body(size, material) {
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
