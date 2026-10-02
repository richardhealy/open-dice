import * as THREE from 'three';

/** Metal presets shared by edges, decoration and inlay numerals. */
export const METALS = Object.freeze({
    gold:   Object.freeze({ color: '#D4AF37', roughness: 0.28, metalness: 1, envMapIntensity: 1.2 }),
    silver: Object.freeze({ color: '#C9CDD3', roughness: 0.22, metalness: 1, envMapIntensity: 1.2 }),
    bronze: Object.freeze({ color: '#B07A3A', roughness: 0.35, metalness: 1, envMapIntensity: 1.1 }),
    iron:   Object.freeze({ color: '#5C5F66', roughness: 0.50, metalness: 1, envMapIntensity: 1.0 }),
});

/** Body recipe defaults per family; every value can be overridden in a set definition. */
export const FAMILY_DEFAULTS = Object.freeze({
    gem:      Object.freeze({ roughness: 0.16, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06, depthGradient: true }),
    glass:    Object.freeze({ roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04, depthGradient: true }),
    metal:    Object.freeze({ roughness: 0.30, metalness: 1, clearcoat: 0, clearcoatRoughness: 0,    depthGradient: false }),
    textured: Object.freeze({ roughness: 0.55, metalness: 0, clearcoat: 0, clearcoatRoughness: 0,    depthGradient: false }),
});

/**
 * Material for material index 0: the chamfer bevels (and the d10/d100 belt). A metal
 * preset, or the body recipe over a blank face albedo when `edge.metal` is 'none'.
 */
export function createEdgeMaterial(set, blankMap = null) {
    const metal = set.edge && set.edge.metal !== 'none' ? METALS[set.edge.metal] : null;
    if (metal) {
        return new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(metal.color),
            roughness: metal.roughness,
            metalness: metal.metalness,
            envMapIntensity: metal.envMapIntensity,
            flatShading: true,
        });
    }
    return createFaceMaterial(set, { map: blankMap });
}

/**
 * Material for a face. The albedo carries the colour, so the multiplier stays white. When
 * an MR map is present the scalar roughness/metalness are 1 and the map carries the values
 * (three reads roughness from G and metalness from B).
 * @param {{ map: THREE.Texture|null, mr?: THREE.Texture|null, emissive?: THREE.Texture|null, normal?: THREE.Texture|null }} maps
 */
export function createFaceMaterial(set, maps) {
    const body = set.body;
    const params = {
        color: new THREE.Color('#ffffff'),
        map: maps.map || null,
        roughness: maps.mr ? 1 : body.roughness,
        metalness: maps.mr ? 1 : body.metalness,
        clearcoat: body.clearcoat,
        clearcoatRoughness: body.clearcoatRoughness,
        envMapIntensity: body.envMapIntensity,
        flatShading: true,
    };
    if (maps.mr) {
        params.roughnessMap = maps.mr;
        params.metalnessMap = maps.mr;
    }
    if (maps.normal) {
        params.normalMap = maps.normal;
        params.normalScale = new THREE.Vector2(1, 1);
    }
    const material = new THREE.MeshPhysicalMaterial(params);
    if (maps.emissive) {
        material.emissiveMap = maps.emissive;
        material.emissive = new THREE.Color('#ffffff');
        material.emissiveIntensity = set.numeral.glow ? set.numeral.glow.intensity : 1;
    } else if (body.glow) {
        material.emissive = new THREE.Color(body.glow.color);
        material.emissiveIntensity = body.glow.intensity;
    }
    return material;
}
