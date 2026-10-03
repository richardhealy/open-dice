import * as THREE from 'three';
import { ConvexGeometry } from './vendor.js';
import { buildHull, sphereDirections } from './hull.js';
import { writeGlb } from './glb.js';
import { MODEL_DIE_TYPES, CLASSIC_RADIUS } from './spec.js';
import { D4_GEOMETRY, D6_GEOMETRY, D8_GEOMETRY, D10_GEOMETRY, D12_GEOMETRY, D20_GEOMETRY } from '../geometry.js';

/**
 * Exact die shapes for hosts that want a texturing service (or an artist) to paint a die
 * whose geometry stays a fair polyhedron: export with shapeToGlb, paint, load the painted
 * file through the host's model loader and analyse it with analyzeModelDie.
 */

const GEOMETRY = { d4: D4_GEOMETRY, d6: D6_GEOMETRY, d8: D8_GEOMETRY, d10: D10_GEOMETRY, d12: D12_GEOMETRY, d20: D20_GEOMETRY };

/**
 * The classic polyhedron of `type` at the classic size, edges and corners rounded by
 * `rounding` (a share of the die's radius). A d4 stands on its base with a corner up.
 * `stopper: { radius, height }` stands a short cylinder on the highest point, for flasks.
 * @returns {THREE.Group} meshes named 'body' and, with a stopper, 'stopper'
 */
export function dieShape(type, { rounding = 0.06, stopper = null } = {}) {
    if (!MODEL_DIE_TYPES.includes(type)) throw new Error(`open-dice-dnd: dieShape needs a type: one of ${MODEL_DIE_TYPES.join(', ')}`);
    const R = CLASSIC_RADIUS[type];
    let corners = GEOMETRY[type].vertices.map((v) => new THREE.Vector3().fromArray(v).normalize().multiplyScalar(R));
    if (type === 'd4') {
        const q = new THREE.Quaternion().setFromUnitVectors(corners[0].clone().normalize(), new THREE.Vector3(0, 1, 0));
        corners = corners.map((c) => c.applyQuaternion(q));
    }
    const hull = buildHull(corners);
    const inradius = Math.min(...hull.faces.map((f, i) => hull.normals[i].dot(hull.points[f[0]])));
    const rho = Math.max(0, rounding) * R;
    // Corner spheres pulled in so the rounded faces lie on the original face planes.
    const inset = 1 - rho / inradius;
    const directions = rho > 0 ? sphereDirections(48) : [new THREE.Vector3()];
    const points = [];
    for (const c of corners) {
        const centre = c.clone().multiplyScalar(inset);
        for (const d of directions) points.push(centre.clone().addScaledVector(d, rho));
    }
    const group = new THREE.Group();
    const body = new THREE.Mesh(new ConvexGeometry(points), new THREE.MeshStandardMaterial({ color: 0xb8b8c0, roughness: 0.4 }));
    body.name = 'body';
    group.add(body);
    if (stopper) {
        const top = Math.max(...points.map((p) => p.y));
        const geometry = new THREE.CylinderGeometry(stopper.radius * 0.92, stopper.radius, stopper.height, 24).toNonIndexed();
        const cap = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.8 }));
        cap.name = 'stopper';
        // Seated a little into the top so the join has no gap.
        cap.position.y = top + stopper.height * 0.05;
        group.add(cap);
    }
    return group;
}

/**
 * A geometry-only GLB of every mesh under `object`, in the frame `object` sits in.
 * @returns {Uint8Array}
 */
export function shapeToGlb(object) {
    object.updateMatrixWorld(true);
    const toLocal = object.parent ? object.parent.matrixWorld.clone().invert() : new THREE.Matrix4();
    const primitives = [];
    object.traverse((o) => {
        if (!o.isMesh || !o.geometry) return;
        const geometry = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toLocal, o.matrixWorld));
        if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
        primitives.push({
            name: o.name || `mesh${primitives.length}`,
            position: Float32Array.from(geometry.getAttribute('position').array),
            normal: Float32Array.from(geometry.getAttribute('normal').array),
        });
        geometry.dispose();
    });
    return writeGlb(primitives);
}
