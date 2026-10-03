/**
 * Deep teal under pale mint vines that glow softly from every edge midpoint, with brighter
 * glowing mint numerals, silver edges and a vignette that sinks the face edges.
 */
export default {
    id: 'witchlight-vines',
    name: 'Witchlight Vines',
    family: 'textured',
    body: {
        color: '#0F3B3A',
        depthColor: '#07201F',
        roughness: 0.4,
        clearcoat: 0.5,
        clearcoatRoughness: 0.1,
        vignette: 0.6,
        texture: { kind: 'noise', color2: '#1B5A58', scale: 3, contrast: 0.2 },
    },
    edge: { metal: 'silver' },
    numeral: { color: '#CDEFEB', style: 'glow', glow: { color: '#CDEFEB', intensity: 1.6 } },
    decor: { art: 'vines', color: '#9FDCD2', relief: 0.3, glow: 0.6 },
    swatch: ['#0F3B3A', '#CDEFEB'],
};
