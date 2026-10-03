/**
 * Single injection point for canvas and Path2D creation. Production uses the DOM; unit
 * tests swap in a recording stub so painting logic can run in Node.
 */
let canvasFactory = (size) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    return canvas;
};
let path2DFactory = (d) => new Path2D(d);

export function createCanvas(size) {
    return canvasFactory(size);
}

export function createPath2D(d) {
    return path2DFactory(d);
}

/**
 * Replace either factory. Returns a function that restores the previous ones.
 * @param {{ canvas?: (size: number) => any, path2D?: (d: string) => any }} factories
 */
export function setCanvasFactories({ canvas, path2D } = {}) {
    const previous = { canvas: canvasFactory, path2D: path2DFactory };
    if (canvas) canvasFactory = canvas;
    if (path2D) path2DFactory = path2D;
    return () => {
        canvasFactory = previous.canvas;
        path2DFactory = previous.path2D;
    };
}
