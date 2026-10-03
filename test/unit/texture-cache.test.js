import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { cacheKey, getOrCreateTexture, clearDiceSetCaches, cacheSize } from '../../src/sets/texture-cache.js';

describe('texture cache', () => {
    beforeEach(() => clearDiceSetCaches());

    it('cacheKey joins parts with | and renders null/undefined as empty', () => {
        expect(cacheKey(['ruby-jewel', 'd20', 'albedo', '20', false, null, undefined, 0])).toBe('ruby-jewel|d20|albedo|20|false|||0');
    });

    it('returns the same texture for the same key and calls create once', () => {
        const create = vi.fn(() => new THREE.Texture());
        const a = getOrCreateTexture('k', create);
        const b = getOrCreateTexture('k', create);
        expect(a).toBe(b);
        expect(create).toHaveBeenCalledTimes(1);
        expect(cacheSize()).toBe(1);
    });

    it('different keys get different textures', () => {
        const a = getOrCreateTexture('a', () => new THREE.Texture());
        const b = getOrCreateTexture('b', () => new THREE.Texture());
        expect(a).not.toBe(b);
        expect(cacheSize()).toBe(2);
    });

    it('clearDiceSetCaches disposes every texture and empties the map', () => {
        const t = new THREE.Texture();
        const spy = vi.spyOn(t, 'dispose');
        getOrCreateTexture('x', () => t);
        clearDiceSetCaches();
        expect(spy).toHaveBeenCalledTimes(1);
        expect(cacheSize()).toBe(0);
    });
});
