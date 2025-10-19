import * as CANNON from 'cannon-es';
import { initScene, scene, camera, renderer, up, floor, directionalLight } from './scene.js';
import { initPhysics, world, diceMaterial, updatePhysicsWalls } from './physics.js';
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
            console.log('🎲 Creating die:', diceRoll.dice);
            console.log('🎨 Color values being passed:');
            console.log('  diceColor:', diceRoll.diceColor);
            console.log('  textColor:', diceRoll.textColor);
            console.log('  backgroundColor:', diceRoll.backgroundColor);
            
            const die = createDie(diceRoll.dice, false, i === 0, undefined, undefined, diceMaterial, scene, world, diceRoll.diceColor, diceRoll.textColor, diceRoll.backgroundColor);
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
            console.log('🎲 Creating VISIBLE die:', diceRoll.dice);
            console.log('🎨 Color values for visible die:');
            console.log('  diceColor:', diceRoll.diceColor);
            console.log('  textColor:', diceRoll.textColor);
            console.log('  backgroundColor:', diceRoll.backgroundColor);
            
            const die = createDie(diceRoll.dice, true, i === 0, diceRoll.rolled, closestIndexes[0], diceMaterial, scene, world, diceRoll.diceColor, diceRoll.textColor, diceRoll.backgroundColor);
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
    console.log('🧹 Clearing dice from scene...');
    
    invisibleDice.forEach(d => {
        scene.remove(d.mesh);
        world.removeBody(d.body);
        // Dispose of materials and textures to prevent caching
        if (d.mesh && d.mesh.material) {
            if (Array.isArray(d.mesh.material)) {
                d.mesh.material.forEach(material => {
                    if (material.map) material.map.dispose();
                    material.dispose();
                });
            } else {
                if (d.mesh.material.map) d.mesh.material.map.dispose();
                d.mesh.material.dispose();
            }
        }
    });
    invisibleDice.length = 0;
    
    dice.forEach(d => {
        scene.remove(d.mesh);
        world.removeBody(d.body);
        // Dispose of materials and textures to prevent caching
        if (d.mesh && d.mesh.material) {
            if (Array.isArray(d.mesh.material)) {
                d.mesh.material.forEach(material => {
                    if (material.map) material.map.dispose();
                    material.dispose();
                });
            } else {
                if (d.mesh.material.map) d.mesh.material.map.dispose();
                d.mesh.material.dispose();
            }
        }
    });
    dice.length = 0;
    
    console.log('🧹 Scene cleared!');
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

