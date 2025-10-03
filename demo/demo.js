import { DiceRoller } from '../src/index.js';

// Get the container element
const container = document.getElementById('scene-container');

// Create a new DiceRoller instance
const diceRoller = new DiceRoller({
    container: container,
    throwSpeed: 15,
    throwSpin: 20,
    onRollComplete: (total) => {
        const resultsContainer = document.getElementById('results-container');
        resultsContainer.innerText = `Total: ${total}`;
        resultsContainer.style.visibility = 'visible';
    }
});

// UI Elements
const rollButton = document.getElementById('roll-button');
const resetButton = document.getElementById('reset-button');
const throwSpeedEl = document.getElementById('throw-speed');
const throwSpinEl = document.getElementById('throw-spin');
const throwSpeedValueEl = document.getElementById('throw-speed-value');
const throwSpinValueEl = document.getElementById('throw-spin-value');
const jsonInput = document.getElementById('json-input');
const resultsContainer = document.getElementById('results-container');

// Roll button handler
rollButton.addEventListener('click', async () => {
    try {
        resultsContainer.style.visibility = 'hidden';
        const diceConfig = JSON.parse(jsonInput.value);
        const result = await diceRoller.roll(diceConfig);
        console.log('Roll result:', result);
    } catch (error) {
        console.error('Error rolling dice:', error);
        alert('Invalid JSON configuration');
    }
});

// Reset button handler
resetButton.addEventListener('click', async () => {
    await diceRoller.reset();
    resultsContainer.style.visibility = 'hidden';
    resultsContainer.innerText = '';
});

// Throw speed slider
throwSpeedEl.addEventListener('input', () => {
    throwSpeedValueEl.innerText = throwSpeedEl.value;
    diceRoller.setThrowSpeed(parseFloat(throwSpeedEl.value));
});

// Throw spin slider
throwSpinEl.addEventListener('input', () => {
    throwSpinValueEl.innerText = throwSpinEl.value;
    diceRoller.setThrowSpin(parseFloat(throwSpinEl.value));
});

// Initial roll on page load
setTimeout(() => {
    rollButton.click();
}, 500);

