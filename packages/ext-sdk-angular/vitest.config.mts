import { defineConfig } from 'vitest/config';

// Pure functions only (src/lib/logic.ts) — no Angular compiler involved.
export default defineConfig({
  test: { include: ['src/**/*.spec.ts'], environment: 'node' }
});
