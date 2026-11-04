import { expect, test } from '@playwright/test';
import { createResourceProbe } from './fixtures/resource-probe.js';

test('releases real resources when a later setup step fails', async () => {
  const probe = createResourceProbe();
  const setupFailure = new Error('Controlled later setup failure');

  await expect(probe.run(async () => {
    expect(await probe.state()).toEqual({ databaseOpen: true, listenerListening: true, directoryExists: true });
    throw setupFailure;
  })).rejects.toBe(setupFailure);

  expect(await probe.state()).toEqual({ databaseOpen: false, listenerListening: false, directoryExists: false });
});

test('releases real resources and preserves a failed HTTP assertion', async ({ request }) => {
  const probe = createResourceProbe();

  await expect(probe.run(async (address) => {
    const response = await request.get(`${address}/health`);
    expect(response.status(), 'Controlled assertion failure after real HTTP').toBe(500);
  })).rejects.toThrow('Controlled assertion failure after real HTTP');

  expect(await probe.state()).toEqual({ databaseOpen: false, listenerListening: false, directoryExists: false });
});
