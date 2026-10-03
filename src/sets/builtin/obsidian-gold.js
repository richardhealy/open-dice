/** Black glass with gold inlaid numerals and gold edges. No decoration: the numerals are the jewellery. */
export default {
    id: 'obsidian-gold',
    name: 'Obsidian & Gold',
    family: 'glass',
    body: {
        color: '#0B0B10',
        depthColor: '#000000',
        texture: { kind: 'marble', color2: '#2A2A33', scale: 2, contrast: 0.35 },
    },
    edge: { metal: 'gold' },
    numeral: { color: '#D4AF37', style: 'inlay', metal: 'gold', scale: 1.05 },
    decor: null,
    swatch: ['#0B0B10', '#D4AF37'],
};
