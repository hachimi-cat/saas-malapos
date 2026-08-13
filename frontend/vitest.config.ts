import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Minimal Vitest config: resolve the `@/` alias the app uses so unit
 * tests can import from src the same way the app does. No jsdom — the
 * suites here are pure logic (currency formatting, the catentio bulk
 * apply machinery); add `environment: 'jsdom'` + a react plugin only if
 * a component-rendering test is introduced.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    server: { deps: { inline: ['@forjio/agent-ui'] } },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
