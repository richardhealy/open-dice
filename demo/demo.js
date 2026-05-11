import { DiceRoller, effects, presets } from '../src/index.js';

const container = document.getElementById('scene-container');
const resultsContainer = document.getElementById('results-container');

// Each in-flight or resolved batch gets its own card so concurrent rolls are visible
// independently. Cards are inserted in chronological order (newest at the bottom).
let batchCounter = 0;
function createBatchCard(label) {
    batchCounter += 1;
    const id = `batch-${batchCounter}`;
    const card = document.createElement('div');
    card.className = 'batch-result pending';
    card.id = id;
    card.innerHTML = `
        <div class="label">${label}</div>
        <div class="body">Rolling…</div>
    `;
    resultsContainer.appendChild(card);
    return card;
}

function fillBatchCard(card, result) {
    card.classList.remove('pending');
    const perDie = result.results || [];
    const adjustedTotal = perDie.reduce((sum, r) => sum + (r.visible ?? r.value), 0);
    const diverged = perDie.length > 0 && adjustedTotal !== result.total;

    let body = `<span class="total">${result.total}</span>`;
    if (diverged) {
        body += `<span class="adjusted-total">· adjusted: ${adjustedTotal}</span>`;
    }
    if (result.variances && result.variances.length > 0) {
        const pills = result.variances
            .map(v => `<span class="die">${v.type} target ${v.expected} → shows ${v.visible}</span>`)
            .join('');
        body += `<div class="adjustments">${pills}</div>`;
    }
    card.querySelector('.body').innerHTML = body;
}

// roll() resolves with just the total for backward compat, but we want the full per-batch
// result for the card. onRollComplete already receives `(total, result)`, so we stash the
// result here and pick it up after `await roll(...)`.
let lastMainResult = null;
const diceRoller = new DiceRoller({
    container: container,
    throwSpeed: 15,
    throwSpin: 20,
    onRollComplete: (_total, result) => {
        lastMainResult = result;
    },
});

// ----- Effect rules editor -----
// Effects are functions, so they can't sit raw in JSON — we use a serializable shape
// (effect names + plain-object options) and compile to real factory calls on Apply.
// Hex colors are accepted as either "#facc15" strings or 0xfacc15 numbers.

function parseColor(c) {
    if (typeof c === 'string') return parseInt(c.replace('#', ''), 16);
    return c;
}

function compileEffectSpec(spec) {
    const factory = effects[spec.effect];
    if (typeof factory !== 'function') {
        throw new Error(`Unknown effect: "${spec.effect}"`);
    }
    const { effect, ...rest } = spec;
    if (rest.color !== undefined) rest.color = parseColor(rest.color);
    if (Array.isArray(rest.colors)) rest.colors = rest.colors.map(parseColor);
    return factory(rest);
}

function compileRules(rulesData) {
    if (!rulesData || !Array.isArray(rulesData.rules)) return [];
    return rulesData.rules.map(r => ({
        match: r.match,
        play: (Array.isArray(r.play) ? r.play : [r.play]).map(compileEffectSpec),
    }));
}

// Presets, written in the same serializable form so they round-trip through the editor.
const effectPresets = {
    classicCrit: {
        rules: [
            { match: { type: 'd20', visible: 20 }, play: [
                { effect: 'glow', color: '#facc15', intensity: 1.6, duration: 1400 },
                { effect: 'scalePulse', peak: 1.5, duration: 700 },
                { effect: 'haloRing', color: '#facc15', duration: 1400, endRadius: 2.6 },
                { effect: 'confetti', count: 70 },
                { effect: 'particleBurst', color: '#facc15', count: 40 },
                { effect: 'slowMoZoom', duration: 1200, zoomLevel: 1.7 },
            ] },
            { match: { type: 'd20', visible: 1 }, play: [
                { effect: 'glow', color: '#ef4444', intensity: 1.4, duration: 1200 },
                { effect: 'haloRing', color: '#ef4444', duration: 1000, endRadius: 1.8 },
                { effect: 'screenShake', intensity: 0.6, duration: 500 },
            ] },
            { match: 'clean', play: [{ effect: 'glow', color: '#4ade80', duration: 700, intensity: 0.7 }] },
            { match: 'variance', play: [{ effect: 'glow', color: '#fb923c', intensity: 1.0 }] },
        ],
    },
    subtle: {
        rules: [
            { match: 'clean', play: [{ effect: 'glow', color: '#4ade80', duration: 500, intensity: 0.6 }] },
            { match: 'variance', play: [{ effect: 'glow', color: '#fb923c', duration: 600, intensity: 0.7 }] },
        ],
    },
    festive: {
        rules: [
            { match: 'clean', play: [
                { effect: 'glow', color: '#facc15', duration: 600, intensity: 0.9 },
                { effect: 'confetti', count: 30, duration: 1800 },
            ] },
            { match: 'variance', play: [{ effect: 'glow', color: '#fb923c' }] },
        ],
    },
    none: { rules: [] },
};

const effectsJsonInput = document.getElementById('effects-json');
const applyEffectsButton = document.getElementById('apply-effects');

