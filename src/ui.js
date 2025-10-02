
export function setupUI(rollDice, resetDice) {
    const rollButtonEl = document.getElementById('roll-button');
    const resetButtonEl = document.getElementById('reset-button');
    const throwSpeedEl = document.getElementById('throw-speed');
    const throwSpinEl = document.getElementById('throw-spin');
    const throwSpeedValueEl = document.getElementById('throw-speed-value');
    const throwSpinValueEl = document.getElementById('throw-spin-value');

    rollButtonEl.addEventListener('click', () => {
        resetDice(false);
        rollDice();
    });

    resetButtonEl.addEventListener('click', () => {
        resetDice();
    });

    throwSpeedEl.addEventListener('input', () => {
        throwSpeedValueEl.innerText = throwSpeedEl.value;
    });

    throwSpinEl.addEventListener('input', () => {
        throwSpinValueEl.innerText = throwSpinEl.value;
    });
}
