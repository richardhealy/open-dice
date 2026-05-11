import * as THREE from 'three';

const UNDERLINED_TEXTS = new Set(['6', '9', '60', '90']);

function calculateTextureSize(approx) {
    return Math.max(128, Math.pow(2, Math.floor(Math.log(approx) / Math.log(2))));
}

function fillBackground(ctx, ts, color) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, ts, ts);
}

function drawText(ctx, text, ts, color, textOffsetY) {
    ctx.font = ts / (1 + 2 * 1.0) + 'pt Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    const centerX = ts / 2;
    const centerY = ts / 2 + textOffsetY;
    ctx.fillText(text, centerX, centerY);

    if (UNDERLINED_TEXTS.has(text)) {
        const textWidth = ctx.measureText(text).width;
        const underlineY = centerY + ts * 0.165;
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(3, ts * 0.02);
        ctx.moveTo(centerX - textWidth / 2, underlineY);
        ctx.lineTo(centerX + textWidth / 2, underlineY);
        ctx.stroke();
    }
}

function drawDecalImage(ctx, img, decal, ts) {
    const scale = decal.scale ?? 1;
    const offsetX = (decal.offsetX ?? 0) * ts;
    const offsetY = (decal.offsetY ?? 0) * ts;
    const rotationRad = ((decal.rotation ?? 0) * Math.PI) / 180;
    const drawSize = ts * 0.7 * scale;

    ctx.save();
    ctx.translate(ts / 2 + offsetX, ts / 2 + offsetY);
    ctx.rotate(rotationRad);
    ctx.drawImage(img, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
    ctx.restore();
}

/**
 * Create a dice-face texture. When `decal` is supplied (with a `src` resolvable via
 * `decalRegistry`), draws the image with its transform; otherwise draws `text`. If the
 * decal image isn't cached yet, draws the text fallback synchronously and patches the
 * canvas (re-flagging `texture.needsUpdate`) once the image loads.
 *
 * @param {Object}  opts
 * @param {string}  opts.text             Fallback text when no decal is available.
 * @param {string}  opts.textColor
 * @param {string}  opts.backgroundColor
 * @param {Object}  [opts.decal]          { src, scale, offsetX, offsetY, rotation }.
 *                                        offsetX/offsetY are fractions of texture size;
 *                                        rotation is in degrees; scale is multiplied
 *                                        against a default size of 0.7 × texture size.
 * @param {DecalRegistry} [opts.decalRegistry]
 * @param {boolean} [opts.isSecret]       Renders '?' regardless of text/decal.
 * @param {number}  [opts.textOffsetY=0]  Pixel offset for text baseline (d100 uses +16).
 */
export function createFaceTexture({
    text,
    textColor,
    backgroundColor,
    decal,
    decalRegistry,
    isSecret = false,
    textOffsetY = 0,
}) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const ts = calculateTextureSize(50 / 2 + 50 * 1.0) * 2;
    canvas.width = canvas.height = ts;
    fillBackground(ctx, ts, backgroundColor);

    const texture = new THREE.Texture(canvas);
    texture.needsUpdate = true;

    if (isSecret) {
        drawText(ctx, '?', ts, textColor, textOffsetY);
        texture.needsUpdate = true;
        return texture;
    }

    if (decal && decal.src && decalRegistry) {
        const cached = decalRegistry.get(decal.src);
        if (cached) {
            drawDecalImage(ctx, cached, decal, ts);
            texture.needsUpdate = true;
            return texture;
        }

        // Async path: draw text now, swap to decal once the image loads.
        drawText(ctx, String(text), ts, textColor, textOffsetY);
        texture.needsUpdate = true;

        decalRegistry.load(decal.src).then((img) => {
            ctx.clearRect(0, 0, ts, ts);
            fillBackground(ctx, ts, backgroundColor);
            drawDecalImage(ctx, img, decal, ts);
            texture.needsUpdate = true;
        }).catch(() => {
            // Leave the text fallback in place.
        });

        return texture;
    }

    drawText(ctx, String(text), ts, textColor, textOffsetY);
    texture.needsUpdate = true;
    return texture;
}

function drawD4CornerText(ctx, text, ts, color) {
    ctx.font = ts / 5 + 'pt Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, ts / 2, ts / 2 - ts * 0.3);
}

function drawD4CornerDecal(ctx, img, decal, ts) {
    const scale = decal.scale ?? 1;
    const offsetX = (decal.offsetX ?? 0) * ts;
    const offsetY = (decal.offsetY ?? 0) * ts;
    const rotationRad = ((decal.rotation ?? 0) * Math.PI) / 180;
    // Corner decals are smaller than regular-face decals — three sit on one face.
    const drawSize = ts * 0.28 * scale;

    ctx.save();
    ctx.translate(ts / 2 + offsetX, ts / 2 - ts * 0.3 + offsetY);
    ctx.rotate(rotationRad);
    ctx.drawImage(img, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
    ctx.restore();
}

/**
 * Create a d4 face texture. d4 faces show three corner numbers rotated 120° around the
 * center; each corner is rendered independently — if `decals[cornerValue]` exists the
 * decal replaces just that corner's number while the other corners keep their text.
 *
 * Re-renderable so async decal loads patch in across all corners atomically (the rotation
 * state has to start fresh, otherwise corners drawn in earlier passes end up double-rotated).
 *
 * @param {Object}  opts
 * @param {Array}   opts.values         Length-3 array of corner values (numbers or strings).
 * @param {string}  opts.textColor
 * @param {string}  opts.backgroundColor
 * @param {Object}  [opts.decals]       Value-keyed decal map; lookup is per corner.
 * @param {DecalRegistry} [opts.decalRegistry]
 */
export function createD4FaceTexture({
    values,
    textColor,
    backgroundColor,
    decals,
    decalRegistry,
}) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const ts = calculateTextureSize(50 / 2 + 50 * 2) * 2;
    canvas.width = canvas.height = ts;

    const texture = new THREE.Texture(canvas);
    texture.needsUpdate = true;

    const render = () => {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        fillBackground(ctx, ts, backgroundColor);

        for (let i = 0; i < values.length; i++) {
            const value = String(values[i]);
            const decal = (decals && value) ? decals[value] : null;
            const cached = (decal && decal.src && decalRegistry)
                ? decalRegistry.get(decal.src)
                : null;

            if (cached) {
                drawD4CornerDecal(ctx, cached, decal, ts);
            } else if (decal && decal.src && decalRegistry) {
                drawD4CornerText(ctx, value, ts, textColor);
                decalRegistry.load(decal.src).then(() => {
                    render();
                    texture.needsUpdate = true;
                }).catch(() => { /* keep text fallback */ });
            } else {
                drawD4CornerText(ctx, value, ts, textColor);
            }

            ctx.translate(ts / 2, ts / 2);
            ctx.rotate((Math.PI * 2) / 3);
            ctx.translate(-ts / 2, -ts / 2);
        }
    };

    render();
    return texture;
}
