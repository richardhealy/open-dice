
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { D20_GEOMETRY, getChamferGeometry, makeGeometry } from '../geometry.js';

function createTextTexture(text, color, backColor) {
    console.log('🎨 createTextTexture called with:');
    console.log('  text:', text);
    console.log('  color:', color);
    console.log('  backColor:', backColor);
    console.log('  timestamp:', Date.now());
    
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
    console.log('🎨 Canvas context.fillStyle set to:', color);

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    context.fillText(text, centerX, centerY);
    console.log('🎨 Canvas text drawn with color:', color, 'for text:', text);

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
    texture.flipY = true; // Fix upside down text
    
    // Force texture update by setting unique properties
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    
    console.log('🎨 Texture created with canvas size:', canvas.width, 'x', canvas.height);
    console.log('🎨 Texture needsUpdate set to:', texture.needsUpdate);
    console.log('🎨 Canvas data URL preview:', canvas.toDataURL().substring(0, 50) + '...');
    
    return texture;
}

function calculateTextureSize(approx) {
    return Math.max(128, Math.pow(2, Math.floor(Math.log(approx) / Math.log(2))));
}

export function createD20Mesh(size, targetNumber, foundClosestIndex, diceColor = 0xf0f0f0, textColor = '#FFFFFF', backgroundColor = '#f39c12', isSecret = false) {
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
            console.log('🎨 Creating texture for face', i, 'with textColor:', textColor, 'backgroundColor:', backgroundColor);
            texture = createTextTexture('', textColor, backgroundColor);
        } else if (i < faceValues.length) {
            // Use "?" if secret mode is enabled
            const displayText = isSecret ? '?' : faceValues[i];
            console.log('🎨 Creating texture for face', i, 'with text:', displayText, 'textColor:', textColor, 'backgroundColor:', backgroundColor);
            texture = createTextTexture(displayText, textColor, backgroundColor);
        } else {
            console.log('🎨 Creating texture for face', i, 'with textColor:', textColor, 'backgroundColor:', backgroundColor);
            texture = createTextTexture('', textColor, backgroundColor);
        }
        
        const material = new THREE.MeshPhongMaterial({
            specular: 0x172022,
            color: diceColor,
            shininess: 40,
            flatShading: true,
            map: texture
        });
        
        // Force material update with aggressive settings
        material.needsUpdate = true;
        material.transparent = false;
        material.opacity = 1.0;
        material.alphaTest = 0;
        material.side = THREE.FrontSide;
        
        console.log('🎨 Material created for face', i, 'with texture:', texture);
        console.log('🎨 Material color:', material.color.getHexString());
        console.log('🎨 Material map UUID:', material.map.uuid);
        
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
