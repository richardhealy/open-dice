import { defineConfig } from 'vite';
import { resolve } from 'path';

// open-dice-dnd/gltf: three's GLTFLoader bundled against the library's own `three` (external),
// so the scenes it loads share the roller's three instance. ES only; built after the main entry.
export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/gltf.js'),
      formats: ['es'],
      fileName: () => 'open-dice-dnd-gltf.es.js',
    },
    rollupOptions: {
      external: ['three', 'cannon-es'],
      output: {
        banner: '/*! open-dice-dnd (MIT). Includes GLTFLoader from the three.js r130 examples, MIT License, Copyright (c) 2010-2021 three.js authors. Full notices: THIRD_PARTY_NOTICES.txt */',
      },
    },
  },
});
