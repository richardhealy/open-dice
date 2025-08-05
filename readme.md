# 3D Physics-Based Dice Roller Engine

A high-performance, browser-based dice rolling engine built with Three.js and the Cannon-es physics engine. This project provides a realistic, top-down view of dice rolling with smooth animations and reliable settling behavior.

## Features

*   **Realistic Physics**: Utilizes Cannon-es for proper dice tumbling, bouncing, and settling.
*   **3D Rendering**: Renders the scene with Three.js, featuring a top-down camera, lighting, and shadows.
*   **Complete Set of Dice**: Supports all standard gaming dice: D4, D6, D8, D10, D12, and D20.
*   **Simple UI**: An intuitive interface to select dice type, quantity, throw power, and spin.
*   **Collision Detection**: Dice collide realistically with each other and the floor boundaries.

## Technologies Used

*   **JavaScript (ES6+)**: Core application logic.
*   **Three.js**: For 3D rendering, scene management, cameras, and lighting.
*   **Cannon-es**: A maintained fork of Cannon.js for 3D physics simulation.
*   **Vite**: A modern, fast frontend build tool for development and bundling.
*   **HTML5 & CSS3**: For the user interface structure and styling.

## Local Setup and Installation

To get this project running on your local machine, follow these steps.

**1. Clone the repository:**

```bash
git clone https://github.com/your-username/dice-roll-engine.git
cd dice-roll-engine
```

*(Replace `your-username` with your actual GitHub username or the repository's URL)*

**2. Install dependencies:**

This will install all the necessary packages like Vite, Three.js, and Cannon-es.

```bash
npm install
```

**3. Run the development server:**

This command starts the Vite development server and opens the project in your browser. The server will automatically reload when you make changes to the code.

```bash
npm run dev
```

The application should now be running, typically at `http://localhost:5173`.

## How It Works

The application initializes a `three.js` scene and a `cannon-es` physics world. When the user selects a dice type and count, the following happens:

1.  **Dice Creation**: For each die, a `three.js` mesh is created for its visual representation and a `cannon-es` rigid body is created for its physics simulation. The geometry for each die is defined in the `src/dice-models/` directory.
2.  **Rolling**: The dice are given an initial position, velocity, and angular velocity to simulate a throw.
3.  **Animation Loop**: In the animation loop, the physics world is stepped forward, and the positions and rotations of the `three.js` meshes are updated to match the physics bodies.
4.  **Settling and Results**: The application checks when the dice have come to a rest by monitoring their velocity. Once all dice are settled, the final value of each die is calculated based on which face is pointing up, and the total is displayed.

## Project Structure

The project is organized into modules to keep the code clean and maintainable.

```
/
├── index.html          # Main HTML entry point
├── package.json        # Project dependencies and scripts
└── src/
    ├── main.js         # Core application logic, animation loop
    ├── dice.js         # Logic for creating dice (mesh & physics body)
    ├── physics.js      # Cannon-es world setup, gravity, materials
    ├── scene.js        # Three.js scene setup, camera, lights, floor
    ├── ui.js           # UI event listeners and DOM manipulation
    ├── geometry.js     # Geometry helpers for creating dice shapes
    ├── counter.js      # A simple counter example (can be removed)
    ├── style.css       # All application styles
    └── dice-models/
        ├── d4.js
        ├── d6.js
        ├── d8.js
        ├── d10.js
        ├── d12.js
        └── d20.js
```
