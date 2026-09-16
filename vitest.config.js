import { defineConfig } from 'vitest/config'

// Parser and assistant engine tests. Plain Node: the engine is pure JS; the
// few browser globals it touches (localStorage, window events) are stubbed in
// the setup file.
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify('test'),
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
    setupFiles: ['src/assistant/__tests__/setup.js'],
  },
})
