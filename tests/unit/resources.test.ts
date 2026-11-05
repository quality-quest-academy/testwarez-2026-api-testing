import { expect, it } from 'vitest';
import { TestResources, withResources } from '../helpers/resources.js';

it('closes resources in reverse acquisition order, awaiting each release', async () => {
  const released: string[] = [];
  const resources = new TestResources();
  resources.defer('directory', () => { released.push('directory'); });
  resources.defer('database', async () => { await Promise.resolve(); released.push('database'); });
  resources.defer('listener', () => { released.push('listener'); });

  expect(await resources.close()).toEqual([]);
  expect(released).toEqual(['listener', 'database', 'directory']);
  expect(await resources.close()).toEqual([]);
});

it('attempts every release and identifies each synchronous/asynchronous cleanup failure', async () => {
  const resources = new TestResources();
  const removed: string[] = [];
  const syncFailure = new Error('close failed');
  const asyncFailure = new Error('remove failed');
  resources.defer('directory', async () => { throw asyncFailure; });
  resources.defer('database', () => { removed.push('database'); });
  resources.defer('listener', () => { throw syncFailure; });

  const failures = await resources.close();

  expect(removed).toEqual(['database']);
  expect(failures).toMatchObject([
    { message: 'Cleanup failed: listener', cause: syncFailure },
    { message: 'Cleanup failed: directory', cause: asyncFailure },
  ]);
});

it('cleans already acquired resources when later setup fails, preserving that failure', async () => {
  const released: string[] = [];
  const failure = new Error('later setup failed');

  await expect(withResources(async (resources) => {
    resources.defer('first resource', () => { released.push('first'); });
    await Promise.resolve();
    throw failure;
  })).rejects.toBe(failure);
  expect(released).toEqual(['first']);
});

it('retains the original action error alongside cleanup failures', async () => {
  const failure = new Error('assertion failed');
  const cleanupFailure = new Error('close failed');

  await expect(withResources((resources) => {
    resources.defer('listener', () => { throw cleanupFailure; });
    throw failure;
  })).rejects.toMatchObject({
    cause: failure,
    errors: [failure, { message: 'Cleanup failed: listener', cause: cleanupFailure }],
  });
});

it('rejects a successful action when cleanup fails rather than returning a successful result', async () => {
  await expect(withResources((resources) => {
    resources.defer('listener', () => { throw new Error('close failed'); });
    return 'ready';
  })).rejects.toThrow('Test resource cleanup failed');
});

it('returns the action result only after successful cleanup', async () => {
  const released: string[] = [];
  const result = await withResources((resources) => {
    resources.defer('resource', () => { released.push('resource'); });
    return 'ready';
  });
  expect(result).toBe('ready');
  expect(released).toEqual(['resource']);
});
