/**
 * A near-black green board etched with circuit traces that glow faintly under brighter
 * monospace numerals; iron edges and no decoration.
 */
export default {
    id: 'mainframe',
    name: 'Mainframe',
    family: 'textured',
    body: {
        color: '#06100A',
        roughness: 0.5,
        texture: { kind: 'circuit', color2: '#3CFF78', density: 10, grid: 12, contrast: 0.4 },
        emissive: { color: '#3CFF78', intensity: 0.35 },
        normalStrength: 0.4,
    },
    edge: { metal: 'iron' },
    numeral: { font: 'OpenDiceMono', weight: 400, color: '#3CFF78', style: 'glow', glow: { color: '#3CFF78', intensity: 1.6 } },
    decor: null,
    swatch: ['#06100A', '#3CFF78'],
};
