import * as THREE from 'three';

/**
 * Frost effect: pale crystal sprites bleed off the tumbling die, drift down slowly, and
 * land as feathery frost patches on the floor that linger before melting away. A subtle
 * cold mist hangs around the die.
 *
 * Visually distinct from blood/acid by:
 *   - Snowflake-shaped crystal sprites (6-pointed star with side branches)
 *   - Floor patches use a feathery radial dendrite pattern, not blobs
 *   - Slower gravity so crystals "snow" down instead of splashing
 *   - Mist puffs that drift gently upward with the die's heat signature
 *   - Patches fade slowly — frost lingers longer than blood
 */

const CRYSTAL_VARIANTS = 4;
const PATCH_VARIANTS = 6;
let crystalTextureCache = null;
let patchTextureCache = null;
let mistTextureCache = null;
let sharedPlaneGeo = null;
let sharedShardGeo = null;

function buildCrystalTexture() {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const cx = size / 2;
    ctx.translate(cx, cx);
    ctx.strokeStyle = 'white';
    ctx.fillStyle = 'white';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    const arms = 6;
    const armLen = size * 0.42;
    const branchOffset = armLen * 0.55;
    const branchLen = armLen * 0.28;
    const rotOffset = Math.random() * Math.PI;

    ctx.beginPath();
    for (let a = 0; a < arms; a++) {
        const angle = rotOffset + (a / arms) * Math.PI * 2;
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(angle) * armLen, Math.sin(angle) * armLen);
        // Twin side branches halfway out each arm.
        const bx = Math.cos(angle) * branchOffset;
        const by = Math.sin(angle) * branchOffset;
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + Math.cos(angle + Math.PI / 3) * branchLen,
                   by + Math.sin(angle + Math.PI / 3) * branchLen);
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + Math.cos(angle - Math.PI / 3) * branchLen,
                   by + Math.sin(angle - Math.PI / 3) * branchLen);
    }
    ctx.stroke();
    // Bright center dot.
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
}

function buildPatchTexture() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const cx = size / 2;
    ctx.translate(cx, cx);

    // Faint backing wash so the patch has body, not just spindly lines.
    ctx.fillStyle = 'rgba(255,255,255,0.42)';
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.32, size * 0.30, 0, 0, Math.PI * 2);
    ctx.fill();

    // Crystalline dendrites radiating outward with side branches.
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    const branches = 9 + Math.floor(Math.random() * 4);
    for (let b = 0; b < branches; b++) {
        const angle = (b / branches) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
        const segments = 4 + Math.floor(Math.random() * 2);
        const segLen = (size * (0.18 + Math.random() * 0.18)) / segments;
        let x = 0, y = 0;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        for (let s = 0; s < segments; s++) {
            x += Math.cos(angle) * segLen + (Math.random() - 0.5) * 4;
            y += Math.sin(angle) * segLen + (Math.random() - 0.5) * 4;
            ctx.lineTo(x, y);
        }
        ctx.stroke();
        // Random small side branches off each dendrite.
        let bx = 0, by = 0;
        for (let s = 0; s < segments; s++) {
            bx += Math.cos(angle) * segLen;
            by += Math.sin(angle) * segLen;
            if (Math.random() < 0.55) {
                const sideAng = angle + (Math.random() < 0.5 ? 1 : -1) * Math.PI / 3;
                const sideLen = segLen * (0.4 + Math.random() * 0.4);
                ctx.beginPath();
                ctx.moveTo(bx, by);
                ctx.lineTo(bx + Math.cos(sideAng) * sideLen,
                           by + Math.sin(sideAng) * sideLen);
                ctx.stroke();
            }
        }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
}

