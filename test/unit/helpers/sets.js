/** Hand-resolved set objects shaped exactly like validateSet's output. */
export const GEM = Object.freeze({
    id: 'test-gem', name: 'Test Gem', family: 'gem',
    body: { color: '#B5173A', depthColor: '#5A0A1C', roughness: 0.16, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06,
            glow: { color: '#FF2D55', intensity: 0.18 }, texture: { kind: 'veins', color2: '#E84A6F', scale: 3, contrast: 0.25 },
            normalStrength: 0, envMapIntensity: 1 },
    edge: { metal: 'gold' },
    numeral: { font: 'OpenDiceNumerals', weight: 700, color: '#2A0912', style: 'engraved', metal: null, glow: null, scale: 1 },
    decor: [{ art: 'filigree', image: null, metal: 'gold', color: null, relief: 0.6, scale: 1, glow: 0 }],
    swatch: ['#B5173A', '#D4AF37'],
});

export const INLAY = Object.freeze({
    id: 'test-inlay', name: 'Test Inlay', family: 'glass',
    body: { color: '#0B0B10', depthColor: '#000000', roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04,
            glow: null, texture: { kind: 'marble', color2: '#2A2A33', scale: 2, contrast: 0.35 }, normalStrength: 0, envMapIntensity: 1 },
    edge: { metal: 'gold' },
    numeral: { font: 'OpenDiceNumerals', weight: 700, color: '#D4AF37', style: 'inlay', metal: 'gold', glow: null, scale: 1.05 },
    decor: null,
    swatch: ['#0B0B10', '#D4AF37'],
});

export const GLOW = Object.freeze({
    id: 'test-glow', name: 'Test Glow', family: 'textured',
    body: { color: '#2A1410', depthColor: '#2A1410', roughness: 0.55, metalness: 0, clearcoat: 0, clearcoatRoughness: 0,
            glow: null, texture: { kind: 'scales', color2: '#120807', scale: 4, contrast: 0.7 }, normalStrength: 0.8, envMapIntensity: 1 },
    edge: { metal: 'iron' },
    numeral: { font: 'OpenDiceNumerals', weight: 700, color: '#FF7A1A', style: 'glow', metal: null, glow: { color: '#FF7A1A', intensity: 1.6 }, scale: 1 },
    decor: null,
    swatch: ['#2A1410', '#FF7A1A'],
});

export const NO_EDGE = Object.freeze({ ...GEM, id: 'test-no-edge', edge: { metal: 'none' }, decor: null });
