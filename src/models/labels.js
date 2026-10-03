import * as THREE from 'three';
import { DecalGeometry } from './vendor.js';
import { createCanvas } from '../sets/canvas-factory.js';
import { fontStack, isNumeralFontReady } from '../sets/fonts/numerals.js';
import { cacheKey, getOrCreateTexture, getTextureAnisotropy } from '../sets/texture-cache.js';
import { isUnderlined } from '../face-texture.js';

/**
 * The numbers on a model die. Each label is a decal: the model's own surface under the label,
 * cut out and textured with one numeral, so the number follows a curved or bevelled face.
 */

export const LABEL_TEXTURE_SIZE = 256;
/** Glyph height as a share of the label square. */
const GLYPH = 0.62;
/** Widest a glyph may run, as a share of the square. */
const MAX_WIDTH = 0.86;

/** The design's numeral font and weight, with the model's colour and outline when it gives them. */
export function labelStyle(set, model) {
    const n = set.numeral;
    const own = model && model.numeral;
    return {
        font: n.font,
        weight: n.weight,
        color: (own && own.color) || n.color,
        outline: (own && own.outline) || n.outline || null,
    };
}

function fontFor(style, px) {
    return `${style.weight} ${Math.round(px)}px ${fontStack(style.font)}`;
}

/**
 * A transparent square with one upright numeral at its centre. `fitTexts` are every text the
 * die shows: the widest of them sets one glyph size for the whole die, as on real dice.
 * Cached per text, style and fit list.
 */
export function labelTexture(text, style, fitTexts = [text]) {
    const key = cacheKey(['model-label', text, fitTexts.join(','), style.font, style.weight, style.color,
        style.outline ? `${style.outline.color}/${style.outline.width}` : '', isNumeralFontReady() ? 1 : 0]);
    return getOrCreateTexture(key, () => {
        const size = LABEL_TEXTURE_SIZE;
        const canvas = createCanvas(size);
        const ctx = canvas.getContext('2d');
        const c = size / 2;
        let px = size * GLYPH;
        ctx.font = fontFor(style, px);
        const widest = Math.max(...[text, ...fitTexts].map((t) => ctx.measureText(t).width));
        if (widest > size * MAX_WIDTH) {
            px *= (size * MAX_WIDTH) / widest;
            ctx.font = fontFor(style, px);
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (style.outline) {
            ctx.lineJoin = 'round';
            ctx.lineWidth = Math.round(px * style.outline.width * 2 * 100) / 100;
            ctx.strokeStyle = style.outline.color;
            ctx.strokeText(text, c, c);
        }
        ctx.fillStyle = style.color;
        ctx.fillText(text, c, c);
        if (isUnderlined(text)) {
            const w = ctx.measureText(text).width;
            const y = c + px * 0.37;
            ctx.beginPath();
            ctx.strokeStyle = style.color;
            ctx.lineWidth = Math.max(2, px * 0.05);
            ctx.moveTo(c - w / 2, y);
            ctx.lineTo(c + w / 2, y);
            ctx.stroke();
        }
        const texture = new THREE.Texture(canvas);
        texture.anisotropy = getTextureAnisotropy();
        texture.needsUpdate = true;
        return texture;
    });
}

/** The projector rotation for a label: +z along its normal, +y towards its up. */
function labelOrientation(label) {
    const z = new THREE.Vector3().fromArray(label.normal).normalize();
    const up = new THREE.Vector3().fromArray(label.up);
    const y = up.addScaledVector(z, -up.dot(z)).normalize();
    const x = new THREE.Vector3().crossVectors(y, z).normalize();
    return new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/** Concatenate non-indexed geometries with the same attributes (position, normal, uv). */
function concat(parts) {
    if (parts.length === 1) return parts[0];
    const merged = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) {
        const itemSize = parts[0].getAttribute(name).itemSize;
        const total = parts.reduce((n, g) => n + g.getAttribute(name).array.length, 0);
        const array = new Float32Array(total);
        let offset = 0;
        for (const g of parts) {
            array.set(g.getAttribute(name).array, offset);
            offset += g.getAttribute(name).array.length;
        }
        merged.setAttribute(name, new THREE.BufferAttribute(array, itemSize));
    }
    parts.forEach((g) => g.dispose());
    return merged;
}

const geometryCache = new WeakMap();

/**
 * The decal geometry of one label on a model template (an Object3D in the die frame with
 * its world matrices up to date), or null when the label's square misses the model.
 * Cached per template and label object.
 */
export function labelGeometry(template, label) {
    let perTemplate = geometryCache.get(template);
    if (!perTemplate) { perTemplate = new Map(); geometryCache.set(template, perTemplate); }
    if (perTemplate.has(label)) return perTemplate.get(label);

    const position = new THREE.Vector3().fromArray(label.position);
    const orientation = labelOrientation(label);
    // As deep as it is wide: enough to follow a bevel, too shallow to reach the far side.
    const size = new THREE.Vector3(label.size, label.size, label.size);
    const parts = [];
    template.traverse((object) => {
        if (!object.isMesh || !object.geometry || !object.geometry.getAttribute('normal')) return;
        const decal = new DecalGeometry(object, position, orientation, size);
        if (decal.getAttribute('position').count > 0) parts.push(decal);
        else decal.dispose();
    });
    const geometry = parts.length ? concat(parts) : null;
    perTemplate.set(label, geometry);
    return geometry;
}
