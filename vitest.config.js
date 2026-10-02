import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/unit/**/*.test.js'],
    // three r130 has no "exports" map; its "main" is a UMD build whose named exports
    // Node cannot see. Inlining makes Vite serve build/three.module.js instead.
    server: { deps: { inline: ['three'] } },
  },
});
