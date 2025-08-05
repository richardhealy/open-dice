
export function setupUI(rollDice, resetDice) {
    const numDiceTypesEl = document.getElementById('num-dice-types');
    const diceGroup2El = document.getElementById('dice-group-2');

    const diceType1El = document.getElementById('dice-type-1');
    const diceCount1El = document.getElementById('dice-count-1');
    const diceType2El = document.getElementById('dice-type-2');
    const diceCount2El = document.getElementById('dice-count-2');

    const rollButtonEl = document.getElementById('roll-button');
    const resetButtonEl = document.getElementById('reset-button');
    const throwSpeedEl = document.getElementById('throw-speed');
    const throwSpinEl = document.getElementById('throw-spin');
    const throwSpeedValueEl = document.getElementById('throw-speed-value');
    const throwSpinValueEl = document.getElementById('throw-spin-value');

    numDiceTypesEl.addEventListener('change', () => {
        if (numDiceTypesEl.value === '2') {
            diceGroup2El.style.display = 'block';
        } else {
            diceGroup2El.style.display = 'none';
        }
    });

    rollButtonEl.addEventListener('click', () => {
        const rollRequests = [];

        rollRequests.push({
            type: diceType1El.value,
            count: parseInt(diceCount1El.value, 10)
        });

        if (numDiceTypesEl.value === '2') {
            rollRequests.push({
                type: diceType2El.value,
                count: parseInt(diceCount2El.value, 10)
            });
        }
        
        rollDice(rollRequests);
    });

    resetButtonEl.addEventListener('click', () => {
        resetDice();

        // Reset UI controls to their default state
        numDiceTypesEl.value = '1';
        diceGroup2El.style.display = 'none';

        diceType1El.value = 'd6';
        diceCount1El.value = '2';

        diceType2El.value = 'd20';
        diceCount2El.value = '2';
    });

    throwSpeedEl.addEventListener('input', () => {
        throwSpeedValueEl.innerText = throwSpeedEl.value;
    });

    throwSpinEl.addEventListener('input', () => {
        throwSpinValueEl.innerText = throwSpinEl.value;
    });
}
