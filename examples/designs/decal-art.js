/**
 * SVG art for the example designs' d20 "20" decals. Each builder returns the SVG markup for a
 * 100 x 100 view box whose ink stays within EXTENT of the centre (50, 50), so a decal drawn at
 * `scale` covers a disc of radius EXTENT / 100 * (0.7 * texture size * scale): the decal
 * pipeline draws a decal into a 0.7-of-the-texture square times its scale. The designs carry
 * the result as a data URL, so they stay plain JSON a host can store and serve.
 */

/** Largest distance any mark reaches from the centre of the view box, stroke included. */
export const EXTENT = 46;

const GOLD = '#D4AF37';
const GOLD_DARK = '#5C4210';
const GOLD_LIGHT = '#F6E39A';

const f = (n) => Number(n.toFixed(2)).toString();
const polar = (r, deg) => [50 + r * Math.cos((deg * Math.PI) / 180), 50 - r * Math.sin((deg * Math.PI) / 180)];
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`;

/** `data:` URL for an SVG string (URL-encoded, so it is readable in a design's JSON). */
export function svgDataUrl(markup) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
}

/** A three-point crown with a jewel and three studs in `jewel`. */
export function crown(jewel) {
    return svg(
        `<path d="M19 68 L16 36 L34 51 L50 24 L66 51 L84 36 L81 68 Z" fill="${GOLD}" stroke="${GOLD_DARK}" stroke-width="2.5" stroke-linejoin="round"/>` +
        `<path d="M21.5 66 L19.5 41 L34 54 L50 29 L66 54 L80.5 41 L78.5 66" fill="none" stroke="${GOLD_LIGHT}" stroke-width="1.2" stroke-linejoin="round" opacity="0.75"/>` +
        `<rect x="18" y="67" width="64" height="11" rx="3" fill="${GOLD}" stroke="${GOLD_DARK}" stroke-width="2.5"/>` +
        `<circle cx="16" cy="33" r="4.5" fill="${GOLD}" stroke="${GOLD_DARK}" stroke-width="2"/>` +
        `<circle cx="50" cy="20" r="5" fill="${GOLD}" stroke="${GOLD_DARK}" stroke-width="2"/>` +
        `<circle cx="84" cy="33" r="4.5" fill="${GOLD}" stroke="${GOLD_DARK}" stroke-width="2"/>` +
        `<circle cx="50" cy="55" r="7.5" fill="${jewel}" stroke="${GOLD_DARK}" stroke-width="2"/>` +
        `<circle cx="47.5" cy="52.5" r="2.2" fill="#ffffff" opacity="0.8"/>` +
        [31, 50, 69].map((x) => `<circle cx="${x}" cy="72.5" r="3.4" fill="${jewel}" stroke="${GOLD_DARK}" stroke-width="1.5"/>`).join(''),
    );
}

/** Sixteen alternating rays around a disc. */
export function sunburst() {
    const rays = [];
    for (let k = 0; k < 16; k++) {
        const a = k * 22.5, out = k % 2 ? 33 : 44;
        const [x1, y1] = polar(19, a - 7), [x2, y2] = polar(out, a), [x3, y3] = polar(19, a + 7);
        rays.push(`<path d="M${f(x1)} ${f(y1)} L${f(x2)} ${f(y2)} L${f(x3)} ${f(y3)} Z" fill="${GOLD}" stroke="${GOLD_DARK}" stroke-width="1.5" stroke-linejoin="round"/>`);
    }
    return svg(
        rays.join('') +
        `<circle cx="50" cy="50" r="18" fill="${GOLD}" stroke="${GOLD_DARK}" stroke-width="2.5"/>` +
        `<circle cx="50" cy="50" r="11.5" fill="none" stroke="${GOLD_LIGHT}" stroke-width="1.5" opacity="0.8"/>`,
    );
}

/** An eight-point compass star, each point split light and dark. */
export function compassStar() {
    const parts = [];
    const point = (deg, r, w) => {
        const tip = polar(r, deg), left = polar(w, deg + 45), right = polar(w, deg - 45);
        parts.push(`<path d="M50 50 L${f(tip[0])} ${f(tip[1])} L${f(left[0])} ${f(left[1])} Z" fill="${GOLD_LIGHT}" stroke="${GOLD_DARK}" stroke-width="1.5" stroke-linejoin="round"/>`);
        parts.push(`<path d="M50 50 L${f(tip[0])} ${f(tip[1])} L${f(right[0])} ${f(right[1])} Z" fill="${GOLD}" stroke="${GOLD_DARK}" stroke-width="1.5" stroke-linejoin="round"/>`);
    };
    for (const deg of [45, 135, 225, 315]) point(deg, 28, 8);
    for (const deg of [0, 90, 180, 270]) point(deg, 44, 10);
    return svg(parts.join('') + `<circle cx="50" cy="50" r="4.5" fill="${GOLD}" stroke="${GOLD_DARK}" stroke-width="1.5"/>`);
}

/** A scallop shell in gold, outlined in `outline` with ribs fanning from the hinge. */
export function scallop(outline) {
    const hinge = [50, 80];
    const ribs = [];
    for (let k = 0; k <= 8; k++) {
        const [x, y] = polar(35, 180 - k * 22.5).map((v, i) => (i === 1 ? v - 6 : v));
        ribs.push(`<path d="M${hinge[0]} ${hinge[1]} L${f(x)} ${f(y)}" stroke="${outline}" stroke-width="2" stroke-linecap="round"/>`);
    }
    return svg(
        `<path d="M50 80 L15 44 A35 35 0 0 1 85 44 Z" fill="${GOLD}" stroke="${outline}" stroke-width="3" stroke-linejoin="round"/>` +
        ribs.join('') +
        `<path d="M40 80 L43 88 L57 88 L60 80 Z" fill="${GOLD}" stroke="${outline}" stroke-width="2.5" stroke-linejoin="round"/>`,
    );
}

/** A spiral rose in `petal` with a `stroke` outline over two sage leaves. */
export function rose(petal, stroke) {
    return svg(
        `<ellipse cx="33" cy="66" rx="13" ry="6" transform="rotate(35 33 66)" fill="#6E8B5A" stroke="#3D5230" stroke-width="2"/>` +
        `<ellipse cx="67" cy="66" rx="13" ry="6" transform="rotate(-35 67 66)" fill="#6E8B5A" stroke="#3D5230" stroke-width="2"/>` +
        `<circle cx="50" cy="47" r="22" fill="${petal}" stroke="${stroke}" stroke-width="3"/>` +
        `<path d="M50 47 m-3 0 a3 3 0 1 1 6 0 a6 6 0 1 1 -12 0 a10 10 0 1 1 20 0 a14 14 0 1 1 -28 0" fill="none" stroke="${stroke}" stroke-width="3.5" stroke-linecap="round"/>`,
    );
}

/**
 * The farthest reach from the centre of every mark the builders draw, for the fit test. Kept
 * beside the builders (and checked by the test against the numbers above) so a change to a
 * shape that grows past EXTENT fails loudly.
 */
export const REACH = Object.freeze({
    crown: Math.max(
        Math.hypot(50 - 16, 50 - 33) + 4.5 + 1,          // side balls
        Math.hypot(50 - 18, 78 - 50) + 1.25,             // band corners
        50 - 20 + 5 + 1,                                 // top ball
    ),
    sunburst: 44 + 0.75,
    compassStar: 44 + 0.75,
    scallop: Math.max(35 + 6 + 1.5, Math.hypot(57 - 50, 88 - 50) + 1.25),
    rose: Math.max(Math.hypot(50 - 50, 47 - 50) + 22 + 1.5, Math.hypot(33 - 13 * Math.cos(35 * Math.PI / 180) - 50, 66 + 13 * Math.sin(35 * Math.PI / 180) - 50) + 1),
});
