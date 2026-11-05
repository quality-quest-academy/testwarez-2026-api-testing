import { test as base } from '@playwright/test';
import { buildNbpMock, type NbpMockMode } from '../../../mocks/nbp/src/app.js';
import { listen, withResources } from '../../helpers/resources.js';

type Options = { mode: NbpMockMode; timeoutDelayMs: number };

export const test = base.extend<Options & { mock: { address: string } }>({
  mode: ['success', { option: true }],
  timeoutDelayMs: [1_000, { option: true }],
  mock: async ({ mode, timeoutDelayMs }, use) => withResources(async (resources) => {
    const address = await listen(resources, buildNbpMock({ mode, timeoutDelayMs }), 'NBP mock');
    await use({ address });
  }),
});
