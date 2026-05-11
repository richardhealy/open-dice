import * as THREE from 'three';

/**
 * Slashing effect: Zoro-style sword strikes. Each "strike" is one of three patterns —
 * a single diagonal slash, an X (two crossing slashes), or a Z (three connected
 * strokes) — drawn through the die's position on the XZ plane (the floor plane) so
 * they read clearly under the top-down camera.
 *
 * Each slash is a custom tapered tube: radius follows `maxRadius · sin(t·π)`, so the
 * tube tapers to a point at both ends and is thickest in the middle — a blade
 * silhouette rather than a uniform pipe.
 *
 * Two nested tapered tubes per slash:
 *   - Core (thin, bright red)      — the cutting edge
 *   - Halo (thicker, deep crimson) — surrounding glow
 *
 * Strikes are scheduled as a queue of pending slashes with timed spawn-ats. An X strike
 * fires its two strokes 80 ms apart; a Z strike fires its three strokes 100 ms apart.
 * The sequencing makes the patterns read as deliberate sword attacks rather than
 * simultaneous flashes.
 *
 * @param {Object} [options]
 * @param {number} [options.coreColor=0xff2a44]
 * @param {number} [options.haloColor=0xaa0a2a]
 * @param {number} [options.strikeRate=2.2]              Strikes per second.
 * @param {number} [options.singleWeight=1]              Relative chance of single pattern.
 * @param {number} [options.xWeight=1]
 * @param {number} [options.zWeight=1]
 * @param {number} [options.slashLifetime=360]           ms per slash.
 * @param {number} [options.xStrokeDelay=80]             ms between strokes in an X.
 * @param {number} [options.zStrokeDelay=100]            ms between strokes in a Z.
 * @param {number} [options.strikeSize=1.6]              Base width/height of an X/Z.
 * @param {number} [options.strikeSizeVariance=0.35]
 * @param {number} [options.singleLength=2.0]            Length of a single slash.
 * @param {number} [options.singleLengthVariance=0.5]
 * @param {number} [options.coreRadius=0.05]             Peak radius of the bright core tube.
 * @param {number} [options.haloRadius=0.13]             Peak radius of the dim outer tube.
 * @param {number} [options.tubeSegments=22]
 * @param {number} [options.radialSegments=6]
 * @param {number} [options.centerJitter=0.25]
 */
