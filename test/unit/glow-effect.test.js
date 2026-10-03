import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { glow, glowFrame } from '../../src/effects/glow.js';

describe('glow effect on materials with their own emissive', () => {
    const gem = () => { const m = new THREE.MeshPhysicalMaterial(); m.emissive.setHex(0xff2d55); m.emissiveIntensity = 0.18; return m; };
    const phong = () => new THREE.MeshPhongMaterial();   // emissive black, intensity 1: the classic case

    it('glowFrame adds the pulse on top of the base emissive, never below it', () => {
        const m = gem();
        const base = m.emissive.clone().multiplyScalar(m.emissiveIntensity);
        glowFrame(m, base, new THREE.Color(0x4ade80), 0);        // start of the pulse
        expect(m.emissiveIntensity).toBe(1);
        expect(m.emissive.r).toBeCloseTo(base.r, 6);
        expect(m.emissive.g).toBeCloseTo(base.g, 6);
        expect(m.emissive.b).toBeCloseTo(base.b, 6);
        glowFrame(m, base, new THREE.Color(0x4ade80), 1);        // peak
        expect(m.emissive.r).toBeGreaterThanOrEqual(base.r);
        expect(m.emissive.g).toBeCloseTo(base.g + 0xde / 255, 6);
    });

    it('for classic Phong (black emissive) the frame equals colour x value, as before', () => {
        const m = phong();
        glowFrame(m, new THREE.Color(0, 0, 0), new THREE.Color(0xffd166), 0.5);
        expect(m.emissive.r).toBeCloseTo(0.5, 6);
        expect(m.emissive.g).toBeCloseTo((0xd1 / 255) * 0.5, 6);
        expect(m.emissiveIntensity).toBe(1);
    });

    it('the effect restores the exact original emissive and intensity when it ends', async () => {
        const m = gem();
        const die = { mesh: { material: [m] } };
        const effect = glow({ color: 0x4ade80, duration: 30 }).create({ die });
        effect.update();
        expect(m.emissiveIntensity).toBe(1);                      // mid-effect: additive mode
        await new Promise((r) => setTimeout(r, 40));
        expect(effect.update()).toBe(true);
        expect(m.emissive.getHex()).toBe(0xff2d55);
        expect(m.emissiveIntensity).toBe(0.18);
    });
});
