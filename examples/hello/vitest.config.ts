import { defineConfig } from 'vitest/config';

// Backend against an in-process stand-in for heimvio; frontend only as pure functions (no Angular compiler).
export default defineConfig({
  test: { include: ['server/test/**/*.test.ts', 'web/src/**/*.spec.ts'], environment: 'node' }
});
