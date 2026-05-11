import { glow } from './glow.js';
import { scalePulse } from './scale-pulse.js';
import { haloRing } from './halo-ring.js';
import { screenShake } from './screen-shake.js';
import { slowMoZoom } from './slow-mo-zoom.js';
import { confetti } from './confetti.js';
import { particleBurst } from './particle-burst.js';

/**
 * Ready-to-use effect rule sets. Pass one to `new DiceRoller({ effects: presets.classicCrit })`,
 * or take a copy and tweak.
 */
export const presets = {
    /**
     * RPG-style: subtle confirmation on every die, big celebration on d20 nat-20,
     * angry red shake on d20 nat-1.
     */
    classicCrit: [
        { match: { type: 'd20', visible: 20 }, play: [
            glow({ color: 0xfacc15, intensity: 1.6, duration: 1400 }),
            scalePulse({ peak: 1.5, duration: 700 }),
            haloRing({ color: 0xfacc15, duration: 1400, endRadius: 2.6 }),
            confetti({ count: 70 }),
            slowMoZoom({ duration: 1200, zoomLevel: 1.7 }),
        ] },
        { match: { type: 'd20', visible: 1 }, play: [
            glow({ color: 0xef4444, intensity: 1.3 }),
            haloRing({ color: 0xef4444, duration: 1000, endRadius: 1.8 }),
            screenShake({ intensity: 0.6, duration: 500 }),
        ] },
        { match: 'clean', play: glow({ color: 0x4ade80, duration: 700, intensity: 0.7 }) },
        { match: 'variance', play: glow({ color: 0xfb923c, intensity: 1.0 }) },
    ],

    /** Quieter: just a per-die confirmation color, no global theatrics. */
    subtle: [
        { match: 'clean', play: glow({ color: 0x4ade80, duration: 500, intensity: 0.6 }) },
        { match: 'variance', play: glow({ color: 0xfb923c, duration: 600, intensity: 0.7 }) },
    ],

    /** Confetti for everything that matches its target — for a party app. */
    festive: [
        { match: 'clean', play: [
            glow({ color: 0xfacc15, duration: 600, intensity: 0.9 }),
            confetti({ count: 30, duration: 1800 }),
        ] },
        { match: 'variance', play: glow({ color: 0xfb923c }) },
    ],
};
