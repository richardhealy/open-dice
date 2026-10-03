/**
 * A geometry-only GLB writer: one node and mesh per primitive, each with POSITION and NORMAL,
 * no indices, materials or textures. Enough to hand a die shape to a texturing service.
 * @param {{ name: string, position: Float32Array, normal: Float32Array }[]} primitives
 * @returns {Uint8Array}
 */
export function writeGlb(primitives) {
    const chunks = [];
    const accessors = [], bufferViews = [], meshes = [], nodes = [];
    let offset = 0;
    const add = (array, count, minmax) => {
        const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
        const pad = (4 - (bytes.length % 4)) % 4;
        bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length });
        chunks.push(bytes);
        if (pad) chunks.push(new Uint8Array(pad));
        offset += bytes.length + pad;
        accessors.push({ bufferView: bufferViews.length - 1, componentType: 5126, count, type: 'VEC3', ...minmax });
        return accessors.length - 1;
    };
    primitives.forEach((p, i) => {
        const count = p.position.length / 3;
        const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        for (let k = 0; k < p.position.length; k++) {
            min[k % 3] = Math.min(min[k % 3], p.position[k]);
            max[k % 3] = Math.max(max[k % 3], p.position[k]);
        }
        const attributes = { POSITION: add(p.position, count, { min, max }), NORMAL: add(p.normal, count) };
        meshes.push({ name: p.name, primitives: [{ attributes, mode: 4 }] });
        nodes.push({ name: p.name, mesh: i });
    });
    const json = {
        asset: { version: '2.0', generator: 'open-dice-dnd' },
        scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }],
        nodes, meshes, accessors, bufferViews, buffers: [{ byteLength: offset }],
    };
    const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
    const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
    const total = 12 + 8 + jsonBytes.length + jsonPad + 8 + offset;
    const out = new Uint8Array(total);
    const view = new DataView(out.buffer);
    view.setUint32(0, 0x46546c67, true);                       // 'glTF'
    view.setUint32(4, 2, true);
    view.setUint32(8, total, true);
    view.setUint32(12, jsonBytes.length + jsonPad, true);
    view.setUint32(16, 0x4e4f534a, true);                      // 'JSON'
    out.set(jsonBytes, 20);
    out.fill(0x20, 20 + jsonBytes.length, 20 + jsonBytes.length + jsonPad);
    let o = 20 + jsonBytes.length + jsonPad;
    view.setUint32(o, offset, true);
    view.setUint32(o + 4, 0x004e4942, true);                   // 'BIN\0'
    o += 8;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
}
