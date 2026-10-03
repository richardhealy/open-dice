/**
 * Poured paint in navy, cream, gold and rust, laced with cream and seeded per face so no two
 * faces share a swirl; a gold frame and engraved gold numerals finish it.
 */
export default {
    id: 'tidepool-pour',
    name: 'Tidepool Pour',
    family: 'textured',
    body: {
        color: '#1B2B4A',
        depthColor: '#0C1526',
        // Lacquered paint rather than raw cloth: a light clearcoat over a mid roughness.
        roughness: 0.3,
        clearcoat: 0.6,
        clearcoatRoughness: 0.1,
        vignette: 0.3,
        texture: {
            kind: 'pour',
            palette: ['#2F5BA8', '#EEE4D2', '#D9A441', '#B23A2E'],
            warp: 3,
            scale: 2,
            lacing: { color: '#FFF4E0', width: 0.02 },
            perFace: true,
        },
        normalStrength: 0.3,
    },
    edge: { metal: 'gold' },
    numeral: { color: '#D4AF37', style: 'engraved', scale: 1.1 },
    decor: { art: 'frame', metal: 'gold', relief: 0.5 },
    swatch: ['#2F5BA8', '#EEE4D2', '#D4AF37'],
};
