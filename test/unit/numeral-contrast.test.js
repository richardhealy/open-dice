import { describe, it, expect } from 'vitest';
import { EXAMPLE_DESIGNS } from '../../examples/designs/index.js';
import { validateSet } from '../../src/sets/validate.js';
import { hexToRgb, shade, BODY_EXPOSURE } from '../../src/sets/face-painter.js';
import { METALS } from '../../src/sets/materials.js';

/** WCAG relative luminance of an #rrggbb colour. */
function luminance(hex) {
    const [r, g, b] = hexToRgb(hex).map((c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

describe('numerals stay readable on every example design', () => {
    it('numeral colour vs the painted body colour has at least 3:1 contrast', () => {
        for (const def of EXAMPLE_DESIGNS) {
            const set = validateSet(def);
            const id = set.id;
            const body = shade(set.body.color, BODY_EXPOSURE);                 // what the albedo is actually painted with
            const numeral = set.numeral.style === 'inlay' ? METALS[set.numeral.metal].color
                : set.numeral.style === 'glow' ? set.numeral.glow.color
                : set.numeral.color;
            const ratio = contrast(numeral, body);
            expect(ratio, `${id}: ${numeral} on ${body} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
        }
    });
});
