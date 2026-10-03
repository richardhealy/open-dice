/**
 * Dusty pink felt: matte (roughness 1, no clearcoat) with a soft vignette, darker rose corner
 * florets painted flat, engraved plum numerals and no metal on the edges.
 */
export default {
    id: 'rose-felt',
    name: 'Rose Felt',
    family: 'textured',
    body: {
        color: '#E8B4C0',
        depthColor: '#8A4A5C',
        roughness: 1,
        clearcoat: 0,
        vignette: 0.45,
        texture: { kind: 'felt', contrast: 0.3 },
        normalStrength: 0.25,
    },
    edge: { metal: 'none' },
    numeral: { color: '#2E0E26', style: 'engraved' },
    decor: { art: 'corners', color: '#9E4A5E', relief: 0.3 },
    swatch: ['#E8B4C0', '#2E0E26'],
};
