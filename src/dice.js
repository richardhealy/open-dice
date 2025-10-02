
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { diceMaterial, world } from './physics.js';
import { scene } from './scene.js';
import { D4_GEOMETRY, D6_GEOMETRY, D8_GEOMETRY, D10_GEOMETRY, D12_GEOMETRY, D20_GEOMETRY } from './geometry.js';
import { createD4Mesh, createD4Body } from './dice-models/d4.js';
import { createD6Mesh } from './dice-models/d6.js';
import { createD8Mesh, createD8Body } from './dice-models/d8.js';
import { createD10Mesh, createD10Body } from './dice-models/d10.js';
import { createD12Mesh, createD12Body } from './dice-models/d12.js';
import { createD20Mesh, createD20Body } from './dice-models/d20.js';

export function createDie(type, visible = true, targetNumber, foundClosestIndex) {
    let mesh, body;
    const size = 1;
    switch (type) {
        case 'd4':
            mesh = createD4Mesh(size, targetNumber, foundClosestIndex);
            body = createD4Body(size, diceMaterial);
            break;
        case 'd6':
            mesh = createD6Mesh(size, targetNumber, foundClosestIndex);
            body = new CANNON.Body({ mass: 1, shape: new CANNON.Box(new CANNON.Vec3(size / 2, size / 2, size / 2)), material: diceMaterial });
            break;
        case 'd8':
            mesh = createD8Mesh(size, targetNumber, foundClosestIndex);
            body = createD8Body(size, diceMaterial);
            break;
        case 'd10':
            mesh = createD10Mesh(size, targetNumber, foundClosestIndex);
            body = createD10Body(size, diceMaterial);
            break;
        case 'd12':
            mesh = createD12Mesh(size, targetNumber, foundClosestIndex);
            body = createD12Body(size, diceMaterial);
            break;
        case 'd20':
            mesh = createD20Mesh(size, targetNumber, foundClosestIndex);
            body = createD20Body(size, diceMaterial);
            break;
        default:
            mesh = createD6Mesh(size);
            body = new CANNON.Body({ mass: 1, shape: new CANNON.Box(new CANNON.Vec3(size / 2, size / 2, size / 2)), material: diceMaterial });
            break;
    }
    if (visible)
      mesh.castShadow = true;
    else 
      mesh.visible = false
    scene.add(mesh);
    world.addBody(body);
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
        const faceValues = D12_GEOMETRY.faceValues || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

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
        const faceValues = ['', 1, 10, 2, 9, 3, 8, 4, 7, 5, 6];

        if (targetNumber != null && foundClosestIndex != null) {
          if (foundClosestIndex >= 0 && foundClosestIndex < faceValues.length) {
            faceValues[foundClosestIndex] = targetNumber;
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