export function slashing(options = {}) {
    const {
        coreColor = 0xff2a44,
        haloColor = 0xaa0a2a,
        strikeRate = 2.2,
        singleWeight = 1,
        xWeight = 1,
        zWeight = 1,
        slashLifetime = 360,
        xStrokeDelay = 80,
        zStrokeDelay = 100,
        strikeSize = 1.6,
        strikeSizeVariance = 0.35,
        singleLength = 2.0,
        singleLengthVariance = 0.5,
        coreRadius = 0.05,
        haloRadius = 0.13,
        tubeSegments = 22,
        radialSegments = 6,
        centerJitter = 0.25,
    } = options;

    return {
        scope: 'die',
        create({ die, roller }) {
            const scene = roller.scene;
            const group = new THREE.Group();
            scene.add(group);

            const pending = [];   // scheduled but not-yet-spawned slashes
            const slashes = [];   // active slashes

            let lastTime = performance.now();
            let nextStrikeAt = performance.now()
                + 1000 / strikeRate * (0.5 + Math.random());
            let emitting = true;
            let killed = false;

            // ---- Tapered tube geometry ----
            // Builds a straight tube from `start` to `end` whose radius follows a sine
            // taper (zero at both ends, peak at midpoint). The cross-section ring at
            // each tube segment is computed by picking a stable perpendicular axis to
            // the slash direction and sweeping a circle around it.
            function buildTaperedTube(start, end, maxRadius) {
                const dirX = end.x - start.x;
                const dirY = end.y - start.y;
                const dirZ = end.z - start.z;
                const dirLen = Math.hypot(dirX, dirY, dirZ);
                const tx = dirX / dirLen, ty = dirY / dirLen, tz = dirZ / dirLen;

                // Pick a reference up vector that isn't aligned with the tangent.
                let refX = 0, refY = 1, refZ = 0;
                if (Math.abs(ty) > 0.9) { refX = 1; refY = 0; refZ = 0; }

                // normal = tangent × ref, then normalize.
                let nx = ty * refZ - tz * refY;
                let ny = tz * refX - tx * refZ;
                let nz = tx * refY - ty * refX;
                const nLen = Math.hypot(nx, ny, nz);
                nx /= nLen; ny /= nLen; nz /= nLen;
                // binormal = tangent × normal
                const bx = ty * nz - tz * ny;
                const by = tz * nx - tx * nz;
                const bz = tx * ny - ty * nx;

                const positions = [];
                const normals = [];
                const indices = [];

                for (let i = 0; i <= tubeSegments; i++) {
                    const t = i / tubeSegments;
                    const radius = maxRadius * Math.sin(t * Math.PI);
                    const px = start.x + dirX * t;
                    const py = start.y + dirY * t;
                    const pz = start.z + dirZ * t;
                    for (let j = 0; j <= radialSegments; j++) {
                        const a = (j / radialSegments) * Math.PI * 2;
                        const ca = Math.cos(a);
                        const sa = Math.sin(a);
                        const rnx = ca * nx + sa * bx;
                        const rny = ca * ny + sa * by;
                        const rnz = ca * nz + sa * bz;
                        positions.push(
                            px + radius * rnx,
                            py + radius * rny,
                            pz + radius * rnz,
                        );
                        normals.push(rnx, rny, rnz);
                    }
                }
                for (let i = 0; i < tubeSegments; i++) {
                    for (let j = 0; j < radialSegments; j++) {
                        const a = (radialSegments + 1) * i + j;
                        const b = (radialSegments + 1) * (i + 1) + j;
                        const c = (radialSegments + 1) * (i + 1) + j + 1;
                        const d = (radialSegments + 1) * i + j + 1;
                        indices.push(a, b, d, b, c, d);
                    }
                }
                const geometry = new THREE.BufferGeometry();
                geometry.setIndex(indices);
                geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
                geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
                return geometry;
            }

            function pickPattern() {
                const total = singleWeight + xWeight + zWeight;
                let r = Math.random() * total;
                if ((r -= singleWeight) <= 0) return 'single';
                if ((r -= xWeight) <= 0) return 'X';
                return 'Z';
            }

            // Build a strike pattern at the die's current position and queue its
            // component slashes with appropriate timing offsets. Patterns lie on the
            // XZ plane (parallel to the floor) so they read clearly from above; the
            // whole pattern is rotated by a random angle around world-Y per strike.
            function scheduleStrike(now) {
                const pattern = pickPattern();
                const size = strikeSize + (Math.random() - 0.5) * 2 * strikeSizeVariance;
                const half = size * 0.5;
                const cy = die.body.position.y + 0.2;
                const cx = die.body.position.x + (Math.random() - 0.5) * centerJitter;
                const cz = die.body.position.z + (Math.random() - 0.5) * centerJitter;
                const rot = Math.random() * Math.PI * 2;
                const co = Math.cos(rot), si = Math.sin(rot);

                // Rotate a local XZ point and translate to the strike center.
                function ltw(lx, lz) {
                    return new THREE.Vector3(
                        cx + lx * co - lz * si,
                        cy,
                        cz + lx * si + lz * co,
                    );
                }

                if (pattern === 'single') {
                    // One slash through the center, with random angle (already from rot).
                    const len = (singleLength
                        + (Math.random() - 0.5) * 2 * singleLengthVariance) * 0.5;
                    pending.push({
                        spawnAt: now,
                        start: ltw(-len, 0),
                        end: ltw(len, 0),
                    });
                } else if (pattern === 'X') {
                    // Two diagonals through the center, perpendicular to each other.
                    pending.push({
                        spawnAt: now,
                        start: ltw(-half, -half),
                        end: ltw(half, half),
                    });
                    pending.push({
                        spawnAt: now + xStrokeDelay,
                        start: ltw(-half, half),
                        end: ltw(half, -half),
                    });
                } else {
                    // Z: top horizontal, then diagonal, then bottom horizontal.
                    const tl = ltw(-half, -half);
                    const tr = ltw(half, -half);
                    const bl = ltw(-half, half);
                    const br = ltw(half, half);
                    pending.push({ spawnAt: now, start: tl, end: tr });
                    pending.push({ spawnAt: now + zStrokeDelay, start: tr, end: bl });
                    pending.push({ spawnAt: now + zStrokeDelay * 2, start: bl, end: br });
                }
            }

            function spawnSlash(start, end) {
                const coreGeo = buildTaperedTube(start, end, coreRadius);
                const haloGeo = buildTaperedTube(start, end, haloRadius);
                const coreMat = new THREE.MeshBasicMaterial({
                    color: coreColor, transparent: true, opacity: 0,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                });
                const haloMat = new THREE.MeshBasicMaterial({
                    color: haloColor, transparent: true, opacity: 0,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                });
                const core = new THREE.Mesh(coreGeo, coreMat);
                const halo = new THREE.Mesh(haloGeo, haloMat);
                // Halo first so the bright core renders on top.
                group.add(halo);
                group.add(core);
                slashes.push({ core, halo, coreGeo, haloGeo, coreMat, haloMat, age: 0 });
            }

            function disposeOne(s) {
                group.remove(s.core);
                group.remove(s.halo);
                s.coreMat.dispose();
                s.haloMat.dispose();
                s.coreGeo.dispose();
                s.haloGeo.dispose();
            }

            function disposeAll() {
                for (const s of slashes) disposeOne(s);
                slashes.length = pending.length = 0;
                scene.remove(group);
            }

            return {
                update() {
                    if (killed) return true;
                    const now = performance.now();
                    const dt = (now - lastTime) / 1000;
                    lastTime = now;

                    if (emitting) {
                        const moving = die.body.velocity.lengthSquared() > 0.01
                                    || die.body.angularVelocity.lengthSquared() > 0.01;
                        if (!moving) emitting = false;
                    }
                    if (emitting && now >= nextStrikeAt) {
                        scheduleStrike(now);
                        const interval = 1000 / strikeRate;
                        nextStrikeAt = now + interval * (0.7 + Math.random() * 0.6);
                    }

                    // Promote any pending slashes whose spawn-at has arrived.
                    for (let i = pending.length - 1; i >= 0; i--) {
                        if (pending[i].spawnAt <= now) {
                            const p = pending[i];
                            spawnSlash(p.start, p.end);
                            pending.splice(i, 1);
                        }
                    }

                    // Fast attack, brief hold, slow release. Quick spike then taper.
                    for (let i = slashes.length - 1; i >= 0; i--) {
                        const s = slashes[i];
                        s.age += dt * 1000;
                        if (s.age >= slashLifetime) {
                            disposeOne(s);
                            slashes.splice(i, 1);
                            continue;
                        }
                        const lifeT = s.age / slashLifetime;
                        let opacity;
                        if (lifeT < 0.1) opacity = lifeT / 0.1;
                        else if (lifeT < 0.32) opacity = 1;
                        else opacity = 1 - (lifeT - 0.32) / 0.68;
                        s.coreMat.opacity = opacity;
                        s.haloMat.opacity = opacity * 0.6;
                    }

                    if (!emitting && pending.length === 0 && slashes.length === 0) {
                        disposeAll();
                        return true;
                    }
                    return false;
                },
                cleanup() {
                    if (killed) return;
                    killed = true;
                    disposeAll();
                },
            };
        }
    };
}
