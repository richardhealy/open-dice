import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildHull } from '../../src/models/hull.js';
import { liquidBody, sampleCloud } from '../../src/models/liquid-geometry.js';
import { SLOSH, createSlosh, liquidUniforms, patchLiquidShader, createLiquidMaterial, createGlassMaterial, updateSurface } from '../../src/models/liquid.js';

const DT = 1 / 60;
const LIQUID = { color: '#B3122A', surfaceColor: '#FF8A96', glow: { color: '#FF3B4E', intensity: 0.3 }, level: 0.5, thickness: 0.06, glass: { color: '#FFE9EC', opacity: 0.35, roughness: 0.08 }, neck: null, slosh: 1 };
const at = (x, y = 0, z = 0) => ({ velocity: { x, y, z } });

describe('createSlosh', () => {
    it('tilts after a change in velocity and settles flat again', () => {
        const s = createSlosh(1);
        s.tick(at(6), DT);
        s.tick(at(0), DT);
        expect(s.tilt).toBeGreaterThan(0);
        let settledVisibly = null, settled = null;
        for (let i = 0; i < 180; i++) {
            s.tick(at(0), DT);
            if (settledVisibly == null && s.tilt < 0.02) settledVisibly = i;
            if (settled == null && s.tilt < 1e-3) settled = i;
        }
        expect(settledVisibly).toBeLessThan(90);
        expect(settled).not.toBeNull();
    });

    it('never tilts past the cap, and strength 0 never tilts', () => {
        const s = createSlosh(1);
        for (let i = 0; i < 20; i++) s.tick(at(i % 2 ? 50 : -50), DT);
        expect(s.tilt).toBeLessThanOrEqual(SLOSH.maxTilt + 1e-9);
        const still = createSlosh(0);
        for (let i = 0; i < 20; i++) still.tick(at(i % 2 ? 50 : -50), DT);
        expect(still.tilt).toBe(0);
    });

    it('a long frame is clamped so the spring stays finite', () => {
        const s = createSlosh(1);
        s.tick(at(6), DT);
        s.tick(at(0), 5);
        for (let i = 0; i < 5; i++) s.tick(at(0), 5);
        expect(Number.isFinite(s.state.x) && Number.isFinite(s.state.vx)).toBe(true);
        expect(s.tilt).toBeLessThanOrEqual(SLOSH.maxTilt + 1e-9);
        expect(s.state.phase).toBeCloseTo(SLOSH.rippleSpeed * (DT + 6 * SLOSH.maxDt), 6);
    });
});

