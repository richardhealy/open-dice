
import * as THREE from 'three';

export const D4_GEOMETRY = (() => {
    const vertices = [[1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1]];
    const faces = [[1, 0, 2, 1], [0, 1, 3, 2], [0, 3, 2, 3], [1, 2, 3, 4]];
    const faceValues = ['', 1, 2, 3, 4];
    return { vertices, faces, faceValues };
})();

export const D6_GEOMETRY = (() => {
    const vertices = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
    [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
    const faces = [[0, 3, 2, 1, 1], [1, 2, 6, 5, 2], [0, 1, 5, 4, 3],
    [3, 7, 6, 2, 4], [0, 4, 7, 3, 5], [4, 5, 6, 7, 6]];
    const faceValues = ['', 1, 2, 3, 4, 5, 6];
    return { vertices, faces, faceValues };
})();

export const D8_GEOMETRY = (() => {
    const vertices = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    const faces = [[0, 2, 4, 1], [0, 4, 3, 2], [0, 3, 5, 3], [0, 5, 2, 4], [1, 3, 4, 5],
    [1, 4, 2, 6], [1, 2, 5, 7], [1, 5, 3, 8]];
    const faceValues = ['', 1, 2, 3, 4, 5, 6, 7, 8];
    return { vertices, faces, faceValues };
})();

export const D10_GEOMETRY = (() => {
    const vertices = [];
    const faces = [[5, 7, 11, 0], [4, 2, 10, 1], [1, 3, 11, 2], [0, 8, 10, 3], [7, 9, 11, 4],
    [8, 6, 10, 5], [9, 1, 11, 6], [2, 0, 10, 7], [3, 5, 11, 8], [6, 4, 10, 9],
    [1, 0, 2, -1], [1, 2, 3, -1], [3, 2, 4, -1], [3, 4, 5, -1], [5, 4, 6, -1],
    [5, 6, 7, -1], [7, 6, 8, -1], [7, 8, 9, -1], [9, 8, 0, -1], [9, 0, 1, -1]];

    for (let i = 0, b = 0; i < 10; ++i, b += Math.PI * 2 / 10) {
        vertices.push([Math.cos(b), Math.sin(b), 0.105 * (i % 2 ? 1 : -1)]);
    }
    vertices.push([0, 0, -1]);
    vertices.push([0, 0, 1]);

    const faceValues = ['', 1, 10, 2, 9, 3, 8, 4, 7, 5, 6];
    return { vertices, faces, faceValues };
})();

export const D12_GEOMETRY = (() => {
    const p = (1 + Math.sqrt(5)) / 2;
    const q = 1 / p;
    
    const vertices = [
        [0, q, p], [0, q, -p], [0, -q, p], [0, -q, -p], [p, 0, q],
        [p, 0, -q], [-p, 0, q], [-p, 0, -q], [q, p, 0], [q, -p, 0], [-q, p, 0],
        [-q, -p, 0], [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, 1, 1],
        [-1, 1, -1], [-1, -1, 1], [-1, -1, -1]
    ];
    
    const faces = [[2, 14, 4, 12, 0, 1], [15, 9, 11, 19, 3, 2], [16, 10, 17, 7, 6, 3], [6, 7, 19, 11, 18, 4],
    [6, 18, 2, 0, 16, 5], [18, 11, 9, 14, 2, 6], [1, 17, 10, 8, 13, 7], [1, 13, 5, 15, 3, 8],
    [13, 8, 12, 4, 5, 9], [5, 4, 14, 9, 15, 10], [0, 12, 8, 10, 16, 11], [3, 19, 7, 17, 1, 12]];
    
    const faceValues = ['', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    return { vertices, faces, faceValues };
})();


export const D20_GEOMETRY = (() => {
    const t = (1 + Math.sqrt(5)) / 2;
    const vertices = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
    const faces = [[0, 11, 5, 1], [0, 5, 1, 2], [0, 1, 7, 3], [0, 7, 10, 4], [0, 10, 11, 5],
    [1, 5, 9, 6], [5, 11, 4, 7], [11, 10, 2, 8], [10, 7, 6, 9], [7, 1, 8, 10],
    [3, 9, 4, 11], [3, 4, 2, 12], [3, 2, 6, 13], [3, 6, 8, 14], [3, 8, 9, 15],
    [4, 9, 5, 16], [2, 4, 11, 17], [6, 2, 10, 18], [8, 6, 7, 19], [9, 8, 1, 20]];
    const faceValues = ['', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    return { vertices, faces, faceValues };
})();

export function getChamferGeometry(vectors, faces, chamfer) {
    let chamfer_vectors = [], chamfer_faces = [], corner_faces = new Array(vectors.length);
    for (let i = 0; i < vectors.length; ++i) corner_faces[i] = [];
    for (let i = 0; i < faces.length; ++i) {
        let ii = faces[i], fl = ii.length - 1;
        let center_point = new THREE.Vector3();
        let face = new Array(fl);
        for (let j = 0; j < fl; ++j) {
            let vv = vectors[ii[j]].clone();
            center_point.add(vv);
            corner_faces[ii[j]].push(face[j] = chamfer_vectors.push(vv) - 1);
        }
        center_point.divideScalar(fl);
        for (let j = 0; j < fl; ++j) {
            let vv = chamfer_vectors[face[j]];
            vv.subVectors(vv, center_point).multiplyScalar(chamfer).addVectors(vv, center_point);
        }
        face.push(ii[fl]);
        chamfer_faces.push(face);
    }
    for (let i = 0; i < faces.length - 1; ++i) {
        for (let j = i + 1; j < faces.length; ++j) {
            let pairs = [], lastm = -1;
            for (let m = 0; m < faces[i].length - 1; ++m) {
                let n = faces[j].indexOf(faces[i][m]);
                if (n >= 0 && n < faces[j].length - 1) {
                    if (lastm >= 0 && m !== lastm + 1) pairs.unshift([i, m], [j, n]);
                    else pairs.push([i, m], [j, n]);
                    lastm = m;
                }
            }
            if (pairs.length !== 4) continue;
            chamfer_faces.push([chamfer_faces[pairs[0][0]][pairs[0][1]],
            chamfer_faces[pairs[1][0]][pairs[1][1]],
            chamfer_faces[pairs[3][0]][pairs[3][1]],
            chamfer_faces[pairs[2][0]][pairs[2][1]], -1]);
        }
    }
    for (let i = 0; i < corner_faces.length; ++i) {
        let cf = corner_faces[i], face = [cf[0]], count = cf.length - 1;
        while (count) {
            for (let m = faces.length; m < chamfer_faces.length; ++m) {
                let index = chamfer_faces[m].indexOf(face[face.length - 1]);
                if (index >= 0 && index < 4) {
                    if (--index === -1) index = 3;
                    let next_vertex = chamfer_faces[m][index];
                    if (cf.indexOf(next_vertex) >= 0) {
                        face.push(next_vertex);
                        break;
                    }
                }
            }
            --count;
        }
        face.push(-1);
        chamfer_faces.push(face);
    }
    return { vectors: chamfer_vectors, faces: chamfer_faces };
}

export function makeGeometry(vertices, faces, radius, tab, af) {
    let geom = new THREE.BufferGeometry();

    for (let i = 0; i < vertices.length; ++i) {
        vertices[i] = vertices[i].multiplyScalar(radius);
    }

    let positions = [];
    const normals = [];
    const uvs = [];

    const cb = new THREE.Vector3();
    const ab = new THREE.Vector3();
    let materialIndex;
    let faceFirstVertexIndex = 0;

    for (let i = 0; i < faces.length; ++i) {
        let ii = faces[i], fl = ii.length - 1;
        let aa = Math.PI * 2 / fl;
        materialIndex = ii[fl] + 1; // Material index for this face
        for (let j = 0; j < fl - 2; ++j) { // Triangulate faces

            // Vertices for the current triangle
            positions.push(...vertices[ii[0]].toArray());
            positions.push(...vertices[ii[j + 1]].toArray());
            positions.push(...vertices[ii[j + 2]].toArray());

            // Calculate flat face normals for lighting
            cb.subVectors( vertices[ii[j + 2]], vertices[ii[j + 1]] );
            ab.subVectors( vertices[ii[0]], vertices[ii[j + 1]] );
            cb.cross( ab );
            cb.normalize();

            // Add normals for each vertex of the triangle
            normals.push(...cb.toArray());
            normals.push(...cb.toArray());
            normals.push(...cb.toArray());

            // Add UV coordinates for texture mapping
            uvs.push((Math.cos(af) + 1 + tab) / 2 / (1 + tab), (Math.sin(af) + 1 + tab) / 2 / (1 + tab));
            uvs.push((Math.cos(aa * (j + 1) + af) + 1 + tab) / 2 / (1 + tab), (Math.sin(aa * (j + 1) + af) + 1 + tab) / 2 / (1 + tab));
            uvs.push((Math.cos(aa * (j + 2) + af) + 1 + tab) / 2 / (1 + tab), (Math.sin(aa * (j + 2) + af) + 1 + tab) / 2 / (1 + tab));
        }

        // Set Group for face materials, allowing different textures per face
        let numOfVertices = (fl - 2) * 3;
        for (let k = 0; k < numOfVertices/3; k++) {
          geom.addGroup(faceFirstVertexIndex, 3, materialIndex);
          faceFirstVertexIndex += 3;
        }
    }

    // Set attributes for the geometry
    geom.setAttribute( 'position', new THREE.Float32BufferAttribute( positions, 3 ) );
    geom.setAttribute( 'normal', new THREE.Float32BufferAttribute( normals, 3 ) );
    geom.setAttribute( 'uv', new THREE.Float32BufferAttribute( uvs, 2 ) );
    geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius);
    return geom;
}
