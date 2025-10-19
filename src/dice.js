
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createD4Mesh, createD4Body } from './dice-models/d4.js';
import { createD6Mesh } from './dice-models/d6.js';
import { createD8Mesh, createD8Body } from './dice-models/d8.js';
import { createD10Mesh, createD10Body } from './dice-models/d10.js';
import { createD12Mesh, createD12Body } from './dice-models/d12.js';
import { createD20Mesh, createD20Body } from './dice-models/d20.js';
import { createD100Body, createD100Mesh } from './dice-models/d100.js';

// Color validation utility
function isValidHexColor(color) {
    if (typeof color === 'string') {
        return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
    }
    return false;
}

function isValidNumericColor(color) {
    return typeof color === 'number' && color >= 0 && color <= 0xffffff;
}

export function createDie(type, visible = true, isFirst = true, targetNumber, foundClosestIndex, customMaterial = null, customScene = null, customWorld = null, diceColor = null, textColor = null, backgroundColor = null) {
    console.log('🎨 createDie called with colors:');
    console.log('  type:', type);
    console.log('  diceColor:', diceColor);
    console.log('  textColor:', textColor);
    console.log('  backgroundColor:', backgroundColor);
    
    // Use custom material/scene/world if provided
    const material = customMaterial || new CANNON.Material('dice');
    const targetScene = customScene;
    const targetWorld = customWorld;
    
    // Default colors for each die type
    const defaultColors = {
        d4: { diceColor: 0xf0f0f0, textColor: '#FFFFFF', backgroundColor: '#9b59b6' },
        d6: { diceColor: 0xf0f0f0, textColor: '#FFFFFF', backgroundColor: '#e74c3c' },
        d8: { diceColor: 0xf0f0f0, textColor: '#FFFFFF', backgroundColor: '#3498db' },
        d10: { diceColor: 0xf0f0f0, textColor: '#FFFFFF', backgroundColor: '#2ecc71' },
        d12: { diceColor: 0xf0f0f0, textColor: '#FFFFFF', backgroundColor: '#f39c12' },
        d20: { diceColor: 0xf0f0f0, textColor: '#FFFFFF', backgroundColor: '#f39c12' },
        d100: { diceColor: 0xf0f0f0, textColor: '#FFFFFF', backgroundColor: '#e67e22' }
    };
    
    // Use provided colors or defaults with validation
    const colors = defaultColors[type] || defaultColors.d6;
    const finalDiceColor = (diceColor !== null && isValidNumericColor(diceColor)) ? diceColor : colors.diceColor;
    const finalTextColor = (textColor !== null && isValidHexColor(textColor)) ? textColor : colors.textColor;
    const finalBackgroundColor = (backgroundColor !== null && isValidHexColor(backgroundColor)) ? backgroundColor : colors.backgroundColor;
    
    console.log('🎨 Final colors being used:');
    console.log('  finalDiceColor:', finalDiceColor);
    console.log('  finalTextColor:', finalTextColor);
    console.log('  finalBackgroundColor:', finalBackgroundColor);
    
    let mesh, body;
    const size = 1;
    switch (type) {
        case 'd4':
            mesh = createD4Mesh(size, targetNumber, foundClosestIndex, finalDiceColor, finalTextColor, finalBackgroundColor);
            body = createD4Body(size, material);
            break;
        case 'd6':
            mesh = createD6Mesh(size, targetNumber, foundClosestIndex, finalDiceColor, finalTextColor, finalBackgroundColor);
            body = new CANNON.Body({ mass: 1, shape: new CANNON.Box(new CANNON.Vec3(size / 2, size / 2, size / 2)), material: material });
            break;
        case 'd8':
            mesh = createD8Mesh(size, targetNumber, foundClosestIndex, finalDiceColor, finalTextColor, finalBackgroundColor);
            body = createD8Body(size, material);
            break;
        case 'd10':
            mesh = createD10Mesh(size, targetNumber, foundClosestIndex, finalDiceColor, finalTextColor, finalBackgroundColor);
            body = createD10Body(size, material);
            break;
        case 'd12':
            mesh = createD12Mesh(size, targetNumber, foundClosestIndex, finalDiceColor, finalTextColor, finalBackgroundColor);
            body = createD12Body(size, material);
            break;
        case 'd20':
            mesh = createD20Mesh(size, targetNumber, foundClosestIndex, finalDiceColor, finalTextColor, finalBackgroundColor);
            body = createD20Body(size, material);
            break;
        case 'd100':
            mesh = createD100Mesh(size, targetNumber, foundClosestIndex, isFirst, finalDiceColor, finalTextColor, finalBackgroundColor);
            body = createD100Body(size, material);
            break;
        default:
            mesh = createD6Mesh(size, targetNumber, foundClosestIndex, finalDiceColor, finalTextColor, finalBackgroundColor);
            body = new CANNON.Body({ mass: 1, shape: new CANNON.Box(new CANNON.Vec3(size / 2, size / 2, size / 2)), material: material });
            break;
    }
    
    if (visible)
      mesh.castShadow = true;
    else 
      mesh.visible = false
    
    // Add to scene and world if available (backwards compatibility)
    if (targetScene) {
        targetScene.add(mesh);
    }
    if (targetWorld) {
        targetWorld.addBody(body);
    }
    
    body.linearDamping = 0.1;
    body.angularDamping = 0.1;
    return { mesh, body, type };
}

