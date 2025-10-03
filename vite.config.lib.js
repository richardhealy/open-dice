import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.js'),
      name: 'DiceRollEngine',
      formats: ['es', 'umd'],
      fileName: (format) => `open-dice-dnd.${format}.js`,
    },
    rollupOptions: {
      external: ['three', 'cannon-es'],
      output: {
        globals: {
          three: 'THREE',
          'cannon-es': 'CANNON',
        },
      },
    },
  },
});