// Initialize color controls when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('🔍 DOMContentLoaded fired - looking for color controls...');
    
    // Color control elements
    const diceColorInput = document.getElementById('dice-color');
    const diceColorHexInput = document.getElementById('dice-color-hex');
    const textColorInput = document.getElementById('text-color');
    const textColorHexInput = document.getElementById('text-color-hex');
    const bgColorInput = document.getElementById('bg-color');
    const bgColorHexInput = document.getElementById('bg-color-hex');
    const applyColorsBtn = document.getElementById('apply-colors');
    const resetColorsBtn = document.getElementById('reset-colors');

    console.log('🔍 Element check results:');
    console.log('  diceColorInput:', diceColorInput);
    console.log('  diceColorHexInput:', diceColorHexInput);
    console.log('  textColorInput:', textColorInput);
    console.log('  textColorHexInput:', textColorHexInput);
    console.log('  bgColorInput:', bgColorInput);
    console.log('  bgColorHexInput:', bgColorHexInput);
    console.log('  applyColorsBtn:', applyColorsBtn);
    console.log('  resetColorsBtn:', resetColorsBtn);

    if (!diceColorInput || !applyColorsBtn) {
        console.error('❌ Color control elements not found!');
        console.error('Available elements:', document.querySelectorAll('[id*="color"], [id*="apply"], [id*="reset"]'));
        return;
    }

    console.log('🎨 Color controls initialized successfully!');

    // Color control functionality
    function hexToNumeric(hex) {
        if (hex.startsWith('#')) {
            return parseInt(hex.slice(1), 16);
        }
        return parseInt(hex, 16);
    }

    function numericToHex(numeric) {
        return '#' + numeric.toString(16).padStart(6, '0');
    }

    // Sync color picker with hex input
    diceColorInput.addEventListener('input', () => {
        console.log('🎨 diceColorInput changed:', diceColorInput.value);
        const hex = diceColorInput.value;
        diceColorHexInput.value = '0x' + hex.slice(1);
        console.log('🎨 Updated diceColorHexInput to:', diceColorHexInput.value);
    });

    textColorInput.addEventListener('input', () => {
        console.log('🎨 textColorInput changed:', textColorInput.value);
        textColorHexInput.value = textColorInput.value.toUpperCase();
        console.log('🎨 Updated textColorHexInput to:', textColorHexInput.value);
    });

    bgColorInput.addEventListener('input', () => {
        console.log('🎨 bgColorInput changed:', bgColorInput.value);
        bgColorHexInput.value = bgColorInput.value;
        console.log('🎨 Updated bgColorHexInput to:', bgColorHexInput.value);
    });

    // Sync hex input with color picker
    diceColorHexInput.addEventListener('input', () => {
        let hex = diceColorHexInput.value;
        if (hex.startsWith('0x')) {
            hex = '#' + hex.slice(2);
        } else if (!hex.startsWith('#')) {
            hex = '#' + hex;
        }
        diceColorInput.value = hex;
    });

    textColorHexInput.addEventListener('input', () => {
        let hex = textColorHexInput.value;
        if (!hex.startsWith('#')) {
            hex = '#' + hex;
        }
        textColorInput.value = hex;
    });

    bgColorHexInput.addEventListener('input', () => {
        let hex = bgColorHexInput.value;
        if (!hex.startsWith('#')) {
            hex = '#' + hex;
        }
        bgColorInput.value = hex;
    });

    // Apply colors to all dice in JSON
    applyColorsBtn.addEventListener('click', () => {
        console.log('🎨 Apply Colors button clicked!');
        console.log('🎨 Current values:');
        console.log('  diceColorInput.value:', diceColorInput.value);
        console.log('  textColorInput.value:', textColorInput.value);
        console.log('  bgColorInput.value:', bgColorInput.value);
        
        const diceColor = hexToNumeric(diceColorInput.value);
        const textColor = textColorInput.value.toUpperCase();
        const bgColor = bgColorInput.value;
        
        console.log('🎨 Converted values:');
        console.log('  diceColor (numeric):', diceColor);
        console.log('  textColor:', textColor);
        console.log('  bgColor:', bgColor);
        
        try {
            const diceConfig = JSON.parse(jsonInput.value);
            console.log('🎨 Original dice config:', diceConfig);
            
            const updatedConfig = diceConfig.map(dice => ({
                ...dice,
                diceColor: diceColor,
                textColor: textColor,
                backgroundColor: bgColor
            }));
            
            console.log('🎨 Updated dice config:', updatedConfig);
            jsonInput.value = JSON.stringify(updatedConfig, null, 2);
            console.log('✅ Colors applied to all dice!');
        } catch (error) {
            console.error('❌ Invalid JSON:', error);
            alert('Invalid JSON configuration');
        }
    });

    // Reset colors to defaults
    resetColorsBtn.addEventListener('click', () => {
        diceColorInput.value = '#f0f0f0';
        diceColorHexInput.value = '0xf0f0f0';
        textColorInput.value = '#ffffff';
        textColorHexInput.value = '#FFFFFF';
        bgColorInput.value = '#e74c3c';
        bgColorHexInput.value = '#e74c3c';
        console.log('🔄 Colors reset to defaults');
    });

    // Example JSON configurations
    const exampleConfigs = {
        default: [
            { "dice": "d6" },
            { "dice": "d20" },
            { "dice": "d8" }
        ],
        custom: [
            { 
                "dice": "d6", 
                "diceColor": 0xff6b6b, 
                "textColor": "#FFFFFF", 
                "backgroundColor": "#4ECDC4" 
            },
            { 
                "dice": "d20", 
                "diceColor": 0x95e1d3, 
                "textColor": "#2C3E50", 
                "backgroundColor": "#F38BA8" 
            },
            { 
                "dice": "d8", 
                "diceColor": 0xffd93d, 
                "textColor": "#000000", 
                "backgroundColor": "#6BCF7F" 
            }
        ],
        mixed: [
            { "dice": "d6" },
            { 
                "dice": "d20", 
                "diceColor": 0xff9ff3, 
                "textColor": "#2C3E50", 
                "backgroundColor": "#54a0ff" 
            },
            { "dice": "d8" }
        ],
        rainbow: [
            { 
                "dice": "d4", 
                "diceColor": 0xff6b6b, 
                "textColor": "#FFFFFF", 
                "backgroundColor": "#FF6B6B" 
            },
            { 
                "dice": "d6", 
                "diceColor": 0x4ecdc4, 
                "textColor": "#FFFFFF", 
                "backgroundColor": "#4ECDC4" 
            },
            { 
                "dice": "d8", 
                "diceColor": 0x45b7d1, 
                "textColor": "#FFFFFF", 
                "backgroundColor": "#45B7D1" 
            },
            { 
                "dice": "d10", 
                "diceColor": 0x96ceb4, 
                "textColor": "#FFFFFF", 
                "backgroundColor": "#96CEB4" 
            },
            { 
                "dice": "d12", 
                "diceColor": 0xfeca57, 
                "textColor": "#2C3E50", 
                "backgroundColor": "#FECA57" 
            },
            { 
                "dice": "d20", 
                "diceColor": 0xff9ff3, 
                "textColor": "#2C3E50", 
                "backgroundColor": "#FF9FF3" 
            }
        ],
        blackwhite: [
            {
                "dice": "d20",
                "diceColor": 16752627,
                "textColor": "#ffffff",
                "backgroundColor": "#000000"
            }
        ]
    };

    // Example buttons
    console.log('🔍 Setting up example buttons...');
    const exampleButtons = document.querySelectorAll('.example-btn');
    console.log('🔍 Found example buttons:', exampleButtons.length);
    
    exampleButtons.forEach((btn, index) => {
        console.log(`🔍 Setting up button ${index}:`, btn.dataset.example);
        btn.addEventListener('click', () => {
            console.log('🎨 Example button clicked:', btn.dataset.example);
            const example = btn.dataset.example;
            if (exampleConfigs[example]) {
                console.log('🎨 Loading example config:', exampleConfigs[example]);
                jsonInput.value = JSON.stringify(exampleConfigs[example], null, 2);
                
                // Update active button
                document.querySelectorAll('.example-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                console.log(`🎨 Loaded ${example} color example`);
            } else {
                console.error('❌ Example config not found:', example);
            }
        });
    });
});

// Fallback initialization in case DOMContentLoaded already fired
console.log('🔍 Script loaded - checking if DOM is ready...');
if (document.readyState === 'loading') {
    console.log('🔍 DOM still loading, waiting for DOMContentLoaded...');
} else {
    console.log('🔍 DOM already ready, initializing color controls immediately...');
    // Trigger the same initialization
    const event = new Event('DOMContentLoaded');
    document.dispatchEvent(event);
}