export function getDieValue(die, up, targetNumber, foundClosestIndex) {
    let maxDot = -Infinity;
    let closestIndex = 0;
    
    if (die.type === 'd4') {
        let minDot = Infinity; // Find face pointing downwards for D4
        const geometry = die.mesh.geometry;
        const faceValues = ['', 1, 2, 3, 4];

        if (targetNumber != null && foundClosestIndex != null) {
          if (foundClosestIndex >= 0 && foundClosestIndex < faceValues.length) {
            faceValues[foundClosestIndex] = targetNumber;
          }
        }
        
        for (let i = 0; i < geometry.groups.length; i++) {
            const group = geometry.groups[i];
            if (group.materialIndex === 0) continue; // Skip chamfer material
            
            const position = geometry.attributes.position;
            const startVertex = group.start;
            const v0 = new THREE.Vector3().fromBufferAttribute(position, startVertex);
            const v1 = new THREE.Vector3().fromBufferAttribute(position, startVertex + 1);
            const v2 = new THREE.Vector3().fromBufferAttribute(position, startVertex + 2);
            
            const faceNormal = new THREE.Vector3()
                .subVectors(v1, v0)
                .cross(new THREE.Vector3().subVectors(v2, v0))
                .normalize();
            
            const worldNormal = faceNormal.clone().applyQuaternion(die.mesh.quaternion);
            const dot = worldNormal.dot(up);

            if (dot < minDot) {
                minDot = dot;
                closestIndex = group.materialIndex - 1; // Adjust for material index offset
            }
        }
        return [parseInt(faceValues[closestIndex]), closestIndex] || [1, 1];
    } else if (die.type === 'd6') {
        const geometry = die.mesh.geometry;
        const faceValues = ['', 1, 2, 3, 4, 5, 6];

        if (targetNumber != null && foundClosestIndex != null) {
          if (foundClosestIndex >= 0 && foundClosestIndex < faceValues.length) {
            faceValues[foundClosestIndex] = targetNumber;
          }
        }
        
        for (let i = 0; i < geometry.groups.length; i++) {
            const group = geometry.groups[i];
            if (group.materialIndex === 0) continue; // Skip chamfer material
            
            const position = geometry.attributes.position;
            const startVertex = group.start;
            const v0 = new THREE.Vector3().fromBufferAttribute(position, startVertex);
            const v1 = new THREE.Vector3().fromBufferAttribute(position, startVertex + 1);
            const v2 = new THREE.Vector3().fromBufferAttribute(position, startVertex + 2);
            
            const faceNormal = new THREE.Vector3()
                .subVectors(v1, v0)
                .cross(new THREE.Vector3().subVectors(v2, v0))
                .normalize();
            
            const worldNormal = faceNormal.clone().applyQuaternion(die.mesh.quaternion);
            const dot = worldNormal.dot(up);
            if (dot > maxDot) {
                maxDot = dot;
                closestIndex = group.materialIndex - 1; // Adjust for material index offset
            }
        }
        return [parseInt(faceValues[closestIndex]), closestIndex] || [1, 1];
    } else if (die.type === 'd8') {
        const geometry = die.mesh.geometry;
        const faceValues = ['', 1, 2, 3, 4, 5, 6, 7, 8];

        if (targetNumber != null && foundClosestIndex != null) {
          if (foundClosestIndex >= 0 && foundClosestIndex < faceValues.length) {
            faceValues[foundClosestIndex] = targetNumber;
          }
        }
        
        for (let i = 0; i < geometry.groups.length; i++) {
            const group = geometry.groups[i];
            if (group.materialIndex === 0) continue; // Skip chamfer material
            
            const position = geometry.attributes.position;
            const startVertex = group.start;
            const v0 = new THREE.Vector3().fromBufferAttribute(position, startVertex);
            const v1 = new THREE.Vector3().fromBufferAttribute(position, startVertex + 1);
            const v2 = new THREE.Vector3().fromBufferAttribute(position, startVertex + 2);
            
            const faceNormal = new THREE.Vector3()
                .subVectors(v1, v0)
                .cross(new THREE.Vector3().subVectors(v2, v0))
                .normalize();
            
            const worldNormal = faceNormal.clone().applyQuaternion(die.mesh.quaternion);
            const dot = worldNormal.dot(up);
            if (dot > maxDot) {
                maxDot = dot;
                closestIndex = group.materialIndex - 1; // Adjust for material index offset
            }
        }
        return [parseInt(faceValues[closestIndex]), closestIndex] || [1, 1];
    } else if (die.type === 'd12') {
        const geometry = die.mesh.geometry;
        const faceValues = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

        if (targetNumber != null && foundClosestIndex != null) {
          if (foundClosestIndex >= 0 && foundClosestIndex < faceValues.length) {
            faceValues[foundClosestIndex] = targetNumber;
          }
        }
        
        for (let i = 0; i < geometry.groups.length; i++) {
            const group = geometry.groups[i];
            if (group.materialIndex === 0) continue; // Skip chamfer material
            
            const position = geometry.attributes.position;
            const startVertex = group.start;
            const v0 = new THREE.Vector3().fromBufferAttribute(position, startVertex);
            const v1 = new THREE.Vector3().fromBufferAttribute(position, startVertex + 1);
            const v2 = new THREE.Vector3().fromBufferAttribute(position, startVertex + 2);
            
            const faceNormal = new THREE.Vector3()
                .subVectors(v1, v0)
                .cross(new THREE.Vector3().subVectors(v2, v0))
                .normalize();
            
            const worldNormal = faceNormal.clone().applyQuaternion(die.mesh.quaternion);
            const dot = worldNormal.dot(up);
            if (dot > maxDot) {
                maxDot = dot;
                closestIndex = group.materialIndex - 1; // Adjust for material index offset
            }
        }
        return [parseInt(faceValues[closestIndex]), closestIndex] || [1, 1];
    } else if (die.type === 'd20') {
        const geometry = die.mesh.geometry;
        const faceValues = ['', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

        if (targetNumber != null && foundClosestIndex != null) {
          if (foundClosestIndex >= 0 && foundClosestIndex < faceValues.length) {
            faceValues[foundClosestIndex] = targetNumber;
          }
        }
        
        for (let i = 0; i < geometry.groups.length; i++) {
            const group = geometry.groups[i];
            if (group.materialIndex === 0) continue; // Skip chamfer material
            
            const position = geometry.attributes.position;
            const startVertex = group.start;
            const v0 = new THREE.Vector3().fromBufferAttribute(position, startVertex);
            const v1 = new THREE.Vector3().fromBufferAttribute(position, startVertex + 1);
            const v2 = new THREE.Vector3().fromBufferAttribute(position, startVertex + 2);
            
            const faceNormal = new THREE.Vector3()
                .subVectors(v1, v0)
                .cross(new THREE.Vector3().subVectors(v2, v0))
                .normalize();
            
            const worldNormal = faceNormal.clone().applyQuaternion(die.mesh.quaternion);
            const dot = worldNormal.dot(up);
            if (dot > maxDot) {
                maxDot = dot;
                closestIndex = group.materialIndex - 1; // Adjust for material index offset
            }
        }
        return [parseInt(faceValues[closestIndex]), closestIndex] || [1, 1];
    } else if (die.type === 'd10') {
        const geometry = die.mesh.geometry;
        const faceValues = ['', 1, 0, 2, 9, 3, 8, 4, 7, 5, 6];

        if (targetNumber != null && foundClosestIndex != null) {
          if (foundClosestIndex >= 0 && foundClosestIndex < faceValues.length) {
            faceValues[foundClosestIndex] = targetNumber === 0 ? 10 : targetNumber;
          }
        }
        
        for (let i = 0; i < geometry.groups.length; i++) {
            const group = geometry.groups[i];
            if (group.materialIndex === 0) continue;
            const position = geometry.attributes.position;
            const startVertex = group.start;
            const v0 = new THREE.Vector3().fromBufferAttribute(position, startVertex);
            const v1 = new THREE.Vector3().fromBufferAttribute(position, startVertex + 1);
            const v2 = new THREE.Vector3().fromBufferAttribute(position, startVertex + 2);
            const faceNormal = new THREE.Vector3()
                .subVectors(v1, v0)
                .cross(new THREE.Vector3().subVectors(v2, v0))
                .normalize();
            const worldNormal = faceNormal.clone().applyQuaternion(die.mesh.quaternion);
            const dot = worldNormal.dot(up);
            if (dot > maxDot) {
                maxDot = dot;
                closestIndex = group.materialIndex;
            }
        }

        return [parseInt(faceValues[closestIndex]), closestIndex] || [0, 0];
    } else if (die.type === 'd100') {
        const geometry = die.mesh.geometry;

        let faceValues = [];

        if (die.isFirst) {
          faceValues = ['', 1, 0, 2, 9, 3, 8, 4, 7, 5, 6];
        } else {
          faceValues = ['', 10, '00', 20, 90, 30, 80, 40, 70, 50, 60];
        }

        if (targetNumber != null && foundClosestIndex != null) {
          const newTargetNumber = die.isFirst ? targetNumber % 10 : targetNumber - (targetNumber % 10) 
          if (foundClosestIndex >= 0 && foundClosestIndex < faceValues.length) {
            faceValues[foundClosestIndex] = newTargetNumber
          }
        }
        
        for (let i = 0; i < geometry.groups.length; i++) {
            const group = geometry.groups[i];
            if (group.materialIndex === 0) continue;
            const position = geometry.attributes.position;
            const startVertex = group.start;
            const v0 = new THREE.Vector3().fromBufferAttribute(position, startVertex);
            const v1 = new THREE.Vector3().fromBufferAttribute(position, startVertex + 1);
            const v2 = new THREE.Vector3().fromBufferAttribute(position, startVertex + 2);
            const faceNormal = new THREE.Vector3()
                .subVectors(v1, v0)
                .cross(new THREE.Vector3().subVectors(v2, v0))
                .normalize();
            const worldNormal = faceNormal.clone().applyQuaternion(die.mesh.quaternion);
            const dot = worldNormal.dot(up);
            if (dot > maxDot) {
                maxDot = dot;
                closestIndex = group.materialIndex;
            }
        }

        return [parseInt(faceValues[closestIndex]), closestIndex] || [0, 0];
    }
    
    return [1, 1]; // Default fallback
}
