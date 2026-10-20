import * as CANNON from 'cannon-es';
import { isDieSettled, trackRestSteps } from './physics-config.js';

/**
 * The roll prediction as plain data, so it can run off the main thread.
 *
 * describeWorld() copies the live world, plus the thrown prediction bodies, into plain
 * numbers and arrays; buildWorld() rebuilds that world body for body in the same order with
 * the same shapes, materials, contact materials and solver settings; simulateThrow() steps it
 * exactly as the roller always has and records every moving body's state after every step.
 * The roller replays that recording instead of simulating the throw a second time.
 *
 * Bit-identical by construction: the rebuilt world runs the same cannon-es code on the same
 * inputs in the same order. Materials are matched by identity, not name: the walls' 'wall'
 * material is not the one in the dice-wall contact material, so those contacts use the
 * default contact material, and the rebuilt world keeps it that way.
 */

/** Physics steps simulated at least, and at most, before a throw counts as at rest. */
export const MIN_STEPS = 60;
export const MAX_STEPS = 5000;

/** Floats recorded per body per step: position 3, quaternion 4, velocity 3, angular velocity 3, rest steps 1. */
export const STATE_SIZE = 14;

const vec = (v) => [v.x, v.y, v.z];
const quat = (q) => [q.x, q.y, q.z, q.w];

function describeShape(shape) {
    if (shape instanceof CANNON.Box) return { kind: 'box', halfExtents: vec(shape.halfExtents) };
    if (shape instanceof CANNON.Plane) return { kind: 'plane' };
    if (shape instanceof CANNON.ConvexPolyhedron) {
        return { kind: 'convex', vertices: shape.vertices.map(vec), faces: shape.faces.map((f) => f.slice()) };
    }
    if (shape instanceof CANNON.Sphere) return { kind: 'sphere', radius: shape.radius };
    throw new Error(`open-dice-dnd: cannot describe a ${shape.constructor.name} shape for the prediction`);
}

function contactParams(cm) {
    return {
        friction: cm.friction,
        restitution: cm.restitution,
        contactEquationStiffness: cm.contactEquationStiffness,
        contactEquationRelaxation: cm.contactEquationRelaxation,
        frictionEquationStiffness: cm.frictionEquationStiffness,
        frictionEquationRelaxation: cm.frictionEquationRelaxation,
    };
}

/**
 * The live world plus `added` bodies (appended in order, as if added to the world) as plain
 * data. `record` and `watch` are bodies of either list: `record` are the bodies whose states
 * the recording keeps, `watch` the bodies that must rest before the simulation stops.
 */
export function describeWorld(world, { added = [], record = [], watch = [] } = {}) {
    if (!(world.broadphase instanceof CANNON.NaiveBroadphase)) throw new Error('open-dice-dnd: the prediction expects a NaiveBroadphase');
    if (world.constraints.length > 0 || world.subsystems.length > 0) throw new Error('open-dice-dnd: the prediction does not support constraints');
    const bodies = [...world.bodies, ...added];
    const materials = [];
    const materialIndex = (m) => {
        if (!m) return -1;
        let i = materials.indexOf(m);
        if (i < 0) { i = materials.length; materials.push(m); }
        return i;
    };
    const contactMaterials = world.contactmaterials.map((cm) => ({
        a: materialIndex(cm.materials[0]),
        b: materialIndex(cm.materials[1]),
        ...contactParams(cm),
    }));
    const describedBodies = bodies.map((b) => {
        if (b.shapes.length === 0) throw new Error('open-dice-dnd: a body without shapes cannot be predicted');
        return {
            type: b.type,
            mass: b.mass,
            material: materialIndex(b.material),
            shapes: b.shapes.map(describeShape),
            shapeOffsets: b.shapeOffsets.map(vec),
            shapeOrientations: b.shapeOrientations.map(quat),
            position: vec(b.position),
            quaternion: quat(b.quaternion),
            velocity: vec(b.velocity),
            angularVelocity: vec(b.angularVelocity),
            force: vec(b.force),
            torque: vec(b.torque),
            invInertiaWorld: b.invInertiaWorld.elements.slice(),
            linearDamping: b.linearDamping,
            angularDamping: b.angularDamping,
            linearFactor: vec(b.linearFactor),
            angularFactor: vec(b.angularFactor),
            fixedRotation: b.fixedRotation,
            collisionFilterGroup: b.collisionFilterGroup,
            collisionFilterMask: b.collisionFilterMask,
            collisionResponse: b.collisionResponse,
            allowSleep: b.allowSleep,
            modelDie: !!b.modelDie,
            restSteps: b.restSteps || 0,
        };
    });
    const index = (b) => {
        const i = bodies.indexOf(b);
        if (i < 0) throw new Error('open-dice-dnd: a recorded body is not in the world');
        return i;
    };
    return {
        gravity: vec(world.gravity),
        iterations: world.solver.iterations,
        tolerance: world.solver.tolerance,
        quatNormalizeFast: world.quatNormalizeFast,
        quatNormalizeSkip: world.quatNormalizeSkip,
        allowSleep: world.allowSleep,
        defaultContactMaterial: contactParams(world.defaultContactMaterial),
        materials: materials.map((m) => ({ name: m.name, friction: m.friction, restitution: m.restitution })),
        contactMaterials,
        bodies: describedBodies,
        record: record.map(index),
        watch: watch.map(index),
    };
}

