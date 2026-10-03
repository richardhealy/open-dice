import { sunburst, svgDataUrl } from './decal-art.js';

/**
 * Rosewood grain: a low-warp pour through dark brown, red-brown and amber under a gold
 * knotwork braid, with engraved cream numerals, gold edges and a gold sunburst on the 20.
 */
export default {
    id: 'rosewood-knotwork',
    name: 'Rosewood Knotwork',
    family: 'textured',
    body: {
        color: '#3B1A12',
        depthColor: '#1E0C08',
        // Oiled and polished wood: a soft clearcoat over a satin roughness.
        roughness: 0.35,
        clearcoat: 0.5,
        clearcoatRoughness: 0.15,
        vignette: 0.25,
        texture: { kind: 'pour', palette: ['#2A120C', '#6B2A1E', '#B5652A'], warp: 1.5, scale: 4 },
        normalStrength: 0.2,
    },
    edge: { metal: 'gold' },
    numeral: { color: '#F3E3C3', style: 'engraved' },
    decor: { art: 'knotwork', metal: 'gold', relief: 0.6 },
    // The "20" carries a mark instead of its numeral, as an ordinary decal (any host can override it).
    decals: { d20: { '20': { src: svgDataUrl(sunburst()), scale: 0.78 } } },
    swatch: ['#6B2A1E', '#D4AF37'],
};
