import { crown, svgDataUrl } from './decal-art.js';

/** Emerald palette variant of Ruby Jewel. */
export default {
    id: 'emerald-jewel',
    name: 'Emerald Jewel',
    family: 'gem',
    body: {
        color: '#0F8A4A',
        depthColor: '#063B22',
        // Lighter clearcoat and environment than the family default: faces seen at grazing
        // angles otherwise mirror the room and wash the gem out to pastel.
        clearcoat: 0.7,
        envMapIntensity: 0.55,
        glow: { color: '#2AE38A', intensity: 0.16 },
        texture: { kind: 'veins', color2: '#4FD08A', scale: 3, contrast: 0.25 },
    },
    edge: { metal: 'gold' },
    numeral: { color: '#F8E9C8', style: 'engraved' },   // cream: dark numerals vanished on the deep body
    decor: { art: 'filigree', metal: 'gold', relief: 0.6 },
    // The "20" carries a mark instead of its numeral, as an ordinary decal (any host can override it).
    decals: { d20: { '20': { src: svgDataUrl(crown('#13A35A')), scale: 0.79 } } },
    swatch: ['#0F8A4A', '#D4AF37'],
};
