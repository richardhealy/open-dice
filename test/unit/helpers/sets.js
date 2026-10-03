/** Hand-resolved set objects shaped exactly like validateSet's output. */
export const GEM = Object.freeze({
    id: 'test-gem', name: 'Test Gem', family: 'gem',
    body: { color: '#B5173A', depthColor: '#5A0A1C', roughness: 0.16, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06,
            glow: { color: '#FF2D55', intensity: 0.18 }, emissive: null, vignette: 0.85,
            texture: { kind: 'veins', color2: '#E84A6F', scale: 3, contrast: 0.25, perFace: false },
            image: null, normalImage: null, normalStrength: 0, envMapIntensity: 1 },
    edge: { metal: 'gold' },
    numeral: { font: 'OpenDiceNumerals', weight: 700, color: '#2A0912', style: 'engraved', metal: null, glow: null, scale: 1 },
    decor: [{ art: 'filigree', image: null, metal: 'gold', color: null, relief: 0.6, scale: 1, glow: 0 }],
    emblems: null,
    swatch: ['#B5173A', '#D4AF37'],
});

export const INLAY = Object.freeze({
    id: 'test-inlay', name: 'Test Inlay', family: 'glass',
    body: { color: '#0B0B10', depthColor: '#000000', roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04,
            glow: null, emissive: null, vignette: 0.85,
            texture: { kind: 'marble', color2: '#2A2A33', scale: 2, contrast: 0.35, perFace: false },
            image: null, normalImage: null, normalStrength: 0, envMapIntensity: 1 },
    edge: { metal: 'gold' },
    numeral: { font: 'OpenDiceNumerals', weight: 700, color: '#D4AF37', style: 'inlay', metal: 'gold', glow: null, scale: 1.05 },
    decor: null,
    emblems: null,
    swatch: ['#0B0B10', '#D4AF37'],
});

export const GLOW = Object.freeze({
    id: 'test-glow', name: 'Test Glow', family: 'textured',
    body: { color: '#2A1410', depthColor: '#2A1410', roughness: 0.55, metalness: 0, clearcoat: 0, clearcoatRoughness: 0,
            glow: null, emissive: null, vignette: 0,
            texture: { kind: 'scales', color2: '#120807', scale: 4, contrast: 0.7, perFace: false },
            image: null, normalImage: null, normalStrength: 0.8, envMapIntensity: 1 },
    edge: { metal: 'iron' },
    numeral: { font: 'OpenDiceNumerals', weight: 700, color: '#FF7A1A', style: 'glow', metal: null, glow: { color: '#FF7A1A', intensity: 1.6 }, scale: 1 },
    decor: null,
    emblems: null,
    swatch: ['#2A1410', '#FF7A1A'],
});

export const NO_EDGE = Object.freeze({ ...GEM, id: 'test-no-edge', edge: { metal: 'none' }, decor: null });

/** Pour marble seeded per face, with a soft vignette, gold frame decor and gold inlay numerals. */
export const POUR = Object.freeze({
    id: 'test-pour', name: 'Test Pour', family: 'textured',
    body: { color: '#1B2B4A', depthColor: '#0C1526', roughness: 0.35, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.1,
            glow: null, emissive: null, vignette: 0.3,
            texture: { kind: 'pour', palette: ['#2F5BA8', '#EEE4D2', '#D9A441', '#B23A2E'], warp: 4, scale: 3,
                       lacing: { color: '#FFF4E0', width: 0.02 }, color2: null, contrast: 0.3, perFace: true },
            image: null, normalImage: null, normalStrength: 0.3, envMapIntensity: 1 },
    edge: { metal: 'gold' },
    numeral: { font: 'OpenDiceNumerals', weight: 700, color: '#D4AF37', style: 'inlay', metal: 'gold', glow: null, scale: 1 },
    decor: [{ art: 'frame', image: null, metal: 'gold', color: null, relief: 0.5, scale: 1, glow: 0 }],
    emblems: null,
    swatch: ['#1B2B4A', '#D4AF37'],
});

/** Circuit traces that glow under brighter glow numerals set in the monospace family. */
export const CIRCUIT = Object.freeze({
    id: 'test-circuit', name: 'Test Circuit', family: 'textured',
    body: { color: '#06100A', depthColor: '#06100A', roughness: 0.5, metalness: 0, clearcoat: 0, clearcoatRoughness: 0,
            glow: null, emissive: { color: '#3CFF78', intensity: 0.35 }, vignette: 0,
            texture: { kind: 'circuit', color2: '#3CFF78', density: 40, grid: 12, contrast: 0.6, scale: 3, perFace: false },
            image: null, normalImage: null, normalStrength: 0.4, envMapIntensity: 1 },
    edge: { metal: 'iron' },
    numeral: { font: 'OpenDiceMono', weight: 400, color: '#3CFF78', style: 'glow', metal: null, glow: { color: '#3CFF78', intensity: 1.6 }, scale: 1 },
    decor: null,
    emblems: null,
    swatch: ['#06100A', '#3CFF78'],
});

/** A flat-colour vine decoration that glows, dimmer than the glow numerals. */
export const VINES = Object.freeze({
    id: 'test-vines', name: 'Test Vines', family: 'textured',
    body: { color: '#0F3B3A', depthColor: '#07201F', roughness: 0.4, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.1,
            glow: null, emissive: null, vignette: 0.6,
            texture: { kind: 'noise', color2: '#1B5A58', scale: 3, contrast: 0.2, perFace: false },
            image: null, normalImage: null, normalStrength: 0, envMapIntensity: 1 },
    edge: { metal: 'silver' },
    numeral: { font: 'OpenDiceNumerals', weight: 700, color: '#CDEFEB', style: 'glow', metal: null, glow: { color: '#CDEFEB', intensity: 1.6 }, scale: 1 },
    decor: [{ art: 'vines', image: null, metal: null, color: '#CDEFEB', relief: 0.3, scale: 1, glow: 0.6 }],
    emblems: null,
    swatch: ['#0F3B3A', '#CDEFEB'],
});

/** The gem with a gold sunburst on 20 and a numeral-coloured skull on 1. */
export const EMBLEM = Object.freeze({
    ...GEM, id: 'test-emblem', name: 'Test Emblem',
    emblems: {
        '20': { art: 'sunburst', metal: 'gold', color: null, scale: 0.9, relief: 0.5 },
        '1': { art: 'skull', metal: null, color: '#2A0912', scale: 0.8, relief: 0.5 },
    },
});

export const BODY_IMAGE_SRC = 'https://example.test/marble.jpg';
export const DECOR_IMAGE_SRC = 'https://example.test/filigree.png';

/** The inlay set with an image body and an alpha-PNG decoration painted as gold. */
export const IMAGE = Object.freeze({
    ...INLAY, id: 'test-image', name: 'Test Image',
    body: { ...INLAY.body, image: { src: BODY_IMAGE_SRC, fit: 'cover', scale: 1 } },
    decor: [{ art: null, image: { src: DECOR_IMAGE_SRC }, metal: 'gold', color: null, relief: 0.6, scale: 1, glow: 0 }],
});

export const NORMAL_IMAGE_SRC = 'https://example.test/marble-normal.png';

/** The circuit set with the glowing vines: numerals 1.6, body 0.35 and decor 0.6 share one material (Review Focus 5). */
export const GLOW_ALL = Object.freeze({
    ...CIRCUIT, id: 'test-glow-all', name: 'Test Glow All',
    decor: VINES.decor,
});
