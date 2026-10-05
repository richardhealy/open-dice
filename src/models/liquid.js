import * as THREE from 'three';
import { surfaceHeight } from './liquid-geometry.js';

/**
 * The liquid inside a model die at run time: a spring-damped slosh fed by the roller, the
 * draught's material with the shader that cuts it at the surface, the glass, and the per-render
 * surface update. The geometry comes from liquid-geometry.js.
 */

export const SLOSH = Object.freeze({
    stiffness: 40,                            // spring pulling the surface flat
    damping: 6,                               // bleeds the swing; flat within about a second
    push: 0.012,                              // how hard a change in velocity pushes the draught
    maxTilt: Math.tan((20 * Math.PI) / 180),  // the surface never leans past 20 degrees
    maxDt: 0.05,                              // a long frame (a hidden tab) is clamped, not integrated
    ripple: 0.08,                             // ripple amplitude per unit of tilt
    rippleFrequency: 9,                       // ripples per world unit
    rippleSpeed: 14,                          // phase advance per second
});

/**
 * The slosh of one die: `tick(body, dt)` each frame with the body's velocity. A still die
 * (never ticked, or ticked with no change in velocity) keeps the surface level.
 */
export function createSlosh(strength) {
    const state = { x: 0, z: 0, vx: 0, vz: 0, phase: 0, last: null };
    return {
        strength,
        state,
        get tilt() { return Math.hypot(state.x, state.z); },
        tick(body, dt) {
            if (!(dt > 0) || !(strength > 0)) return;
            const step = Math.min(dt, SLOSH.maxDt);
            const v = body.velocity;
            if (state.last) {
                state.vx -= ((v.x - state.last.x) / step) * SLOSH.push * strength;
                state.vz -= ((v.z - state.last.z) / step) * SLOSH.push * strength;
            }
            state.last = { x: v.x, z: v.z };
            state.vx += (-SLOSH.stiffness * state.x - SLOSH.damping * state.vx) * step;
            state.vz += (-SLOSH.stiffness * state.z - SLOSH.damping * state.vz) * step;
            state.x += state.vx * step;
            state.z += state.vz * step;
            const cap = SLOSH.maxTilt * strength;
            const tilt = Math.hypot(state.x, state.z);
            if (tilt > cap) { state.x *= cap / tilt; state.z *= cap / tilt; state.vx = 0; state.vz = 0; }
            state.phase += step * SLOSH.rippleSpeed;
        },
    };
}

/** Fresh uniform objects for one die's liquid material. */
export function liquidUniforms(liquid) {
    return {
        uSurfaceNormal: { value: new THREE.Vector3(0, 1, 0) },
        uSurfaceHeight: { value: 0 },
        uSurfaceColor: { value: new THREE.Color(liquid.surfaceColor) },
        uRipple: { value: new THREE.Vector3(0, 0, SLOSH.rippleFrequency) },   // amplitude, phase, frequency
    };
}

/**
 * Cut the draught at its surface: a fragment above the (rippled) surface plane is discarded,
 * and a back face, seen through the hole the cut opens, shades as the flat top in the surface
 * colour. Written against three r130's meshphysical chunks.
 */
export function patchLiquidShader(shader, uniforms) {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLiquidWorld;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvLiquidWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', [
            '#include <common>',
            'varying vec3 vLiquidWorld;',
            'uniform vec3 uSurfaceNormal;',
            'uniform float uSurfaceHeight;',
            'uniform vec3 uSurfaceColor;',
            'uniform vec3 uRipple;',
        ].join('\n'))
        .replace('#include <clipping_planes_fragment>', [
            '#include <clipping_planes_fragment>',
            '{',
            '    float liquidRipple = uRipple.x * sin(dot(vLiquidWorld.xz, vec2(uRipple.z)) + uRipple.y);',
            '    if (dot(vLiquidWorld, uSurfaceNormal) - uSurfaceHeight - liquidRipple > 0.0) discard;',
            '}',
        ].join('\n'))
        .replace('#include <color_fragment>', '#include <color_fragment>\nif (!gl_FrontFacing) diffuseColor.rgb = uSurfaceColor;')
        .replace('#include <normal_fragment_begin>', [
            '#include <normal_fragment_begin>',
            'if (!gl_FrontFacing) {',
            '    normal = normalize((viewMatrix * vec4(uSurfaceNormal, 0.0)).xyz);',
            '    geometryNormal = normal;',
            '}',
        ].join('\n'));
}

/** The draught's material for one die. Every liquid material shares one program (same patch text). */
export function createLiquidMaterial(liquid, uniforms) {
    const material = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(liquid.color),
        roughness: 0.25,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.1,
        side: THREE.DoubleSide,
    });
    if (liquid.glow) {
        material.emissive = new THREE.Color(liquid.glow.color);
        material.emissiveIntensity = liquid.glow.intensity;
    } else {
        material.emissiveIntensity = 0;
    }
    material.userData.liquid = uniforms;
    material.onBeforeCompile = (shader) => patchLiquidShader(shader, uniforms);
    return material;
}

/** The glass shell's material: the inner shell faces inward without depth writes, the outer faces outward with them. */
export function createGlassMaterial(glass, { inner }) {
    return new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(glass.color),
        roughness: glass.roughness,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.04,
        transparent: true,
        opacity: glass.opacity,
        depthWrite: !inner,
        side: inner ? THREE.BackSide : THREE.FrontSide,
    });
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const position = new THREE.Vector3();
const rotation = new THREE.Quaternion();
const scale = new THREE.Vector3();
const upLocal = new THREE.Vector3();
const through = new THREE.Vector3();

/**
 * Before the draught renders: world up in the die frame, the level that holds `level` of the
 * volume in this pose, and the world plane through that point on the die's axis, tilted by the
 * slosh. `state` is `{ cloud, heights, level, slosh, uniforms }`.
 */
export function updateSurface(mesh, state) {
    mesh.matrixWorld.decompose(position, rotation, scale);
    upLocal.copy(WORLD_UP).applyQuaternion(rotation.invert());
    const h = surfaceHeight(state.cloud, upLocal, state.level, state.heights);
    const { uniforms, slosh } = state;
    const n = uniforms.uSurfaceNormal.value.set(slosh.state.x, 1, slosh.state.z).normalize();
    through.copy(position).addScaledVector(WORLD_UP, h);
    uniforms.uSurfaceHeight.value = through.dot(n);
    uniforms.uRipple.value.set(slosh.tilt * SLOSH.ripple, slosh.state.phase, SLOSH.rippleFrequency);
}
