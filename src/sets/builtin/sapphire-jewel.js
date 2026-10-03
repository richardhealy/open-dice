/** Sapphire palette variant of Ruby Jewel. */
export default {
    id: 'sapphire-jewel',
    name: 'Sapphire Jewel',
    family: 'gem',
    body: {
        color: '#1C4FD6',
        depthColor: '#0A1F5C',
        // Lighter clearcoat and environment than the family default: faces seen at grazing
        // angles otherwise mirror the room and wash the gem out to pastel.
        clearcoat: 0.7,
        envMapIntensity: 0.55,
        glow: { color: '#3B7BFF', intensity: 0.16 },
        texture: { kind: 'veins', color2: '#5B8CFF', scale: 3, contrast: 0.25 },
    },
    edge: { metal: 'gold' },
    numeral: { color: '#F8E9C8', style: 'engraved' },   // cream: dark numerals vanished on the deep body
    decor: { art: 'filigree', metal: 'gold', relief: 0.6 },
    swatch: ['#1C4FD6', '#D4AF37'],
};
