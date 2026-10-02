import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setCanvasFactories } from '../../src/sets/canvas-factory.js';
import { createFaceTexture, createD4FaceTexture, isUnderlined } from '../../src/face-texture.js';
import { makeRecordingCanvas, callsNamed, lastSet } from './helpers/canvas-stub.js';

describe('face-texture via the canvas factory', () => {
  let canvases, restore;
  beforeEach(() => {
    canvases = [];
    restore = setCanvasFactories({
      canvas: (size) => { const c = makeRecordingCanvas(size); canvases.push(c); return c; },
    });
  });
  afterEach(() => restore());

  it('paints background then Arial text at the centre, exactly as before', () => {
    const texture = createFaceTexture({ text: '20', textColor: '#ffffff', backgroundColor: '#f39c12' });
    expect(canvases).toHaveLength(1);
    const c = canvases[0];
    expect(c.width).toBe(256);
    expect(callsNamed(c, 'fillRect')[0].args).toEqual([0, 0, 256, 256]);
    expect(lastSet(c, 'font')).toBe((256 / 3) + 'pt Arial');
    expect(callsNamed(c, 'fillText')[0].args).toEqual(['20', 128, 128]);
    expect(texture.image).toBe(c);
    expect(texture.needsUpdate || texture.version > 0).toBeTruthy();
  });

  it('underlines 6, 9, 60 and 90 only', () => {
    expect(isUnderlined('6')).toBe(true);
    expect(isUnderlined('90')).toBe(true);
    expect(isUnderlined('8')).toBe(false);
    createFaceTexture({ text: '6', textColor: '#fff', backgroundColor: '#000' });
    expect(callsNamed(canvases[0], 'stroke')).toHaveLength(1);
  });

  it('paints three rotated corner numerals for a d4 face', () => {
    createD4FaceTexture({ values: [2, 4, 3], textColor: '#fff', backgroundColor: '#9b59b6' });
    const c = canvases[0];
    expect(callsNamed(c, 'fillText').map((x) => x.args[0])).toEqual(['2', '4', '3']);
    expect(callsNamed(c, 'rotate')).toHaveLength(3);
  });
});
