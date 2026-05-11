import * as THREE from 'three';
import { getSparkTexture } from './sprite-texture.js';

/**
 * Electric effect: branching forked lightning arcs out from the die during the roll,
 * blinking briefly and disappearing; quick spark sprites fly off and trace bright
 * tracers. After the dice have settled, electric arcs continue to fire between any
 * pair of nearby settled electric dice for ~2-3 seconds — residual charge hopping
 * between them — then stop.
 *
 * Pre-settle phase:
 *   Forked bolt trees. A jagged trunk runs from the die to a random offset endpoint,
 *   with branches splitting off at intermediate trunk points, and those branches can
 *   themselves spawn sub-branches up to `maxDepth`. All line segments are packed into
 *   one `LineSegments` mesh per bolt and drawn with halo + core lines for glow.
 *
 * Post-settle phase:
 *   Cross-die arcs. Each settled die registers in a module-level Map; per-frame, every
 *   settled-electric effect checks for other registered dice within `crossArcDistance`
 *   and rolls `crossArcChance` to fire a jagged arc to each. Arcs flicker for ~140 ms
 *   and the phase lasts `crossArcDuration` ms (default 2200) after a brief delay.
 *
 * @param {Object} [options]
 * @param {number}  [options.color=0x55a0ff]            Outer bolt halo color.
 * @param {number}  [options.coreColor=0xffffff]
 * @param {number}  [options.boltRate=18]               Pre-settle bolts/sec.
 * @param {number}  [options.boltLifetime=130]
 * @param {number}  [options.boltLength=2.2]
 * @param {number}  [options.trunkSegments=8]
 * @param {number}  [options.trunkJitter=0.4]
 * @param {number}  [options.branchProbability=0.45]
 * @param {number}  [options.branchLengthRatio=0.55]
 * @param {number}  [options.maxDepth=2]
 * @param {number}  [options.sparkRate=42]              Pre-settle sparks/sec.
 * @param {number}  [options.sparkSize=0.18]
 * @param {number}  [options.sparkLifetime=320]
 * @param {boolean} [options.crossArcEnabled=true]      Post-settle die-to-die arcing.
 * @param {number}  [options.crossArcDistance=6.0]      Max world distance to arc.
 * @param {number}  [options.crossArcDelay=500]         ms after settle before first arc.
 * @param {number}  [options.crossArcDelayVariance=400]
 * @param {number}  [options.crossArcDuration=2200]     ms the arcing phase lasts.
 * @param {number}  [options.crossArcDurationVariance=500]
 * @param {number}  [options.crossArcCooldownMin=200]   ms between arc attempts.
 * @param {number}  [options.crossArcCooldownMax=500]
 * @param {number}  [options.crossArcChance=0.55]       Per-pair probability per attempt.
 * @param {number}  [options.crossArcLifetime=140]      ms — brief flash.
 * @param {number}  [options.crossArcSegments=8]
 * @param {number}  [options.crossArcJitter=0.5]
 */

// Module-level registry of settled electric dice. Populated when an electric effect's
// die settles; removed when the die's cross-arc phase ends or the effect is cleaned up.
// Lets cross-die arcing work without any coordination layer.
const settledElectricRegistry = new Map();
let nextEffectId = 0;

/**
 * Single jagged line from start to end with random perpendicular jitter per intermediate
 * point. Used for cross-die arcs (no branching — the endpoints are fixed).
 */
