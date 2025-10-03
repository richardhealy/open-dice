# 🎲 Open Dice DnD

A beautiful 3D physics-based dice rolling engine built with Three.js and Cannon.js. Perfect for adding realistic dice rolling to your web applications, games, or tabletop RPG tools!

## ✨ Features

- 🎯 Physics-based dice rolling with realistic behavior
- 🎨 Support for multiple dice types: d4, d6, d8, d10, d12, d20, d100
- 🎬 Smooth animations and shadows
- 📱 Responsive and works on any container size
- 🔧 Easy-to-use API
- 📦 Lightweight and modular
- 🎭 Customizable throw speed and spin

## 📦 Installation

### Via npm

```bash
npm install open-dice-dnd
```

### Local Development

```bash
git clone <repository-url>
cd open-dice-dnd
npm install
```

## 🚀 Quick Start

### Basic Usage

```javascript
import { DiceRoller } from 'open-dice-dnd';

// Get your container element
const container = document.getElementById('dice-container');

// Create a new dice roller instance
const diceRoller = new DiceRoller({
    container: container,
    throwSpeed: 15,
    throwSpin: 20,
    onRollComplete: (total) => {
        console.log('Roll total:', total);
    }
});

// Roll some dice!
const diceConfig = [
    { dice: 'd20', rolled: 15 },
    { dice: 'd6', rolled: 4 }
];

diceRoller.roll(diceConfig).then(total => {
    console.log('Dice settled! Total:', total);
});
```

### HTML Setup

```html
<!DOCTYPE html>
<html>
<head>
    <style>
        #dice-container {
            width: 100vw;
            height: 100vh;
            position: relative;
        }
    </style>
</head>
<body>
    <div id="dice-container"></div>
    <script type="module" src="main.js"></script>
</body>
</html>
```

## 📖 API Reference

### `new DiceRoller(options)`

Creates a new dice roller instance.

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `container` | HTMLElement | **Required** | The DOM element to render the canvas in |
| `width` | number | Container width | Canvas width in pixels |
| `height` | number | Container height | Canvas height in pixels |
| `throwSpeed` | number | `15` | Initial throw speed (5-30) |
| `throwSpin` | number | `20` | Initial throw spin (5-40) |
| `onRollComplete` | function | `null` | Callback function when dice settle |

### Methods

#### `roll(diceConfig)`

Roll dice with the given configuration.

**Parameters:**
- `diceConfig` (Array): Array of dice configurations
  - `dice` (string): Type of die - `'d4'`, `'d6'`, `'d8'`, `'d10'`, `'d12'`, `'d20'`, or `'d100'`
  - `rolled` (number, optional): Target number for the roll

**Returns:** `Promise<number>` - Promise that resolves with the total roll result

**Example:**
```javascript
const result = await diceRoller.roll([
    { dice: 'd20', rolled: 18 },
    { dice: 'd6' },
    { dice: 'd8', rolled: 5 }
]);
console.log('Total:', result);
```

#### `reset()`

Reset and clear all dice from the scene with a fade animation.

**Returns:** `Promise<void>`

**Example:**
```javascript
await diceRoller.reset();
```

#### `setThrowSpeed(speed)`

Update the throw speed.

**Parameters:**
- `speed` (number): New throw speed (recommended: 5-30)

**Example:**
```javascript
diceRoller.setThrowSpeed(20);
```

#### `setThrowSpin(spin)`

Update the throw spin.

**Parameters:**
- `spin` (number): New throw spin (recommended: 5-40)

**Example:**
```javascript
diceRoller.setThrowSpin(25);
```

#### `destroy()`

Destroy the dice roller instance and clean up all resources.

**Example:**
```javascript
diceRoller.destroy();
```

## 🎮 Examples

### Rolling Multiple Dice Types

```javascript
const diceRoller = new DiceRoller({
    container: document.getElementById('dice-container')
});

// Roll a variety of dice
await diceRoller.roll([
    { dice: 'd20' },
    { dice: 'd12' },
    { dice: 'd10' },
    { dice: 'd8' },
    { dice: 'd6' },
    { dice: 'd4' }
]);
```

### D100 (Percentile) Dice

```javascript
// D100 automatically rolls two d10s
await diceRoller.roll([
    { dice: 'd100', rolled: 96 }
]);
```

### With Custom UI Controls

```javascript
const diceRoller = new DiceRoller({
    container: document.getElementById('dice-container'),
    onRollComplete: (total) => {
        document.getElementById('result').textContent = `Total: ${total}`;
    }
});

// Button click handler
document.getElementById('roll-btn').addEventListener('click', () => {
    diceRoller.roll([
        { dice: 'd20' },
        { dice: 'd6' }
    ]);
});

// Reset button handler
document.getElementById('reset-btn').addEventListener('click', () => {
    diceRoller.reset();
});
```