function buildShape(s) {
    switch (s.kind) {
        case 'box': return new CANNON.Box(new CANNON.Vec3(...s.halfExtents));
        case 'plane': return new CANNON.Plane();
        case 'sphere': return new CANNON.Sphere(s.radius);
        case 'convex': return new CANNON.ConvexPolyhedron({
            vertices: s.vertices.map((v) => new CANNON.Vec3(v[0], v[1], v[2])),
            faces: s.faces.map((f) => f.slice()),
        });
        default: throw new Error(`open-dice-dnd: unknown shape kind ${s.kind}`);
    }
}

function applyContactParams(cm, p) {
    cm.friction = p.friction;
    cm.restitution = p.restitution;
    cm.contactEquationStiffness = p.contactEquationStiffness;
    cm.contactEquationRelaxation = p.contactEquationRelaxation;
    cm.frictionEquationStiffness = p.frictionEquationStiffness;
    cm.frictionEquationRelaxation = p.frictionEquationRelaxation;
}

/** Rebuild a described world. Returns `{ world, bodies }`, bodies in description order. */
export function buildWorld(desc) {
    const world = new CANNON.World({ gravity: new CANNON.Vec3(...desc.gravity) });
    world.broadphase = new CANNON.NaiveBroadphase();
    world.solver.iterations = desc.iterations;
    world.solver.tolerance = desc.tolerance;
    world.quatNormalizeFast = desc.quatNormalizeFast;
    world.quatNormalizeSkip = desc.quatNormalizeSkip;
    world.allowSleep = desc.allowSleep;
    applyContactParams(world.defaultContactMaterial, desc.defaultContactMaterial);
    trackRestSteps(world);

    const materials = desc.materials.map((m) => {
        const material = new CANNON.Material(m.name);
        material.friction = m.friction;
        material.restitution = m.restitution;
        return material;
    });
    for (const c of desc.contactMaterials) {
        const cm = new CANNON.ContactMaterial(materials[c.a], materials[c.b], {});
        applyContactParams(cm, c);
        world.addContactMaterial(cm);
    }

    const bodies = desc.bodies.map((d) => {
        // Created at the origin and posed afterwards, as the dice always are: a body's world
        // inertia is computed when its shape is added, then carried over from the original below.
        const body = new CANNON.Body({ mass: d.mass, type: d.type, material: d.material >= 0 ? materials[d.material] : undefined });
        d.shapes.forEach((s, i) => body.addShape(buildShape(s), new CANNON.Vec3(...d.shapeOffsets[i]), new CANNON.Quaternion(...d.shapeOrientations[i])));
        body.position.set(...d.position);
        body.quaternion.set(...d.quaternion);
        body.velocity.set(...d.velocity);
        body.angularVelocity.set(...d.angularVelocity);
        body.force.set(...d.force);
        body.torque.set(...d.torque);
        body.invInertiaWorld.elements = d.invInertiaWorld.slice();
        body.linearDamping = d.linearDamping;
        body.angularDamping = d.angularDamping;
        body.linearFactor.set(...d.linearFactor);
        body.angularFactor.set(...d.angularFactor);
        body.fixedRotation = d.fixedRotation;
        body.collisionFilterGroup = d.collisionFilterGroup;
        body.collisionFilterMask = d.collisionFilterMask;
        body.collisionResponse = d.collisionResponse;
        body.allowSleep = d.allowSleep;
        if (d.modelDie) body.modelDie = true;
        body.restSteps = d.restSteps;
        world.addBody(body);
        return body;
    });
    return { world, bodies };
}

