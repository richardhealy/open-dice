/**
 * How each die model maps a square face texture onto its face polygon. These numbers are
 * the `tab` and `af` constants in src/dice-models/*.js; makeGeometry places face vertex j
 * at UV ((cos θ + 1 + tab) / 2 / (1 + tab), (sin θ + 1 + tab) / 2 / (1 + tab)) with
 * θ = 2πj / sides + af. Canvas textures flip Y, so canvas y = (1 − v) · ts.
 *
 * shape: which decoration art to use. 'triCorners' is the d4, whose three numerals sit at
 * the corners rather than in the centre. 'kite' is the d10/d100: the textured face is the
 * upper triangle of a kite whose lower half is a separate coplanar belt triangle, so a
 * face-shaped decoration cannot fit and the decor library leaves it empty.
 */
export const FACE_FRAMES = Object.freeze({
    d4:   Object.freeze({ sides: 3, tab: -0.1, af: Math.PI * 7 / 6, shape: 'triCorners' }),
    d6:   Object.freeze({ sides: 4, tab: 0.1,  af: Math.PI / 4,     shape: 'square' }),
    d8:   Object.freeze({ sides: 3, tab: 0,    af: -Math.PI / 8,    shape: 'tri' }),
    d10:  Object.freeze({ sides: 3, tab: 0,    af: Math.PI * 6 / 5, shape: 'kite' }),
    d12:  Object.freeze({ sides: 5, tab: 0.2,  af: -Math.PI / 8,    shape: 'pent' }),
    d20:  Object.freeze({ sides: 3, tab: -0.2, af: -Math.PI / 8,    shape: 'tri' }),
    d100: Object.freeze({ sides: 3, tab: 0,    af: Math.PI * 6 / 5, shape: 'kite' }),
});

/** Circumradius of the face polygon in canvas pixels for a square canvas of size ts. */
export function frameRadius(frame, ts) {
    return ts / (2 * (1 + frame.tab));
}

/** UV of face vertex j exactly as makeGeometry computes it. */
export function frameUv(frame, j) {
    const theta = (Math.PI * 2 * j) / frame.sides + frame.af;
    const { tab } = frame;
    return [
        (Math.cos(theta) + 1 + tab) / 2 / (1 + tab),
        (Math.sin(theta) + 1 + tab) / 2 / (1 + tab),
    ];
}

/** Face polygon vertices in canvas pixel space (y down). */
export function framePolygon(frame, ts) {
    const R = frameRadius(frame, ts);
    const c = ts / 2;
    const points = [];
    for (let j = 0; j < frame.sides; j++) {
        const theta = (Math.PI * 2 * j) / frame.sides + frame.af;
        points.push([c + R * Math.cos(theta), c - R * Math.sin(theta)]);
    }
    return points;
}

/**
 * Set up a canvas so that drawing in the "unit frame" (polygon on the unit circle, vertex 0
 * at angle 0, y up) lands on the face polygon. Call inside ctx.save()/restore().
 */
export function applyFrameTransform(ctx, frame, ts) {
    const R = frameRadius(frame, ts);
    ctx.translate(ts / 2, ts / 2);
    ctx.scale(R, -R);
    ctx.rotate(frame.af);
}
