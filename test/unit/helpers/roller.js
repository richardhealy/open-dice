import * as THREE from 'three';
import { DiceRoller } from '../../../src/DiceRoller.js';
import { ClassicTextureCache } from '../../../src/classic-textures.js';
import { DecalRegistry } from '../../../src/decal-registry.js';

/** A DiceRoller without its WebGL constructor: real physics, prediction, spawn, replay and results. */
export function headlessRoller(over = {}) {
    const r = Object.create(DiceRoller.prototype);
    Object.assign(r, {
        width: 1600, height: 900, throwSpeed: 15, throwSpin: 20,
        dice: [], diceBatches: [], effects: [], effectRules: null, defaultSet: null,
        decalRegistry: new DecalRegistry(), soundManager: { sounds: [], play() {} },
        up: new THREE.Vector3(0, 1, 0), scene: new THREE.Scene(),
        _setAssetsReady: true, _rollGeneration: 0, _pendingSetRolls: 0, _animationHolds: 0, _destroyed: false,
        _pendingPredictions: 0, _predictionQueue: Promise.resolve(), _tableEpoch: 0, _replay: null, _fadingDice: [],
        _classicTextures: new ClassicTextureCache(), _retiredTextures: [],
        ...over,
    });
    r._initPhysics();
    return r;
}

/** Math.random as a seeded generator (mulberry32), for repeatable throws. */
export function seededRandom(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