function buildJaggedLineGeometry(start, end, segments, jitter) {
    const positions = new Float32Array((segments + 1) * 3);
    positions[0] = start.x; positions[1] = start.y; positions[2] = start.z;
    positions[segments * 3] = end.x;
    positions[segments * 3 + 1] = end.y;
    positions[segments * 3 + 2] = end.z;

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dz = end.z - start.z;
    const len = Math.hypot(dx, dy, dz);

    let perpAx, perpAy, perpAz;
    if (Math.abs(dy) < 0.9 * len) {
        perpAx = -dz; perpAy = 0; perpAz = dx;
    } else {
        perpAx = 0; perpAy = dz; perpAz = -dy;
    }
    const pal = Math.hypot(perpAx, perpAy, perpAz) || 1;
    perpAx /= pal; perpAy /= pal; perpAz /= pal;
    const perpBx = dy * perpAz - dz * perpAy;
    const perpBy = dz * perpAx - dx * perpAz;
    const perpBz = dx * perpAy - dy * perpAx;
    const pbl = Math.hypot(perpBx, perpBy, perpBz) || 1;
    const pBx = perpBx / pbl, pBy = perpBy / pbl, pBz = perpBz / pbl;

    for (let i = 1; i < segments; i++) {
        const t = i / segments;
        const falloff = Math.sin(t * Math.PI);
        const ja = (Math.random() - 0.5) * jitter * falloff;
        const jb = (Math.random() - 0.5) * jitter * falloff;
        positions[i * 3] = start.x + dx * t + perpAx * ja + pBx * jb;
        positions[i * 3 + 1] = start.y + dy * t + perpAy * ja + pBy * jb;
        positions[i * 3 + 2] = start.z + dz * t + perpAz * ja + pBz * jb;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geometry;
}

export function electric(options = {}) {
    const {
        color = 0x55a0ff,
        coreColor = 0xffffff,
        boltRate = 18,
        boltLifetime = 130,
        boltLength = 2.2,
        trunkSegments = 8,
        trunkJitter = 0.4,
        branchProbability = 0.45,
        branchLengthRatio = 0.55,
        maxDepth = 2,
        sparkRate = 42,
        sparkSize = 0.18,
        sparkLifetime = 320,
        crossArcEnabled = true,
        crossArcDistance = 6.0,
        crossArcDelay = 500,
        crossArcDelayVariance = 400,
        crossArcDuration = 2200,
        crossArcDurationVariance = 500,
        crossArcCooldownMin = 200,
        crossArcCooldownMax = 500,
        crossArcChance = 0.55,
        crossArcLifetime = 140,
        crossArcSegments = 8,
        crossArcJitter = 0.5,
    } = options;

    return {
        scope: 'die',
        create({ die, roller }) {
            const effectId = ++nextEffectId;
            const scene = roller.scene;
            const boltGroup = new THREE.Group();
            const sparkGroup = new THREE.Group();
            const arcGroup = new THREE.Group();
            scene.add(boltGroup, sparkGroup, arcGroup);
            const sparkTexture = getSparkTexture();

            const bolts = [];
            const sparks = [];
            const arcs = [];

            let lastTime = performance.now();
            let bAcc = 0, sAcc = 0;
            let emitting = true;
            let settled = false;
            let nextArcAttemptAt = 0;
            let arcPhaseEndAt = 0;
            let killed = false;

            // ----- Pre-settle bolt construction -----

            function jaggedPath(start, end, segments, jitter) {
                const pts = new Array(segments + 1);
                pts[0] = start.clone();
                pts[segments] = end.clone();
                const dir = new THREE.Vector3().subVectors(end, start);
                const ref = Math.abs(dir.y) > 0.9 * dir.length()
                    ? new THREE.Vector3(1, 0, 0)
                    : new THREE.Vector3(0, 1, 0);
                const perpA = new THREE.Vector3().crossVectors(dir, ref).normalize();
                const perpB = new THREE.Vector3().crossVectors(dir, perpA).normalize();
                for (let i = 1; i < segments; i++) {
                    const t = i / segments;
                    const base = new THREE.Vector3().lerpVectors(start, end, t);
                    const falloff = Math.sin(t * Math.PI);
                    const ja = (Math.random() - 0.5) * jitter * falloff;
                    const jb = (Math.random() - 0.5) * jitter * falloff;
                    pts[i] = base.add(perpA.clone().multiplyScalar(ja))
                                 .add(perpB.clone().multiplyScalar(jb));
                }
                return pts;
            }

            function buildBoltTree(out, start, end, segments, jitter, depth) {
                const pts = jaggedPath(start, end, segments, jitter);
                for (let i = 0; i < pts.length - 1; i++) {
                    out.push(pts[i].x, pts[i].y, pts[i].z,
                             pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
                }
                if (depth >= maxDepth) return;
                const dir = new THREE.Vector3().subVectors(end, start);
                const ref = Math.abs(dir.y) > 0.9 * dir.length()
                    ? new THREE.Vector3(1, 0, 0)
                    : new THREE.Vector3(0, 1, 0);
                const perpA = new THREE.Vector3().crossVectors(dir, ref).normalize();
                const perpB = new THREE.Vector3().crossVectors(dir, perpA).normalize();
                const remainingLength = dir.length() * branchLengthRatio;
                for (let i = 2; i < pts.length - 1; i++) {
                    if (Math.random() > branchProbability) continue;
                    const bs = pts[i];
                    const a = (Math.random() - 0.5) * 2;
                    const b = (Math.random() - 0.5) * 2;
                    const along = 0.3 + Math.random() * 0.4;
                    const branchDir = new THREE.Vector3()
                        .addScaledVector(perpA, a)
                        .addScaledVector(perpB, b)
                        .addScaledVector(dir.clone().normalize(), along)
                        .normalize()
                        .multiplyScalar(remainingLength * (0.5 + Math.random() * 0.6));
                    const be = bs.clone().add(branchDir);
                    const subSegs = Math.max(3, Math.floor(segments * 0.55));
                    buildBoltTree(out, bs, be, subSegs, jitter * 0.8, depth + 1);
                }
            }

            function spawnBolt() {
                const phi = Math.random() * Math.PI * 2;
                const cosTheta = (Math.random() * 2 - 1) * 0.6;
                const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
                const length = boltLength * (0.65 + Math.random() * 0.5);
                const start = new THREE.Vector3().copy(die.body.position);
                const end = new THREE.Vector3(
                    start.x + sinTheta * Math.cos(phi) * length,
                    start.y + cosTheta * length,
                    start.z + sinTheta * Math.sin(phi) * length,
                );

                const positionsArr = [];
                buildBoltTree(positionsArr, start, end, trunkSegments, trunkJitter, 0);
                const positions = new Float32Array(positionsArr);
                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

                const haloMat = new THREE.LineBasicMaterial({
                    color, transparent: true, opacity: 0.9,
                    blending: THREE.AdditiveBlending, depthWrite: false,
                });
                const coreMat = new THREE.LineBasicMaterial({
                    color: coreColor, transparent: true, opacity: 1,
                    blending: THREE.AdditiveBlending, depthWrite: false,
                });
                const halo = new THREE.LineSegments(geometry, haloMat);
                const core = new THREE.LineSegments(geometry, coreMat);
                boltGroup.add(halo);
                boltGroup.add(core);
                bolts.push({ halo, core, geometry, haloMat, coreMat, age: 0 });
            }

            function spawnSpark() {
                const material = new THREE.SpriteMaterial({
                    map: sparkTexture, color: coreColor,
                    transparent: true, opacity: 1,
                    blending: THREE.AdditiveBlending, depthWrite: false,
                });
                const sprite = new THREE.Sprite(material);
                sprite.position.copy(die.body.position);
                sprite.position.x += (Math.random() - 0.5) * 0.3;
                sprite.position.z += (Math.random() - 0.5) * 0.3;
                sprite.scale.setScalar(sparkSize * (0.55 + Math.random() * 0.8));
                sparks.push({
                    sprite, material,
                    age: 0,
                    vx: (Math.random() - 0.5) * 5,
                    vy: 0.6 + Math.random() * 3,
                    vz: (Math.random() - 0.5) * 5,
                });
                sparkGroup.add(sprite);
            }

            // ----- Cross-die arc construction (post-settle) -----

            function spawnCrossArc(targetDie) {
                const start = new THREE.Vector3(
                    die.body.position.x, die.body.position.y, die.body.position.z,
                );
                const end = new THREE.Vector3(
                    targetDie.body.position.x, targetDie.body.position.y, targetDie.body.position.z,
                );
                const geometry = buildJaggedLineGeometry(
                    start, end, crossArcSegments, crossArcJitter,
                );
                const haloMat = new THREE.LineBasicMaterial({
                    color, transparent: true, opacity: 0.9,
                    blending: THREE.AdditiveBlending, depthWrite: false,
                });
                const coreMat = new THREE.LineBasicMaterial({
                    color: coreColor, transparent: true, opacity: 1,
                    blending: THREE.AdditiveBlending, depthWrite: false,
                });
                const halo = new THREE.Line(geometry, haloMat);
                const core = new THREE.Line(geometry, coreMat);
                arcGroup.add(halo, core);
                arcs.push({ halo, core, geometry, haloMat, coreMat, age: 0 });
            }

            function disposeAll() {
                for (const b of bolts) {
                    b.haloMat.dispose();
                    b.coreMat.dispose();
                    b.geometry.dispose();
                }
                for (const s of sparks) s.material.dispose();
                for (const a of arcs) {
                    a.haloMat.dispose();
                    a.coreMat.dispose();
                    a.geometry.dispose();
                }
                bolts.length = sparks.length = arcs.length = 0;
                scene.remove(boltGroup);
                scene.remove(sparkGroup);
                scene.remove(arcGroup);
                settledElectricRegistry.delete(effectId);
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
                        if (!moving) {
                            // Transition to settled. Register in shared lookup and schedule
                            // the cross-arc phase window.
                            emitting = false;
                            settled = true;
                            const startDelay = crossArcDelay
                                + Math.random() * crossArcDelayVariance;
                            nextArcAttemptAt = now + startDelay;
                            arcPhaseEndAt = now + startDelay
                                + crossArcDuration + Math.random() * crossArcDurationVariance;
                            settledElectricRegistry.set(effectId, { die });
                        }
                    }
                    if (emitting) {
                        bAcc += dt * boltRate;
                        sAcc += dt * sparkRate;
                        while (bAcc >= 1) { spawnBolt(); bAcc -= 1; }
                        while (sAcc >= 1) { spawnSpark(); sAcc -= 1; }
                    }

                    // Pre-settle bolts: per-frame flicker + decay.
                    for (let i = bolts.length - 1; i >= 0; i--) {
                        const b = bolts[i];
                        b.age += dt * 1000;
                        if (b.age >= boltLifetime) {
                            boltGroup.remove(b.halo);
                            boltGroup.remove(b.core);
                            b.haloMat.dispose();
                            b.coreMat.dispose();
                            b.geometry.dispose();
                            bolts.splice(i, 1);
                            continue;
                        }
                        const lifeT = b.age / boltLifetime;
                        const baseAlpha = 1 - lifeT;
                        const flicker = 0.6 + Math.random() * 0.4;
                        b.haloMat.opacity = baseAlpha * 0.9 * flicker;
                        b.coreMat.opacity = baseAlpha * flicker;
                    }

                    // Sparks: ballistic with light gravity.
                    for (let i = sparks.length - 1; i >= 0; i--) {
                        const s = sparks[i];
                        s.age += dt * 1000;
                        if (s.age >= sparkLifetime) {
                            sparkGroup.remove(s.sprite);
                            s.material.dispose();
                            sparks.splice(i, 1);
                            continue;
                        }
                        s.sprite.position.x += s.vx * dt;
                        s.sprite.position.y += s.vy * dt;
                        s.sprite.position.z += s.vz * dt;
                        s.vy -= 6 * dt;
                        const lifeT = s.age / sparkLifetime;
                        s.material.opacity = lifeT < 0.1 ? 1 : 1 - (lifeT - 0.1) / 0.9;
                    }

                    // Cross-arc attempt: once settled, past initial delay, and still within
                    // the phase window — try arcing to each other settled electric die.
                    if (crossArcEnabled && settled && now >= nextArcAttemptAt && now < arcPhaseEndAt) {
                        for (const [id, entry] of settledElectricRegistry) {
                            if (id === effectId) continue;
                            const op = entry.die.body.position;
                            const ax = op.x - die.body.position.x;
                            const ay = op.y - die.body.position.y;
                            const az = op.z - die.body.position.z;
                            const dist = Math.hypot(ax, ay, az);
                            if (dist <= crossArcDistance && Math.random() < crossArcChance) {
                                spawnCrossArc(entry.die);
                            }
                        }
                        nextArcAttemptAt = now + crossArcCooldownMin
                            + Math.random() * (crossArcCooldownMax - crossArcCooldownMin);
                    }

                    // Once cross-arc phase ends, drop from registry so still-arcing
                    // neighbors don't target this die further.
                    if (settled && arcPhaseEndAt > 0 && now >= arcPhaseEndAt) {
                        if (settledElectricRegistry.has(effectId)) {
                            settledElectricRegistry.delete(effectId);
                        }
                    }

                    // Cross-arcs: flicker + decay.
                    for (let i = arcs.length - 1; i >= 0; i--) {
                        const a = arcs[i];
                        a.age += dt * 1000;
                        if (a.age >= crossArcLifetime) {
                            arcGroup.remove(a.halo);
                            arcGroup.remove(a.core);
                            a.haloMat.dispose();
                            a.coreMat.dispose();
                            a.geometry.dispose();
                            arcs.splice(i, 1);
                            continue;
                        }
                        const lifeT = a.age / crossArcLifetime;
                        const flicker = 0.6 + Math.random() * 0.4;
                        a.haloMat.opacity = (1 - lifeT) * 0.9 * flicker;
                        a.coreMat.opacity = (1 - lifeT) * flicker;
                    }

                    // Termination: pre-settle dice that never moved exit when their bolts
                    // dissipate; settled dice wait for arc phase to end + arcs to fade.
                    const postArcDone = settled
                        ? (now >= arcPhaseEndAt && arcs.length === 0)
                        : true;
                    if (!emitting && bolts.length === 0 && sparks.length === 0 && postArcDone) {
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
