import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { D10_GEOMETRY, D10_BELT_MATERIAL_INDEX, getChamferGeometry, makeGeometry } from '../../src/geometry.js';

function buildD10() {
    const vectors = D10_GEOMETRY.vertices.map((v) => new THREE.Vector3().fromArray(v).normalize());
    const chamfer = getChamferGeometry(vectors, D10_GEOMETRY.faces, 0.945);
    return makeGeometry(chamfer.vectors, chamfer.faces, 0.9, 0, (Math.PI * 6) / 5);
}

function groupNormal(geometry, group) {
    const p = geometry.attributes.position;
    const a = new THREE.Vector3().fromBufferAttribute(p, group.start);
    const b = new THREE.Vector3().fromBufferAttribute(p, group.start + 1);
    const c = new THREE.Vector3().fromBufferAttribute(p, group.start + 2);
    return new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
}

describe('d10 / d100 geometry: what the edge metal may cover', () => {
    it('kite faces are triangles whose lower half is the coplanar belt triangle', () => {
        expect(D10_GEOMETRY.faces[0]).toHaveLength(4);                 // 3 vertices + marker
        const geom = buildD10();
        const kite = geom.groups.find((g) => g.materialIndex === 1);
        const belts = geom.groups.filter((g) => g.materialIndex === D10_BELT_MATERIAL_INDEX);
        const kn = groupNormal(geom, kite);
        expect(belts.some((b) => groupNormal(geom, b).dot(kn) > 0.9999)).toBe(true);
    });

    it('no edge-metal (index 0) triangle lies in a kite plane', () => {
        const geom = buildD10();
        const kiteNormals = geom.groups
            .filter((g) => g.materialIndex >= 1 && g.materialIndex <= 10)
            .map((g) => groupNormal(geom, g));
        const offenders = geom.groups
            .filter((g) => g.materialIndex === 0)
            .filter((g) => { const n = groupNormal(geom, g); return kiteNormals.some((k) => Math.abs(n.dot(k)) > 0.9999); });
        expect(offenders).toHaveLength(0);
    });

    it('the belt slot holds the ten belt triangles and the ten bevel quads inside kite planes', () => {
        const geom = buildD10();
        const belt = geom.groups.filter((g) => g.materialIndex === D10_BELT_MATERIAL_INDEX);
        expect(belt).toHaveLength(10 + 10 * 2);
    });
});
