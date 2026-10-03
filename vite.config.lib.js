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
        banner: '/*! open-dice-dnd (MIT). Includes ConvexHull (a port of quickhull3d by Mauricio Poppe), ConvexGeometry and DecalGeometry from the three.js r130 examples, MIT License, Copyright (c) 2010-2021 three.js authors. Full notices: THIRD_PARTY_NOTICES.txt */',
        globals: {
          three: 'THREE',
          'cannon-es': 'CANNON',
        },
      },
    },
  },
});

