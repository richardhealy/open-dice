import * as CANNON from 'cannon-es';

/**
 * The roller's physics, in one place, so the model studio throws a model exactly as a roll
 * would: same gravity, solver, contact materials, damping, rest test and throw ranges.
 */

export const GRAVITY_Y = -50;
export const SOLVER_ITERATIONS = 30;
export const CONTACT = Object.freeze({
    diceFloor: Object.freeze({ friction: 0.2, restitution: 0.4 }),
    diceDice: Object.freeze({ friction: 0.1, restitution: 0.5 }),
    diceWall: Object.freeze({ friction: 0.1, restitution: 0.8 }),
});
export const DIE_DAMPING = 0.1;
/** A die rests when both its speed and its spin, squared, fall below this. */
export const SETTLED_THRESHOLD = 0.01;
/** Height of the visible table in world units; its width follows the canvas aspect. */
export const FRUSTUM_SIZE = 18;
export const WALL_THICKNESS = 2;
export const WALL_HEIGHT = 20;

/**
 * Put a die body into its thrown state from a seed of uniform numbers in [0, 1):
 * `{ xPos, yPos, zPos, rotAxis: [3], rotAngle, vel: [3], angVel: [3] }`. Dice enter from the
 * left edge of a table `aspect` wide per unit of height.
 */
export function applyThrow(body, rand, { aspect, throwSpeed, throwSpin }) {
    const margin = 2;
    const frustumSize = FRUSTUM_SIZE;
    const leftBound = -frustumSize * aspect / 2;

    const xPos = leftBound + margin + (rand.xPos * 4);
    const yPos = 4 + rand.yPos * 4;
    const zPos = (rand.zPos - 0.5) * (frustumSize * 0.9);
    body.position.set(xPos, yPos, zPos);

    body.quaternion.setFromAxisAngle(
        new CANNON.Vec3(rand.rotAxis[0], rand.rotAxis[1], rand.rotAxis[2]).unit(),
        rand.rotAngle * Math.PI * 2
    );

    body.velocity.set(
        (0.8 + 0.8 * rand.vel[0]) * throwSpeed,
        (rand.vel[1] * 0.2) * throwSpeed * 0.5,
        (rand.vel[2] - 0.5) * throwSpeed
    );

    body.angularVelocity.set(
        (rand.angVel[0] - 0.5) * throwSpin * 1.5,
        (rand.angVel[1] - 0.5) * throwSpin * 1.5,
        (rand.angVel[2] - 0.5) * throwSpin * 1.5
    );
}

/** True once a body's speed and spin have both died down. */
export function isBodySettled(body) {
    return body.velocity.lengthSquared() < SETTLED_THRESHOLD &&
           body.angularVelocity.lengthSquared() < SETTLED_THRESHOLD;
}

/**
 * A model die must stay at rest this many physics steps in a row before it counts as settled.
 * An irregular shape rocking on an edge passes through rest at the top of every rock, and a
 * single still step would freeze it there, tilted.
 */
export const MODEL_REST_STEPS = 10;

/** Keep `body.restSteps`, the physics steps in a row each moving body has been at rest. */
export function trackRestSteps(world) {
    world.addEventListener('postStep', () => {
        for (const body of world.bodies) {
            if (body.mass === 0) continue;
            body.restSteps = isBodySettled(body) ? (body.restSteps || 0) + 1 : 0;
        }
    });
}

/** Settled for the roller: model dice need MODEL_REST_STEPS still steps in a row, classic dice one. */
export function isDieSettled(body) {
    return body.modelDie ? (body.restSteps || 0) >= MODEL_REST_STEPS : isBodySettled(body);
}
