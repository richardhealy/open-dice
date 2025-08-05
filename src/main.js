
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { initScene, scene, camera, renderer, up, floor, directionalLight } from './scene.js';
import { initPhysics, world, diceMaterial, updatePhysicsWalls } from './physics.js';
import { setupUI } from './ui.js';
import { createDie, getDieValue } from './dice.js';

// --- GLOBAL VARIABLES ---
const dice = [];
let allDiceSettled = false;

// --- DICE ROLLING & RESULTS ---
function rollDice(rollRequests) {
    if (floor) floor.material.opacity = 0.5; // Restore shadow opacity for new rolls
    clearDice();
    document.getElementById('results-container').style.visibility = 'hidden';
    document.getElementById('results-container').innerText = '';
    allDiceSettled = false; // Reset flag so total can be calculated again

    const throwSpeed = parseFloat(document.getElementById('throw-speed').value);
    const throwSpin = parseFloat(document.getElementById('throw-spin').value);

    rollRequests.forEach(request => {
        for (let i = 0; i < request.count; i++) {
            const die = createDie(request.type);
            if (!die) continue;
            dice.push(die);

            // Position dice for a more scattered and dynamic throw
            const margin = 2;
            const frustumSize = 18;
            const aspect = window.innerWidth / window.innerHeight;
            let leftBound = -frustumSize * aspect / 2;
            const xPos = leftBound + margin + (Math.random() * 4); // Start from the left, but in a wider band
            const yPos = 4 + Math.random() * 4; // A bit higher for more tumble
            const zPos = (Math.random() - 0.5) * (frustumSize * 0.9); // Use almost the full depth for starting Z
            die.body.position.set(xPos, yPos, zPos);
            die.mesh.position.copy(die.body.position);

            // Give a random initial rotation
            die.body.quaternion.setFromAxisAngle(new CANNON.Vec3(Math.random(), Math.random(), Math.random()).unit(), Math.random() * Math.PI * 2);
            die.mesh.quaternion.copy(die.body.quaternion);

            // Apply velocities for a powerful and chaotic roll
            die.body.velocity.set(
                (0.8 + 0.8 * Math.random()) * throwSpeed,   // Even stronger push to the right
                (Math.random() * 0.2) * throwSpeed * 0.5,    // A little vertical push for a better tumble
                (Math.random() - 0.5) * throwSpeed          // More powerful side-to-side motion
            );

            // Apply more intense angular velocity for a wilder spin
            die.body.angularVelocity.set(
                (Math.random() - 0.5) * throwSpin * 1.5,
                (Math.random() - 0.5) * throwSpin * 1.5,
                (Math.random() - 0.5) * throwSpin * 1.5
            );
        }
    });
}

function clearDice() {
    dice.forEach(d => {
        scene.remove(d.mesh);
        world.removeBody(d.body);
    });
    dice.length = 0;
}

function resetDice() {
    const diceToFade = [...dice];
    dice.length = 0; // Clear the main dice array immediately

    document.getElementById('results-container').style.visibility = 'hidden';
    document.getElementById('results-container').innerText = '';

    if (diceToFade.length === 0) return;

    const fadeDuration = 500; // Increased from 300ms for a smoother effect
    const startTime = performance.now();

    // This inner function will run on each animation frame
    function fade() {
        const elapsedTime = performance.now() - startTime;
        const progress = Math.min(elapsedTime / fadeDuration, 1);

        // Apply an "ease-out" function to make the fade start fast and end slow
        const easedProgress = 1 - Math.pow(1 - progress, 3);
        const opacity = 1 - easedProgress;

        // Fade the shadow's opacity in sync with the dice
        if (floor) floor.material.opacity = 0.5 * (1 - easedProgress);

        // Update the opacity of each die's material(s)
        diceToFade.forEach(d => {
            if (Array.isArray(d.mesh.material)) {
                d.mesh.material.forEach(m => {
                    m.transparent = true;
                    m.opacity = opacity;
                });
            } else {
                d.mesh.material.transparent = true;
                d.mesh.material.opacity = opacity;
            }
        });

        if (progress < 1) {
            // If the animation is not finished, request the next frame
            requestAnimationFrame(fade);
        } else {
            // Once the animation is complete, remove the dice from the scene and physics world
            diceToFade.forEach(d => {
                scene.remove(d.mesh);
                world.removeBody(d.body);
            });
        }
    }
    fade();
}

function getResults() {
    let total = 0;
    dice.forEach(d => {
        total += getDieValue(d, up);
    });
    return total;
}

function displayResults(total) {
    const resultsContainer = document.getElementById('results-container');
    resultsContainer.innerText = `Total: ${total}`;
    resultsContainer.style.visibility = 'visible';
}

// --- ANIMATION LOOP ---
let lastTime;
function animate(time) {
    requestAnimationFrame(animate);
    if (lastTime !== undefined) {
        const dt = (time - lastTime) / 1000;
        world.step(1 / 60, dt, 3);
    }
    lastTime = time;
    dice.forEach(d => {
        d.mesh.position.copy(d.body.position);
        d.mesh.quaternion.copy(d.body.quaternion);
    });
    let settledCount = 0;
    dice.forEach(d => {
        const isSettled = d.body.velocity.lengthSquared() < 0.01 && d.body.angularVelocity.lengthSquared() < 0.01;
        if (isSettled) {
            settledCount++;
        }
    });
    if (dice.length > 0 && settledCount === dice.length && !allDiceSettled) {
        allDiceSettled = true;
        const total = getResults();
        displayResults(total);
    }
    renderer.render(scene, camera);
}

// --- INITIALIZATION ---
initScene();
initPhysics();
setupUI(rollDice, resetDice);
rollDice([{ type: 'd6', count: 2 }]);
animate();

window.addEventListener('resize', () => {
    const frustumSize = 18;
    let aspect = window.innerWidth / window.innerHeight;
    let leftBound = -frustumSize * aspect / 2;
    let rightBound = frustumSize * aspect / 2;
    let topBound = frustumSize / 2;
    let bottomBound = -frustumSize / 2;
    camera.left = leftBound;
    camera.right = rightBound;
    camera.top = topBound;
    camera.bottom = bottomBound;
    camera.updateProjectionMatrix();

    // Update the shadow camera to match the new aspect ratio
    if (directionalLight) {
        directionalLight.shadow.camera.left = leftBound;
        directionalLight.shadow.camera.right = rightBound;
        directionalLight.shadow.camera.top = topBound;
        directionalLight.shadow.camera.bottom = bottomBound;
        directionalLight.shadow.camera.updateProjectionMatrix();
    }

    renderer.setSize(window.innerWidth, window.innerHeight);
    updatePhysicsWalls(world, frustumSize, aspect, topBound, bottomBound);
});
