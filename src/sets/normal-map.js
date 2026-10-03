/**
 * Turn a height buffer (0..255, row 0 = top of the canvas) into tangent-space normal-map
 * pixels. Texture u points right and v points up while canvas y points down, so
 * dh/du = dx and dh/dv = -dy. The normal is normalize(-dh/du, -dh/dv, 1) = (-dx, dy, 1),
 * encoded as rgb = n * 0.5 + 0.5. `strength` scales the gradient before normalising.
 *
 * @param {Uint8ClampedArray} height  width*height values
 * @returns {Uint8ClampedArray} RGBA, width*height*4
 */
export function heightToNormal(height, width, h, strength = 1) {
    const out = new Uint8ClampedArray(width * h * 4);
    const at = (x, y) => {
        const cx = x < 0 ? 0 : x >= width ? width - 1 : x;
        const cy = y < 0 ? 0 : y >= h ? h - 1 : y;
        return height[cy * width + cx] / 255;
    };
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < width; x++) {
            const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1))
                     - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
            const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1))
                     - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
            let nx = -dx * strength, ny = dy * strength, nz = 1;
            const len = Math.hypot(nx, ny, nz);
            nx /= len; ny /= len; nz /= len;
            const i = (y * width + x) * 4;
            out[i] = Math.round((nx * 0.5 + 0.5) * 255);
            out[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
            out[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
            out[i + 3] = 255;
        }
    }
    return out;
}
