
import * as CANNON from 'cannon-es';

export let world;
export let diceMaterial;
let walls = [];

export function initPhysics() {
    world = new CANNON.World({ gravity: new CANNON.Vec3(0, -50, 0) });
    world.broadphase = new CANNON.NaiveBroadphase();
    world.solver.iterations = 30; // Increased for more accurate settling
    diceMaterial = new CANNON.Material('dice');
    const floorPhysicsMaterial = new CANNON.Material('floor');
    world.addContactMaterial(new CANNON.ContactMaterial(diceMaterial, floorPhysicsMaterial, { friction: 0.2, restitution: 0.4 }));
    world.addContactMaterial(new CANNON.ContactMaterial(diceMaterial, diceMaterial, { friction: 0.1, restitution: 0.5 }));
    world.addContactMaterial(new CANNON.ContactMaterial(diceMaterial, new CANNON.Material('wall'), { friction: 0.1, restitution: 0.8 }));
    const floorBody = new CANNON.Body({ mass: 0, material: floorPhysicsMaterial, shape: new CANNON.Plane() });
    floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    world.addBody(floorBody);
    const frustumSize = 18;
    const aspect = window.innerWidth / window.innerHeight;
    const topBound = frustumSize / 2;
    const bottomBound = -frustumSize / 2;
    updatePhysicsWalls(world, frustumSize, aspect, topBound, bottomBound);
}

export function updatePhysicsWalls(world, frustumSize, aspect, topBound, bottomBound) {
    // Remove existing walls
    walls.forEach(wall => world.removeBody(wall));
    walls = [];

    const wallThickness = 2;
    const wallHeight = 20;
    const wallMaterial = new CANNON.Material('wall');
    
    const leftBound = -frustumSize * aspect / 2;
    const rightBound = frustumSize * aspect / 2;

    // Left Wall
    const leftWall = new CANNON.Body({
        mass: 0,
        shape: new CANNON.Box(new CANNON.Vec3(wallThickness / 2, wallHeight / 2, frustumSize / 2)),
        material: wallMaterial
    });
    leftWall.position.set(leftBound - wallThickness / 2, wallHeight / 2, 0);
    world.addBody(leftWall);
    walls.push(leftWall);

    // Right Wall
    const rightWall = new CANNON.Body({
        mass: 0,
        shape: new CANNON.Box(new CANNON.Vec3(wallThickness / 2, wallHeight / 2, frustumSize / 2)),
        material: wallMaterial
    });
    rightWall.position.set(rightBound + wallThickness / 2, wallHeight / 2, 0);
    world.addBody(rightWall);
    walls.push(rightWall);

    // Front Wall
    const frontWall = new CANNON.Body({
        mass: 0,
        shape: new CANNON.Box(new CANNON.Vec3(frustumSize * aspect / 2, wallHeight / 2, wallThickness / 2)),
        material: wallMaterial
    });
    frontWall.position.set(0, wallHeight / 2, topBound + wallThickness / 2);
    world.addBody(frontWall);
    walls.push(frontWall);

    // Back Wall
    const backWall = new CANNON.Body({
        mass: 0,
        shape: new CANNON.Box(new CANNON.Vec3(frustumSize * aspect / 2, wallHeight / 2, wallThickness / 2)),
        material: wallMaterial
    });
    backWall.position.set(0, wallHeight / 2, bottomBound - wallThickness / 2);
    world.addBody(backWall);
    walls.push(backWall);
}