describe('the shader patch', () => {
    const shader = () => ({
        uniforms: {},
        vertexShader: '#include <common>\nvoid main() {\n#include <project_vertex>\n}',
        fragmentShader: '#include <common>\nvoid main() {\n#include <clipping_planes_fragment>\n#include <color_fragment>\n#include <normal_fragment_begin>\n}',
    });

    it('declares the varying and uniforms, discards above the surface and lights back faces as the top', () => {
        const uniforms = liquidUniforms(LIQUID);
        const s = shader();
        patchLiquidShader(s, uniforms);
        expect(s.uniforms.uSurfaceNormal).toBe(uniforms.uSurfaceNormal);
        expect(s.uniforms.uRipple).toBe(uniforms.uRipple);
        expect(s.vertexShader).toContain('varying vec3 vLiquidWorld;');
        expect(s.vertexShader).toContain('vLiquidWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        expect(s.fragmentShader).toContain('uniform vec3 uSurfaceNormal;');
        expect(s.fragmentShader).toContain('discard;');
        expect(s.fragmentShader.indexOf('discard;')).toBeGreaterThan(s.fragmentShader.indexOf('#include <clipping_planes_fragment>'));
        expect(s.fragmentShader).toContain('if (!gl_FrontFacing) diffuseColor.rgb = uSurfaceColor;');
        expect(s.fragmentShader).toContain('geometryNormal = normal;');
        expect(uniforms.uSurfaceColor.value.getHexString()).toBe('ff8a96');
    });

    it('every liquid material compiles to one program with its own uniforms', () => {
        const a = createLiquidMaterial(LIQUID, liquidUniforms(LIQUID));
        const b = createLiquidMaterial(LIQUID, liquidUniforms(LIQUID));
        expect(a.customProgramCacheKey()).toBe(b.customProgramCacheKey());
        expect(a.userData.liquid).not.toBe(b.userData.liquid);
        const s = shader();
        a.onBeforeCompile(s);
        expect(s.uniforms.uSurfaceHeight).toBe(a.userData.liquid.uSurfaceHeight);
        expect(a.side).toBe(THREE.DoubleSide);
        expect(a.transparent).toBe(false);
        expect(a.emissive.getHexString()).toBe('ff3b4e');
        expect(a.emissiveIntensity).toBe(0.3);
        expect(createLiquidMaterial({ ...LIQUID, glow: null }, liquidUniforms(LIQUID)).emissiveIntensity).toBe(0);
    });

    it('glass is transparent, the inner shell back-facing without depth writes, the outer front-facing with them', () => {
        const inner = createGlassMaterial(LIQUID.glass, { inner: true });
        const outer = createGlassMaterial(LIQUID.glass, { inner: false });
        for (const m of [inner, outer]) {
            expect(m.transparent).toBe(true);
            expect(m.opacity).toBe(0.35);
            expect(m.roughness).toBe(0.08);
            expect(m.color.getHexString()).toBe('ffe9ec');
        }
        expect(inner.side).toBe(THREE.BackSide);
        expect(inner.depthWrite).toBe(false);
        expect(outer.side).toBe(THREE.FrontSide);
        expect(outer.depthWrite).toBe(true);
    });
});

describe('updateSurface', () => {
    const H = 0.55;
    const CUBE = [];
    for (const x of [-H, H]) for (const y of [-H, H]) for (const z of [-H, H]) CUBE.push([x, y, z]);
    const body = liquidBody(buildHull(CUBE), 0.01);
    const cloud = sampleCloud(body, 2048, 1);
    const stateFor = (level = 0.5, slosh = createSlosh(1)) => ({ cloud, heights: new Float32Array(2048), level, slosh, uniforms: liquidUniforms(LIQUID) });

    it('puts a level surface through the die at the right world height, in any pose', () => {
        const die = new THREE.Group();
        const mesh = new THREE.Mesh(body.geometry);
        die.add(mesh);
        const state = stateFor(0.5);
        for (const [pos, axis, angle] of [[[0, 0, 0], [1, 0, 0], 0], [[0, 2, 0], [1, 0, 0], Math.PI / 2], [[1, 3, -2], [1, 1, 0], 1.1]]) {
            die.position.set(...pos);
            die.quaternion.setFromAxisAngle(new THREE.Vector3(...axis).normalize(), angle);
            die.updateMatrixWorld(true);
            updateSurface(mesh, state);
            expect(state.uniforms.uSurfaceNormal.value.y).toBeCloseTo(1, 6);
            expect(state.uniforms.uSurfaceHeight.value).toBeCloseTo(pos[1], 1);
            expect(state.uniforms.uRipple.value.x).toBe(0);
        }
        die.position.set(0, 0, 0);
        die.quaternion.identity();
        die.updateMatrixWorld(true);
        updateSurface(mesh, stateFor(0.25));
        expect(stateFor(0.25).uniforms.uSurfaceHeight.value).toBe(0);     // fresh uniforms untouched
    });

    it('tilts the surface by the slosh and ripples with it', () => {
        const die = new THREE.Group();
        const mesh = new THREE.Mesh(body.geometry);
        die.add(mesh);
        die.updateMatrixWorld(true);
        const slosh = createSlosh(1);
        slosh.tick(at(6), DT);
        slosh.tick(at(0), DT);
        const state = stateFor(0.5, slosh);
        updateSurface(mesh, state);
        const n = state.uniforms.uSurfaceNormal.value;
        expect(n.length()).toBeCloseTo(1, 6);
        expect(Math.abs(n.x) + Math.abs(n.z)).toBeGreaterThan(0);
        expect(state.uniforms.uRipple.value.x).toBeCloseTo(slosh.tilt * SLOSH.ripple, 6);
        expect(state.uniforms.uRipple.value.y).toBe(slosh.state.phase);
        expect(state.uniforms.uRipple.value.z).toBe(SLOSH.rippleFrequency);
    });
});
