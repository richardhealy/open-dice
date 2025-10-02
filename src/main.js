import * as CANNON from 'cannon-es';
import { initScene, scene, camera, renderer, up, floor, directionalLight } from './scene.js';
import { initPhysics, world, updatePhysicsWalls } from './physics.js';
import { setupUI } from './ui.js';
import { createDie, getDieValue } from './dice.js';

// --- GLOBAL VARIABLES ---
const dice = [];
const invisibleDice = [];
const randomSeeds = [];
let allDiceSettled = false;
let found = false;
let closestIndexes = [];

const jsonInput = document.getElementById('json-input');

function rollDice() {
    const diceRolls = JSON.parse(jsonInput.value);
    
    if (floor) floor.material.opacity = 0.5;
    clearDice();

    document.getElementById('results-container').style.visibility = 'hidden';
    document.getElementById('results-container').innerText = '';
    allDiceSettled = false;

    const throwSpeed = parseFloat(document.getElementById('throw-speed').value);
    const throwSpin = parseFloat(document.getElementById('throw-spin').value);

    if (found === false) {
      randomSeeds.length = 0
      diceRolls.forEach((diceRoll) => {
          const repeatCount = diceRoll.dice === "d100" ? 2 : 1;

          for (let i = 0; i < repeatCount; i++) {
            const die = createDie(diceRoll.dice, false, i === 0);
            if (!die) return;
  
            invisibleDice.push(die);
  
            const margin = 2;
            const frustumSize = 18;
            const aspect = window.innerWidth / window.innerHeight;
            const leftBound = -frustumSize * aspect / 2;
  
            const rand = {
                xPos: Math.random(),
                yPos: Math.random(),
                zPos: Math.random(),
                rotAxis: [Math.random(), Math.random(), Math.random()],
                rotAngle: Math.random(),
                vel: [Math.random(), Math.random(), Math.random()],
                angVel: [Math.random(), Math.random(), Math.random()],
            };
            randomSeeds.push(rand);
  
            // Apply position
            const xPos = leftBound + margin + (rand.xPos * 4);
            const yPos = 4 + rand.yPos * 4;
            const zPos = (rand.zPos - 0.5) * (frustumSize * 0.9);
            die.body.position.set(xPos, yPos, zPos);
            die.mesh.position.copy(die.body.position);
  
            // Rotation
            die.body.quaternion.setFromAxisAngle(
                new CANNON.Vec3(...rand.rotAxis).unit(),
                rand.rotAngle * Math.PI * 2
            );
            die.mesh.quaternion.copy(die.body.quaternion);
  
            // Velocity
            die.body.velocity.set(
                (0.8 + 0.8 * rand.vel[0]) * throwSpeed,
                (rand.vel[1] * 0.2) * throwSpeed * 0.5,
                (rand.vel[2] - 0.5) * throwSpeed
            );
  
            // Angular velocity
            die.body.angularVelocity.set(
                (rand.angVel[0] - 0.5) * throwSpin * 1.5,
                (rand.angVel[1] - 0.5) * throwSpin * 1.5,
                (rand.angVel[2] - 0.5) * throwSpin * 1.5
            );
          }
      });
    }

    else {
      diceRolls.forEach((diceRoll) => {
          const repeatCount = diceRoll.dice === "d100" ? 2 : 1;

          for (let i = 0; i < repeatCount; i++) {
            const die = createDie(diceRoll.dice, true, i === 0, diceRoll.rolled, closestIndexes[0]);
            if (!die) return;

            if (i > 0 && diceRoll.dice === 'd100') {
              die.isFirst = false
            } else {
              die.isFirst = true
            }
  
            die.closestIndex = closestIndexes[0]
            die.targetNumber = diceRoll.rolled
            dice.push(die);
  
            // Remove the first element after using it
            closestIndexes.shift();
  
            const margin = 2;
            const frustumSize = 18;
            const aspect = window.innerWidth / window.innerHeight;
            const leftBound = -frustumSize * aspect / 2;
  
            const rand = randomSeeds.shift();
  
            // Position
            const xPos = leftBound + margin + (rand.xPos * 4);
            const yPos = 4 + rand.yPos * 4;
            const zPos = (rand.zPos - 0.5) * (frustumSize * 0.9);
            die.body.position.set(xPos, yPos, zPos);
            die.mesh.position.copy(die.body.position);
  
            // Rotation
            die.body.quaternion.setFromAxisAngle(
                new CANNON.Vec3(...rand.rotAxis).unit(),
                rand.rotAngle * Math.PI * 2
            );
            die.mesh.quaternion.copy(die.body.quaternion);
  
            // Velocity
            die.body.velocity.set(
                (0.8 + 0.8 * rand.vel[0]) * throwSpeed,
                (rand.vel[1] * 0.2) * throwSpeed * 0.5,
                (rand.vel[2] - 0.5) * throwSpeed
            );
  
            // Angular velocity
            die.body.angularVelocity.set(
                (rand.angVel[0] - 0.5) * throwSpin * 1.5,
                (rand.angVel[1] - 0.5) * throwSpin * 1.5,
                (rand.angVel[2] - 0.5) * throwSpin * 1.5
            );
          }
      });

    }
}

function clearDice() {
    invisibleDice.forEach(d => {
        scene.remove(d.mesh);
        world.removeBody(d.body);
    });
    invisibleDice.length = 0;
    dice.forEach(d => {
        scene.remove(d.mesh);
        world.removeBody(d.body);
    });
    dice.length = 0;
}

function resetDice(isNeedFade = true) {
    found = false
    closestIndexes.length = 0
    
    invisibleDice.forEach(d => {
        scene.remove(d.mesh);
        world.removeBody(d.body);
    });
    invisibleDice.length = 0;

    if (isNeedFade) {
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
    
    else {
      dice.forEach(d => {
          scene.remove(d.mesh);
          world.removeBody(d.body);
      });
      dice.length = 0;
    }

}

function getResults() {
    let total = 0;
    dice.forEach((d, i) => {
        const result = getDieValue(d, up, d.targetNumber, d.closestIndex);
        total += result[0];
    });
    closestIndexes.length = 0
    return total;
}

function getResultsClosestIndexes() {
    let total = 0;
    invisibleDice.forEach(d => {
        const result = getDieValue(d, up);
        closestIndexes.push(result[1]);
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
    if (found === false) {
      if (lastTime !== undefined) {
        const speedFactor = 100000;
        const dt = (time - lastTime) / 1000 * speedFactor;
        world.step(1 / 60, dt, 999999999);
      }
      lastTime = time;
      invisibleDice.forEach(d => {
          d.mesh.position.copy(d.body.position);
          d.mesh.quaternion.copy(d.body.quaternion);
      });
      let settledCount = 0;
      invisibleDice.forEach(d => {
          const isSettled = d.body.velocity.lengthSquared() < 0.01 && d.body.angularVelocity.lengthSquared() < 0.01;
          if (isSettled) {
              settledCount++;
          }
      });
      if (invisibleDice.length > 0 && settledCount === invisibleDice.length && !allDiceSettled) {
          getResultsClosestIndexes();
          allDiceSettled = true;
          found = true
          rollDice()
      }
    } else {
      if (lastTime !== undefined) {
          const speedFactor = 1
          const dt = (time - lastTime) / 1000 * speedFactor;
          world.step(1 / 60, dt, 2);
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
          found = false
      }
    }
    renderer.render(scene, camera);
}

// --- INITIALIZATION ---
initScene();
initPhysics();
setupUI(rollDice, resetDice);
rollDice();
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
