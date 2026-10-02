/**
 * A canvas whose 2D context records every call. Methods we never need pixels from are
 * recorded and return undefined; the handful that must return something return inert
 * values. Style properties (fillStyle, font, lineWidth, ...) are stored and recorded as
 * `set:<prop>`.
 */
export function makeRecordingCanvas(size) {
  const calls = [];
  const state = {};
  const returning = {
    measureText: (text) => ({ width: String(text).length * 10 }),
    getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createLinearGradient: () => ({ addColorStop() {} }),
  };
  const ctx = new Proxy(state, {
    get(target, prop) {
      if (prop === 'calls') return calls;
      if (prop === 'canvas') return canvas;
      if (prop in returning) {
        return (...args) => { calls.push({ name: prop, args }); return returning[prop](...args); };
      }
      if (prop in target) return target[prop];
      return (...args) => { calls.push({ name: prop, args }); };
    },
    set(target, prop, value) {
      target[prop] = value;
      calls.push({ name: `set:${String(prop)}`, args: [value] });
      return true;
    },
  });
  const canvas = { width: size, height: size, calls, getContext: () => ctx };
  return canvas;
}

/** All recorded calls with this name. */
export function callsNamed(canvas, name) {
  return canvas.calls.filter((c) => c.name === name);
}

/** Last value assigned to a context property, e.g. lastSet(canvas, 'font'). */
export function lastSet(canvas, prop) {
  const hits = callsNamed(canvas, `set:${prop}`);
  return hits.length ? hits[hits.length - 1].args[0] : undefined;
}
