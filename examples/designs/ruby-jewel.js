import { crown, svgDataUrl } from './decal-art.js';

/** Translucent ruby under a gold filigree cage, engraved dark serif numerals. */
export default {
    id: 'ruby-jewel',
    name: 'Ruby Jewel',
    family: 'gem',
    body: {
        color: '#B5173A',
        depthColor: '#5A0A1C',
        // Lighter clearcoat and environment than the family default: faces seen at grazing
        // angles otherwise mirror the room and wash the gem out to pastel.
        clearcoat: 0.7,
        envMapIntensity: 0.55,
        glow: { color: '#FF2D55', intensity: 0.18 },
        texture: { kind: 'veins', color2: '#E84A6F', scale: 3, contrast: 0.25 },
    },
    edge: { metal: 'gold' },
    numeral: { color: '#F8E9C8', style: 'engraved' },   // cream: dark numerals vanished on the deep body
    decor: { art: 'filigree', metal: 'gold', relief: 0.6 },
    // The "20" carries a mark instead of its numeral, as an ordinary decal (any host can override it).
    decals: { d20: { '20': { src: svgDataUrl(crown('#C21841')), scale: 0.79 } } },
    swatch: ['#B5173A', '#D4AF37'],
};