function buildMistTexture() {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const cx = size / 2;
    const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
    g.addColorStop(0.00, 'rgba(255, 255, 255, 0.9)');
    g.addColorStop(0.45, 'rgba(210, 235, 255, 0.4)');
    g.addColorStop(1.00, 'rgba(180, 220, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
}

function getCrystalTexture() {
    if (!crystalTextureCache) {
        crystalTextureCache = [];
        for (let i = 0; i < CRYSTAL_VARIANTS; i++) crystalTextureCache.push(buildCrystalTexture());
    }
    return crystalTextureCache[Math.floor(Math.random() * crystalTextureCache.length)];
}
function getPatchTexture() {
    if (!patchTextureCache) {
        patchTextureCache = [];
        for (let i = 0; i < PATCH_VARIANTS; i++) patchTextureCache.push(buildPatchTexture());
    }
    return patchTextureCache[Math.floor(Math.random() * patchTextureCache.length)];
}
function getMistTexture() {
    if (!mistTextureCache) mistTextureCache = buildMistTexture();
    return mistTextureCache;
}
function getSharedPlaneGeometry() {
    if (!sharedPlaneGeo) sharedPlaneGeo = new THREE.PlaneGeometry(1, 1);
    return sharedPlaneGeo;
}

/**
 * Stretched octahedron geometry shared across every shard — 6 vertices, 8 triangular
 * faces, anchored so local Y is the long axis. Each shard then non-uniformly scales the
 * mesh to vary its proportions and orients the long axis along its velocity vector, so
 * shards fly tip-first like glass splinters.
 */
function getSharedShardGeometry() {
    if (!sharedShardGeo) sharedShardGeo = new THREE.OctahedronGeometry(1, 0);
    return sharedShardGeo;
}

/**
 * @param {Object} [options]
 * @param {number} [options.crystalColor=0xb8e2ff]
 * @param {number} [options.mistColor=0xd2ecff]
 * @param {number} [options.patchColor=0xc8e6ff]
 * @param {number} [options.shardColor=0xc8ecff]    Tint of the icy shard material.
 * @param {number} [options.shardSpecular=0xffffff] Specular highlight color.
 * @param {number} [options.shardEmissive=0x6699cc] Faint inner glow so shards read in shadow.
 * @param {number} [options.crystalEmissionRate=14]
 * @param {number} [options.mistEmissionRate=6]
 * @param {number} [options.shardEmissionRate=35]   High rate — shards are quick and dense.
 * @param {number} [options.crystalSize=0.32]
 * @param {number} [options.mistSize=0.85]
 * @param {number} [options.shardLength=0.32]       Local long-axis scale (world units).
 * @param {number} [options.shardWidth=0.07]        Local short-axis scale.
 * @param {number} [options.crystalLifetime=1500]   ms
 * @param {number} [options.mistLifetime=1200]      ms
 * @param {number} [options.shardLifetime=520]      ms — short and sharp.
 * @param {number} [options.patchLifetime=6500]     ms
 * @param {number} [options.patchBaseSize=0.85]
 * @param {number} [options.gravity=4]              Slower than fire's "rising heat"; snowfall.
 * @param {number} [options.shardGravity=12]        Shards are heavier — ballistic streaks.
 * @param {number} [options.shardEjectionSpeed=4.5]
 */
export function frost(options = {}) {
    const {
        crystalColor = 0xb8e2ff,
        mistColor = 0xd2ecff,
        patchColor = 0xc8e6ff,
        shardColor = 0xc8ecff,
        shardSpecular = 0xffffff,
        shardEmissive = 0x6699cc,
        crystalEmissionRate = 14,
        mistEmissionRate = 6,
        shardEmissionRate = 35,
        crystalSize = 0.32,
        mistSize = 0.85,
        shardLength = 0.32,
        shardWidth = 0.07,
        crystalLifetime = 1500,
        mistLifetime = 1200,
        shardLifetime = 520,
        patchLifetime = 6500,
        patchBaseSize = 0.85,
        gravity = 4,
        shardGravity = 12,
        shardEjectionSpeed = 4.5,
    } = options;

    return {
        scope: 'die',
        create({ die, roller }) {
            const scene = roller.scene;
            const crystalGroup = new THREE.Group();
            const mistGroup = new THREE.Group();
            const shardGroup = new THREE.Group();
            const patchGroup = new THREE.Group();
            scene.add(crystalGroup, mistGroup, shardGroup, patchGroup);
            const mistTexture = getMistTexture();
            const planeGeo = getSharedPlaneGeometry();
            const shardGeo = getSharedShardGeometry();

            const crystals = [];
            const mists = [];
            const shards = [];
            const patches = [];

            let lastTime = performance.now();
            let cAcc = 0, mAcc = 0, sAcc = 0;
            let emitting = true;
            let killed = false;

            function spawnCrystal() {
                const material = new THREE.SpriteMaterial({
                    map: getCrystalTexture(), color: crystalColor,
                    transparent: true, opacity: 0,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                    rotation: Math.random() * Math.PI * 2,
                });
                const sprite = new THREE.Sprite(material);
                sprite.position.copy(die.body.position);
                sprite.position.x += (Math.random() - 0.5) * 0.5;
                sprite.position.z += (Math.random() - 0.5) * 0.5;
                sprite.position.y += 0.15;
                const baseSize = crystalSize * (0.7 + Math.random() * 0.6);
                sprite.scale.setScalar(baseSize);
                crystals.push({
                    sprite, material, baseSize,
                    age: 0,
                    vx: (Math.random() - 0.5) * 0.7,
                    vy: 0.4 + Math.random() * 0.6,
                    vz: (Math.random() - 0.5) * 0.7,
                    spin: (Math.random() - 0.5) * 2,
                });
                crystalGroup.add(sprite);
            }

            function spawnMist() {
                const material = new THREE.SpriteMaterial({
                    map: mistTexture, color: mistColor,
                    transparent: true, opacity: 0,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                });
                const sprite = new THREE.Sprite(material);
                sprite.position.copy(die.body.position);
                sprite.position.x += (Math.random() - 0.5) * 0.55;
                sprite.position.z += (Math.random() - 0.5) * 0.55;
                sprite.position.y += 0.25;
                const baseSize = mistSize * (0.7 + Math.random() * 0.6);
                sprite.scale.setScalar(baseSize);
                mists.push({
                    sprite, material, baseSize,
                    age: 0,
                    vx: (Math.random() - 0.5) * 0.4,
                    vy: 0.15 + Math.random() * 0.25,
                    vz: (Math.random() - 0.5) * 0.4,
                });
                mistGroup.add(sprite);
            }

            function spawnShard() {
                // Phong material so the stretched octahedron's faces catch the directional
                // light — that's where the angular "glass" look comes from. A faint emissive
                // makes them readable even in deep shadow on the back of a die.
                const material = new THREE.MeshPhongMaterial({
                    color: shardColor,
                    specular: shardSpecular,
                    shininess: 90,
                    emissive: shardEmissive,
                    emissiveIntensity: 0.45,
                    transparent: true,
                    opacity: 0,
                    depthWrite: false,
                    flatShading: true,
                });
                const mesh = new THREE.Mesh(shardGeo, material);
                mesh.position.copy(die.body.position);
                mesh.position.x += (Math.random() - 0.5) * 0.3;
                mesh.position.z += (Math.random() - 0.5) * 0.3;
                mesh.position.y += 0.15;

                // Non-uniform scale on the local axes: long on Y, narrow on X and Z (with
                // slight asymmetry between X and Z so shards aren't perfectly circular in
                // cross-section).
                const len = shardLength * (0.7 + Math.random() * 0.6);
                const wA = shardWidth * (0.7 + Math.random() * 0.6);
                const wB = shardWidth * (0.6 + Math.random() * 0.7);
                mesh.scale.set(wA, len, wB);

                // Eject in a random XZ direction with a small upward kick.
                const angle = Math.random() * Math.PI * 2;
                const speed = shardEjectionSpeed * (0.7 + Math.random() * 0.7);
                const vx = Math.cos(angle) * speed;
                const vz = Math.sin(angle) * speed;
                const vy = 0.6 + Math.random() * 2.6;

                // Rotate the mesh so its local Y axis (the long one) points along velocity.
                // setFromUnitVectors handles the math — points the +Y direction at the
                // velocity direction.
                const velocityDir = new THREE.Vector3(vx, vy, vz).normalize();
                mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), velocityDir);

                shards.push({
                    mesh, material,
                    age: 0,
                    vx, vy, vz,
                    // Tumbling rotation rates around each local axis (in radians / s).
                    // Y-axis spin is faster — gives the "spinning along its length" feel.
                    rx: (Math.random() - 0.5) * 5,
                    ry: (Math.random() - 0.5) * 8,
                    rz: (Math.random() - 0.5) * 5,
                });
                shardGroup.add(mesh);
            }

            function spawnPatch(x, z) {
                const material = new THREE.MeshBasicMaterial({
                    map: getPatchTexture(), color: patchColor,
                    transparent: true, opacity: 0,
                    depthWrite: false,
                });
                const baseSize = patchBaseSize * (0.55 + Math.random() * 0.85);
                const mesh = new THREE.Mesh(planeGeo, material);
                mesh.position.set(x, 0.025, z);
                mesh.rotation.x = -Math.PI / 2;
                mesh.rotation.z = Math.random() * Math.PI * 2;
                mesh.scale.setScalar(baseSize);
                patchGroup.add(mesh);
                patches.push({ mesh, material, baseSize, age: 0 });
            }

            function disposeAll() {
                for (const c of crystals) c.material.dispose();
                for (const m of mists) m.material.dispose();
                for (const s of shards) s.material.dispose();
                for (const p of patches) p.material.dispose();
                crystals.length = mists.length = shards.length = patches.length = 0;
                scene.remove(crystalGroup);
                scene.remove(mistGroup);
                scene.remove(shardGroup);
                scene.remove(patchGroup);
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
                    if (emitting) {
                        cAcc += dt * crystalEmissionRate;
                        mAcc += dt * mistEmissionRate;
                        sAcc += dt * shardEmissionRate;
                        while (cAcc >= 1) { spawnCrystal(); cAcc -= 1; }
                        while (mAcc >= 1) { spawnMist(); mAcc -= 1; }
                        while (sAcc >= 1) { spawnShard(); sAcc -= 1; }
                    }

                    // Crystals: drift under low gravity, land as patches near floor.
                    for (let i = crystals.length - 1; i >= 0; i--) {
                        const c = crystals[i];
                        c.age += dt * 1000;
                        if (c.age >= crystalLifetime) {
                            crystalGroup.remove(c.sprite);
                            c.material.dispose();
                            crystals.splice(i, 1);
                            continue;
                        }
                        c.sprite.position.x += c.vx * dt;
                        c.sprite.position.y += c.vy * dt;
                        c.sprite.position.z += c.vz * dt;
                        c.vy -= gravity * dt;
                        c.material.rotation += c.spin * dt;
                        const lifeT = c.age / crystalLifetime;
                        c.material.opacity = lifeT < 0.12 ? lifeT / 0.12 * 0.95 : (1 - lifeT) * 0.95;
                        if (c.sprite.position.y <= 0.1 && lifeT > 0.08) {
                            spawnPatch(c.sprite.position.x, c.sprite.position.z);
                            crystalGroup.remove(c.sprite);
                            c.material.dispose();
                            crystals.splice(i, 1);
                        }
                    }

                    // Mists: gentle drift + grow + fade.
                    for (let i = mists.length - 1; i >= 0; i--) {
                        const m = mists[i];
                        m.age += dt * 1000;
                        if (m.age >= mistLifetime) {
                            mistGroup.remove(m.sprite);
                            m.material.dispose();
                            mists.splice(i, 1);
                            continue;
                        }
                        m.sprite.position.x += m.vx * dt;
                        m.sprite.position.y += m.vy * dt;
                        m.sprite.position.z += m.vz * dt;
                        const lifeT = m.age / mistLifetime;
                        m.sprite.scale.setScalar(m.baseSize * (1 + lifeT * 0.6));
                        m.material.opacity = lifeT < 0.2
                            ? (lifeT / 0.2) * 0.5
                            : (1 - lifeT) * 0.5;
                    }

                    // Shards: 3D crystal meshes tumbling outward as ballistic streaks.
                    for (let i = shards.length - 1; i >= 0; i--) {
                        const sh = shards[i];
                        sh.age += dt * 1000;
                        if (sh.age >= shardLifetime || sh.mesh.position.y < -0.05) {
                            shardGroup.remove(sh.mesh);
                            sh.material.dispose();
                            shards.splice(i, 1);
                            continue;
                        }
                        sh.mesh.position.x += sh.vx * dt;
                        sh.mesh.position.y += sh.vy * dt;
                        sh.mesh.position.z += sh.vz * dt;
                        sh.vy -= shardGravity * dt;
                        // Tumble in 3D — quaternion-multiply with a small Euler-derived
                        // rotation each frame so the rotation accumulates around the
                        // mesh's CURRENT local axes (gives a natural "tumbling crystal"
                        // feel rather than a single axis spin).
                        sh.mesh.rotateX(sh.rx * dt);
                        sh.mesh.rotateY(sh.ry * dt);
                        sh.mesh.rotateZ(sh.rz * dt);
                        const lifeT = sh.age / shardLifetime;
                        sh.material.opacity = lifeT < 0.08
                            ? lifeT / 0.08 * 0.92
                            : lifeT > 0.75 ? (1 - lifeT) / 0.25 * 0.92 : 0.92;
                    }

                    // Patches: splash-in, hold, fade.
                    for (let i = patches.length - 1; i >= 0; i--) {
                        const p = patches[i];
                        p.age += dt * 1000;
                        if (p.age >= patchLifetime) {
                            patchGroup.remove(p.mesh);
                            p.material.dispose();
                            patches.splice(i, 1);
                            continue;
                        }
                        const lifeT = p.age / patchLifetime;
                        if (p.age < 200) p.material.opacity = (p.age / 200) * 0.85;
                        else if (lifeT > 0.7) p.material.opacity = 0.85 * (1 - (lifeT - 0.7) / 0.3);
                        else p.material.opacity = 0.85;
                    }

                    if (!emitting && crystals.length === 0 && mists.length === 0 && shards.length === 0 && patches.length === 0) {
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
