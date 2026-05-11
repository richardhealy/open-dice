import * as THREE from 'three';

/**
 * Rain rotating rectangle confetti from the die. Each piece picks a random color from
 * the palette, gets velocity biased upward, has its own rotation rate, and fades over
 * the last 30% of duration.
 *
 * @param {Object}    [options]
 * @param {number[]}  [options.colors]               Hex palette. Each particle picks one at random.
 * @param {number}    [options.count=60]
 * @param {number}    [options.duration=2500]        ms
 * @param {number}    [options.spread=3]             Initial speed magnitude.
 * @param {number}    [options.gravity=5]            Downward acceleration.
 * @param {number}    [options.size=0.15]            Long edge of each rectangle.
 * @param {number}    [options.aspect=0.5]           Short edge / long edge.
 */
export function confetti(options = {}) {
    const {
        colors = [0xfacc15, 0xef4444, 0x4ade80, 0x60a5fa, 0xf472b6, 0xa78bfa],
        count = 60, duration = 2500, spread = 3, gravity = 5, size = 0.15, aspect = 0.5,
    } = options;
    return {
        scope: 'die',
        create(ctx) {
            const { die, roller } = ctx;
            const scene = roller.scene;
            const group = new THREE.Group();
            const particles = [];

            const sharedGeometry = new THREE.PlaneGeometry(size, size * aspect);
            for (let i = 0; i < count; i++) {
                const color = colors[Math.floor(Math.random() * colors.length)];
                const mesh = new THREE.Mesh(
                    sharedGeometry,
                    new THREE.MeshBasicMaterial({
                        color, side: THREE.DoubleSide,
                        transparent: true, opacity: 1,
                    })
                );
                mesh.position.copy(die.body.position);
                const phi = Math.random() * Math.PI * 2;
                const cosTheta = Math.random();
                const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
                const speed = (0.6 + Math.random() * 0.6) * spread;
                particles.push({
                    mesh,
                    vx: sinTheta * Math.cos(phi) * speed,
                    vy: cosTheta * speed * 1.5,
                    vz: sinTheta * Math.sin(phi) * speed,
                    rx: (Math.random() - 0.5) * 6,
                    ry: (Math.random() - 0.5) * 6,
                    rz: (Math.random() - 0.5) * 6,
                });
                group.add(mesh);
            }
            scene.add(group);

            const startTime = performance.now();
            let lastTime = startTime;
            let disposed = false;
            function disposeAll() {
                if (disposed) return;
                disposed = true;
                scene.remove(group);
                particles.forEach(p => p.mesh.material.dispose());
                sharedGeometry.dispose();
            }
            return {
                update() {
                    if (disposed) return true;
                    const now = performance.now();
                    const dt = (now - lastTime) / 1000;
                    lastTime = now;
                    const t = Math.min((now - startTime) / duration, 1);
                    const fade = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
                    particles.forEach(p => {
                        p.mesh.position.x += p.vx * dt;
                        p.mesh.position.y += p.vy * dt;
                        p.mesh.position.z += p.vz * dt;
                        p.vy -= gravity * dt;
                        p.mesh.rotation.x += p.rx * dt;
                        p.mesh.rotation.y += p.ry * dt;
                        p.mesh.rotation.z += p.rz * dt;
                        p.mesh.material.opacity = fade;
                    });
                    if (t >= 1) {
                        disposeAll();
                        return true;
                    }
                    return false;
                },
                cleanup: disposeAll,
            };
        }
    };
}
