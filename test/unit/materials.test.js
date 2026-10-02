import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { METALS, FAMILY_DEFAULTS, createEdgeMaterial, createFaceMaterial } from '../../src/sets/materials.js';
import { GEM, INLAY, GLOW, NO_EDGE } from './helpers/sets.js';

const tex = () => new THREE.Texture();

describe('material recipes', () => {
    it('ships the four metals and four families from the spec', () => {
        expect(Object.keys(METALS)).toEqual(['gold', 'silver', 'bronze', 'iron']);
        expect(METALS.gold).toEqual({ color: '#D4AF37', roughness: 0.28, metalness: 1, envMapIntensity: 1.0 });
        expect(Object.keys(FAMILY_DEFAULTS)).toEqual(['gem', 'glass', 'metal', 'textured']);
        expect(FAMILY_DEFAULTS.textured).toEqual({ roughness: 0.55, metalness: 0, clearcoat: 0, clearcoatRoughness: 0, depthGradient: false });
    });

    it('edge material is the metal preset, flat shaded, with no maps', () => {
        const m = createEdgeMaterial(GEM);
        expect(m).toBeInstanceOf(THREE.MeshPhysicalMaterial);
        expect(m.color.getHexString()).toBe('d4af37');
        expect(m.roughness).toBe(0.28);
        expect(m.metalness).toBe(1);
        expect(m.envMapIntensity).toBe(1.0);
        expect(m.flatShading).toBe(true);
        expect(m.map).toBeNull();
    });

    it("edge 'none' uses the body recipe with the supplied blank albedo", () => {
        const blank = tex();
        const m = createEdgeMaterial(NO_EDGE, blank);
        expect(m.map).toBe(blank);
        expect(m.metalness).toBe(0);
        expect(m.roughness).toBe(0.16);
        expect(m.clearcoat).toBe(1);
    });

    it('face material carries recipe values and white multiplier colour', () => {
        const map = tex();
        const m = createFaceMaterial(GEM, { map });
        expect(m).toBeInstanceOf(THREE.MeshPhysicalMaterial);
        expect(m.map).toBe(map);
        expect(m.color.getHexString()).toBe('ffffff');
        expect(m.roughness).toBe(0.16);
        expect(m.metalness).toBe(0);
        expect(m.clearcoat).toBe(1);
        expect(m.clearcoatRoughness).toBe(0.06);
        expect(m.flatShading).toBe(true);
        expect(m.emissive.getHexString()).toBe('ff2d55');
        expect(m.emissiveIntensity).toBe(0.18);
        expect(m.emissiveMap).toBeNull();
    });

    it('an MR map takes over roughness and metalness', () => {
        const mr = tex();
        const m = createFaceMaterial(INLAY, { map: tex(), mr });
        expect(m.roughnessMap).toBe(mr);
        expect(m.metalnessMap).toBe(mr);
        expect(m.roughness).toBe(1);
        expect(m.metalness).toBe(1);
    });

    it('an emissive map means white emissive at the glow intensity', () => {
        const emissive = tex();
        const m = createFaceMaterial(GLOW, { map: tex(), emissive });
        expect(m.emissiveMap).toBe(emissive);
        expect(m.emissive.getHexString()).toBe('ffffff');
        expect(m.emissiveIntensity).toBe(1.6);
    });

    it('a normal map is attached with unit normalScale', () => {
        const normal = tex();
        const m = createFaceMaterial(GEM, { map: tex(), normal });
        expect(m.normalMap).toBe(normal);
        expect(m.normalScale.x).toBe(1);
        expect(m.normalScale.y).toBe(1);
    });
});
