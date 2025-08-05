# Project Instructions for Richard's Dice Roll Engine

## 1. Project Overview

This is a 3D physics-based dice rolling engine built with Three.js for rendering and Cannon-es for physics. The goal is to create a realistic and customizable dice rolling simulation in the browser.

## 2. Core Technologies

- **Build Tool**: Vite (`npm run dev`, `npm run build`)
- **3D Rendering**: Three.js
- **Physics Engine**: Cannon-es
- **Language**: JavaScript (ES Modules)

## 3. Architecture & File Structure

The project follows a modular architecture. The old `single-html-dice-roll-engine.html` is deprecated and should NOT be used for development.

- `index.html`: The main entry point for the application. Contains the UI structure.
- `src/main.js`: The main JavaScript file. It initializes the scene, physics, UI, and runs the main animation loop.
- `src/scene.js`: Handles all Three.js setup (scene, camera, renderer, lighting, floor).
- `src/physics.js`: Handles all Cannon-es setup (world, gravity, materials, physics walls).
- `src/dice.js`: Contains the logic for creating dice, which involves both a Three.js `Mesh` and a Cannon-es `Body`. Also handles calculating the result of a die roll.
- `src/ui.js`: Manages UI event listeners and DOM interactions.
- `src/dice-models/*.js`: Each file in this directory exports the specific geometry (vertices and faces) for a particular type of die (d4, d6, etc.).
- `src/geometry.js`: Contains helper functions for geometry manipulation if needed.
- `style.css`: All application styles.

## 4. AI Development Workflow

- **Primary Workflow**: Always assume development happens via the Vite dev server (`npm run dev`). All code changes should be applied to the modular files within the `src/` directory and `index.html`.
- **Context is Key**: When the user wants to make a change, focus on the specific module responsible for that functionality (e.g., for physics changes, look at `src/physics.js`).
- **Be Mindful of Interplay**: Remember that a "die" is a composite object with a `mesh` (from `three.js`) and a `body` (from `cannon-es`). Changes often require touching both aspects. The link between them is managed in `src/dice.js` and updated in the `animate` loop in `src/main.js`. 