import { describe, it, expect, vi, afterEach } from 'vitest';
import { createGltfModelLoader } from '../../src/gltf.js';
import { dieShape, shapeToGlb } from '../../src/models/shapes.js';

const glbResponse = (bytes) => ({ ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });

describe('createGltfModelLoader', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('fetches a GLB and resolves its scene', async () => {
        const fetch = vi.fn(async () => glbResponse(shapeToGlb(dieShape('d8'))));
        vi.stubGlobal('fetch', fetch);
        const load = createGltfModelLoader({ fetchOptions: { credentials: 'include' } });
        const scene = await load('https://cdn.example/dice/gem-d8.glb');
        expect(fetch).toHaveBeenCalledWith('https://cdn.example/dice/gem-d8.glb', { credentials: 'include' });
        const meshes = []; scene.traverse((o) => { if (o.isMesh) meshes.push(o.name); });
        expect(meshes).toEqual(['body']);
    });

    it('rejects on an HTTP error', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) })));
        await expect(createGltfModelLoader()('missing.glb')).rejects.toThrow(/404/);
    });

    it('rejects a file that is not glTF', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => glbResponse(new TextEncoder().encode('not a model at all'))));
        await expect(createGltfModelLoader()('bad.glb')).rejects.toThrow();
    });
});
