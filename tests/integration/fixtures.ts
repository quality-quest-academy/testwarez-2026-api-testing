import { test as base } from '@playwright/test';
import { startBackend } from '../helpers/backend.js';
import { temporaryDirectory, withResources } from '../helpers/resources.js';

// Test-scoped: identical IDs/keys never share files, listeners or mutable state.
export const test = base.extend<{ backend: Awaited<ReturnType<typeof startBackend>> }>({
  backend: async ({}, use) => withResources(async (resources) => {
    const directory = await temporaryDirectory(resources, 'testwarez-integration-');
    await use(await startBackend(resources, directory));
  }),
});