/** Copy one body's state into `out` at `offset` (STATE_SIZE floats). */
export function writeState(body, out, offset) {
    const p = body.position, q = body.quaternion, v = body.velocity, w = body.angularVelocity;
    out[offset] = p.x; out[offset + 1] = p.y; out[offset + 2] = p.z;
    out[offset + 3] = q.x; out[offset + 4] = q.y; out[offset + 5] = q.z; out[offset + 6] = q.w;
    out[offset + 7] = v.x; out[offset + 8] = v.y; out[offset + 9] = v.z;
    out[offset + 10] = w.x; out[offset + 11] = w.y; out[offset + 12] = w.z;
    out[offset + 13] = body.restSteps || 0;
}

/** Put a recorded state back into a body. */
export function readState(body, states, offset) {
    body.position.set(states[offset], states[offset + 1], states[offset + 2]);
    body.quaternion.set(states[offset + 3], states[offset + 4], states[offset + 5], states[offset + 6]);
    body.velocity.set(states[offset + 7], states[offset + 8], states[offset + 9]);
    body.angularVelocity.set(states[offset + 10], states[offset + 11], states[offset + 12]);
    body.restSteps = states[offset + 13];
}

/**
 * Step a world until every watched body rests, as the roller's prediction always has: at
 * least MIN_STEPS steps, at most MAX_STEPS. Records, after every step, the state of each
 * recorded body (`states`, steps x bodies x STATE_SIZE) and every collision a recorded body
 * takes part in, with the impact speed the roller's sounds read (`events`: [step, body, impact]
 * triples; `step` is 1-based, the step after which it happened).
 */
export function simulateThrow(world, recordBodies, watchBodies, { minSteps = MIN_STEPS, maxSteps = MAX_STEPS } = {}) {
    const n = recordBodies.length;
    const chunks = [];
    const events = [];
    let step = 0;
    const listeners = recordBodies.map((body, i) => {
        const listener = (event) => {
            events.push(step + 1, i, Math.abs(event.contact.getImpactVelocityAlongNormal()));
        };
        body.addEventListener('collide', listener);
        return listener;
    });
    try {
        for (; step < maxSteps;) {
            world.step(1 / 60);
            const frame = new Float64Array(n * STATE_SIZE);
            for (let i = 0; i < n; i++) writeState(recordBodies[i], frame, i * STATE_SIZE);
            chunks.push(frame);
            const done = step;
            step++;
            if (done < minSteps) continue;
            if (watchBodies.every((b) => isDieSettled(b))) break;
        }
    } finally {
        recordBodies.forEach((body, i) => body.removeEventListener('collide', listeners[i]));
    }
    const states = new Float64Array(step * n * STATE_SIZE);
    chunks.forEach((frame, s) => states.set(frame, s * n * STATE_SIZE));
    return { steps: step, bodies: n, states, events: Float64Array.from(events) };
}

/** Build a described world and simulate its throw: what the worker and the main-thread fallback both run. */
export function runPrediction(desc, options) {
    const { world, bodies } = buildWorld(desc);
    return simulateThrow(world, desc.record.map((i) => bodies[i]), desc.watch.map((i) => bodies[i]), options);
}