function loadPreset(name) {
    effectsJsonInput.value = JSON.stringify(effectPresets[name], null, 2);
    applyEffectsFromTextarea();
}

function applyEffectsFromTextarea() {
    try {
        const parsed = JSON.parse(effectsJsonInput.value);
        diceRoller.setEffectRules(compileRules(parsed));
    } catch (error) {
        console.error('Error parsing effect rules:', error);
        alert(`Effect rules error: ${error.message}`);
    }
}

document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => loadPreset(btn.dataset.preset));
});
applyEffectsButton.addEventListener('click', applyEffectsFromTextarea);

// Initial population: same content as `classicCrit` so the demo behaves identically
// to before until the user edits.
loadPreset('classicCrit');

const rollButton = document.getElementById('roll-button');
const resetButton = document.getElementById('reset-button');
const throwSpeedEl = document.getElementById('throw-speed');
const throwSpinEl = document.getElementById('throw-spin');
const throwSpeedValueEl = document.getElementById('throw-speed-value');
const throwSpinValueEl = document.getElementById('throw-spin-value');
const jsonInput = document.getElementById('json-input');
const fireToggle = document.getElementById('fire-d20-toggle');
const trailToggle = document.getElementById('trail-d6-toggle');
const bloodToggle = document.getElementById('blood-toggle');
const acidToggle = document.getElementById('acid-toggle');
const frostToggle = document.getElementById('frost-toggle');
const electricToggle = document.getElementById('electric-toggle');
const psychicToggle = document.getElementById('psychic-toggle');
const necroticToggle = document.getElementById('necrotic-toggle');
const radiantToggle = document.getElementById('radiant-toggle');
const thunderToggle = document.getElementById('thunder-toggle');
const slashingToggle = document.getElementById('slashing-toggle');

// Inject roll-time effects onto a parsed dice config based on the checkbox state.
// Effect factories are functions — they can't live in JSON, so we splice them in here
// just before handing the config to the engine.
function decorateWithRollTimeEffects(diceConfig) {
    return diceConfig.map(entry => {
        const extra = [];
        if (fireToggle.checked && entry.dice === 'd20') extra.push(effects.fire());
        if (trailToggle.checked && entry.dice === 'd6') extra.push(effects.trail({ color: 0x66ccff }));
        if (bloodToggle.checked) extra.push(effects.bloodSplat());
        if (acidToggle.checked) extra.push(effects.acidSplat());
        if (frostToggle.checked) extra.push(effects.frost());
        if (electricToggle.checked) extra.push(effects.electric());
        if (psychicToggle.checked) extra.push(effects.psychic());
        if (necroticToggle.checked) extra.push(effects.necrotic());
        if (radiantToggle.checked) extra.push(effects.radiant());
        if (thunderToggle.checked) extra.push(effects.thunder());
        if (slashingToggle.checked) extra.push(effects.slashing());
        if (extra.length === 0) return entry;
        return { ...entry, effects: [...(entry.effects || []), ...extra] };
    });
}

rollButton.addEventListener('click', async () => {
    try {
        const diceConfig = decorateWithRollTimeEffects(JSON.parse(jsonInput.value));
        // If a roll is already in motion, treat Roll Dice as an additive throw rather
        // than wiping the scene — the new dice join the live world as their own batch.
        if (diceRoller.isRolling()) {
            const card = createBatchCard(`Roll #${batchCounter + 1} (added)`);
            const result = await diceRoller.addDice(diceConfig);
            fillBatchCard(card, result);
            return;
        }
        resultsContainer.innerHTML = '';
        const card = createBatchCard(`Roll #${batchCounter + 1}`);
        lastMainResult = null;
        await diceRoller.roll(diceConfig);
        fillBatchCard(card, lastMainResult);
    } catch (error) {
        console.error('Error rolling dice:', error);
        alert('Invalid JSON configuration');
    }
});

// Add Dice — independent batch. Each call resolves on its own when ITS dice settle,
// even if previous batches are still in motion. Multiple in-flight batches show as
// separate "pending" cards that fill in independently.
const addButton = document.getElementById('add-button');
const addJsonInput = document.getElementById('add-json-input');
addButton.addEventListener('click', async () => {
    try {
        const diceConfig = decorateWithRollTimeEffects(JSON.parse(addJsonInput.value));
        const card = createBatchCard(`Batch #${batchCounter + 1}`);
        const result = await diceRoller.addDice(diceConfig);
        fillBatchCard(card, result);
    } catch (error) {
        console.error('Error adding dice:', error);
        alert('Invalid JSON configuration');
    }
});

resetButton.addEventListener('click', async () => {
    await diceRoller.reset();
    resultsContainer.innerHTML = '';
});

throwSpeedEl.addEventListener('input', () => {
    throwSpeedValueEl.innerText = throwSpeedEl.value;
    diceRoller.setThrowSpeed(parseFloat(throwSpeedEl.value));
});

throwSpinEl.addEventListener('input', () => {
    throwSpinValueEl.innerText = throwSpinEl.value;
    diceRoller.setThrowSpin(parseFloat(throwSpinEl.value));
});

setTimeout(() => {
    rollButton.click();
}, 500);
