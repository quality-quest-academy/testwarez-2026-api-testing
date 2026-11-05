import { defineConfig } from '@playwright/test';

// Keep this local example independent of Pact's optional usage-metrics service.
process.env.PACT_DO_NOT_TRACK = 'true';

export default defineConfig({
  testDir: './tests/pact',
  outputDir: './test-results/pact/results',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 30_000,
  reporter: 'list',
  projects: [
    { name: 'pact-consumer', testMatch: 'consumer.spec.ts' },
    { name: 'pact-provider', testMatch: 'provider.spec.ts', dependencies: ['pact-consumer'] },
  ],
});
