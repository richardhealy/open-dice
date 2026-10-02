import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { createRoomScene, installEnvironment } from '../../src/sets/environment.js';

describe('environment', () => {
    afterEach(() => vi.restoreAllMocks());

    it('builds a room with a shell and several emitter panels', () => {
        const room = createRoomScene();
        expect(room).toBeInstanceOf(THREE.Scene);
        const meshes = room.children.filter((o) => o.isMesh);
        expect(meshes.length).toBeGreaterThanOrEqual(6);
        expect(meshes.some((m) => m.material.side === THREE.BackSide)).toBe(true);
        // Emitters are brighter than 1.0 so the PMREM blur still reads them as lights.
        expect(meshes.some((m) => m.material.color.r > 1)).toBe(true);
    });

    it('installs the PMREM texture once and disposes the generator', () => {
        const scene = new THREE.Scene();
        const texture = new THREE.Texture();
        const generator = { fromScene: vi.fn(() => ({ texture })), dispose: vi.fn() };
        const factory = vi.fn(() => generator);
        const renderer = {};
        expect(installEnvironment(renderer, scene, { generatorFactory: factory })).toBe(texture);
        expect(scene.environment).toBe(texture);
        expect(generator.fromScene).toHaveBeenCalledTimes(1);
        expect(generator.fromScene.mock.calls[0][1]).toBe(0.04);
        expect(generator.dispose).toHaveBeenCalledTimes(1);
        // Second call: already installed, nothing happens.
        expect(installEnvironment(renderer, scene, { generatorFactory: factory })).toBe(texture);
        expect(factory).toHaveBeenCalledTimes(1);
    });

    it('warns and returns null when generation fails, leaving the scene untouched', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const scene = new THREE.Scene();
        const factory = () => { throw new Error('context lost'); };
        expect(installEnvironment({}, scene, { generatorFactory: factory })).toBeNull();
        expect(scene.environment).toBeNull();
        expect(warn).toHaveBeenCalledTimes(1);
    });
});