### React Integration

```jsx
import { useEffect, useRef, useState } from 'react';
import { DiceRoller } from 'open-dice-dnd';

function DiceComponent() {
    const containerRef = useRef(null);
    const diceRollerRef = useRef(null);
    const [result, setResult] = useState(null);

    useEffect(() => {
        if (containerRef.current && !diceRollerRef.current) {
            diceRollerRef.current = new DiceRoller({
                container: containerRef.current,
                onRollComplete: (total) => {
                    setResult(total);
                }
            });
        }

        return () => {
            if (diceRollerRef.current) {
                diceRollerRef.current.destroy();
            }
        };
    }, []);

    const handleRoll = () => {
        diceRollerRef.current?.roll([
            { dice: 'd20' },
            { dice: 'd6' }
        ]);
    };

    return (
        <div>
            <div ref={containerRef} style={{ width: '100%', height: '500px' }} />
            <button onClick={handleRoll}>Roll Dice</button>
            {result && <p>Total: {result}</p>}
        </div>
    );
}
```

### Vue Integration

```vue
<template>
    <div>
        <div ref="containerRef" style="width: 100%; height: 500px;"></div>
        <button @click="handleRoll">Roll Dice</button>
        <p v-if="result">Total: {{ result }}</p>
    </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { DiceRoller } from 'open-dice-dnd';

const containerRef = ref(null);
const result = ref(null);
let diceRoller = null;

onMounted(() => {
    if (containerRef.value) {
        diceRoller = new DiceRoller({
            container: containerRef.value,
            onRollComplete: (total) => {
                result.value = total;
            }
        });
    }
});

onUnmounted(() => {
    if (diceRoller) {
        diceRoller.destroy();
    }
});

const handleRoll = () => {
    if (diceRoller) {
        diceRoller.roll([
            { dice: 'd20' },
            { dice: 'd6' }
        ]);
    }
};
</script>
```

## 🛠️ Development

### Running the Demo

```bash
npm run dev
```

Then open your browser to `http://localhost:5173`

### Building the Library

```bash
npm run build:lib
```

This creates the distributable files in the `dist/` directory:
- `open-dice-dnd.es.js` - ES module format
- `open-dice-dnd.umd.js` - UMD format (for browsers and Node.js)

### Building the Demo

```bash
npm run build
```

## 📝 Dice Types

| Type | Description | Range |
|------|-------------|-------|
| `d4` | 4-sided die | 1-4 |
| `d6` | 6-sided die (standard cube) | 1-6 |
| `d8` | 8-sided die | 1-8 |
| `d10` | 10-sided die | 0-9 or 1-10 |
| `d12` | 12-sided die | 1-12 |
| `d20` | 20-sided die | 1-20 |
| `d100` | Percentile die (two d10s) | 00-99 or 1-100 |

## 📝 Changelog

### [1.0.0] - 2025-10-03

#### 🎉 Initial Release

**Core Features:**
- ✨ 3D physics-based dice rolling engine
- 🎲 Support for all standard RPG dice types (d4, d6, d8, d10, d12, d20, d100)
- 🎯 Realistic physics simulation using Cannon.js
- 🎨 Beautiful 3D rendering with Three.js
- 📱 Responsive design that works on any container size

**API:**
- 🔧 Class-based `DiceRoller` API for easy integration
- ⚡ Promise-based roll method for async/await support
- 🎪 Event callbacks for roll completion
- 🎛️ Customizable throw speed and spin
- 🧹 Automatic resource cleanup and memory management

**Developer Experience:**
- 📦 Available as npm package: `open-dice-dnd`
- 📚 Comprehensive documentation with examples
- ⚛️ React integration example
- 💚 Vue integration example
- 🎮 Live demo included

**Build & Distribution:**
- 📦 ES module format (7.83 kB gzipped)
- 🌐 UMD format for browser compatibility
- 🌲 Tree-shakeable exports
- 🔗 Peer dependencies for optimal bundle size

**License:**
- 📄 MIT License

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Credits

Built with:
- [Three.js](https://threejs.org/) - 3D graphics
- [Cannon.js](https://schteppe.github.io/cannon.js/) - Physics engine
- [Vite](https://vitejs.dev/) - Build tool

## 📮 Support

If you encounter any issues or have questions, please file an issue on the GitHub repository.

---

Made with ❤️ for tabletop gaming enthusiasts and web developers
