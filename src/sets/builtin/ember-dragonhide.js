/** Dark scaled hide with iron edges and numerals that glow like embers. */
export default {
    id: 'ember-dragonhide',
    name: 'Ember Dragonhide',
    family: 'textured',
    body: {
        color: '#2A1410',
        texture: { kind: 'scales', color2: '#120807', scale: 4, contrast: 0.7 },
        normalStrength: 0.8,
    },
    edge: { metal: 'iron' },
    numeral: { color: '#FF7A1A', style: 'glow', glow: { color: '#FF7A1A', intensity: 1.6 } },
    decor: null,
    swatch: ['#2A1410', '#FF7A1A'],
};
