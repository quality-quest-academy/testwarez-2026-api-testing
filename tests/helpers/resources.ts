import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';

type Outcome<T> = { status: 'fulfilled'; value: T } | { status: 'rejected'; reason: unknown };

async function settle<T>(action: () => T | Promise<T>): Promise<Outcome<T>> {
  try { return { status: 'fulfilled', value: await action() }; }
  catch (reason) { return { status: 'rejected', reason }; }
}

// A small LIFO cleanup list, not an environment framework. Register ownership
// immediately, before the next setup step can fail. Never stop at one failure.
export class TestResources {
  private readonly releases: { name: string; release: () => unknown | Promise<unknown> }[] = [];

  defer(name: string, release: () => unknown | Promise<unknown>) {
    this.releases.push({ name, release });
  }

  async close(): Promise<Error[]> {
    const failures: Error[] = [];
    for (const { name, release } of this.releases.splice(0).reverse()) {
      const outcome = await settle(release);
      if (outcome.status === 'rejected') failures.push(new Error(`Cleanup failed: ${name}`, { cause: outcome.reason }));
    }
    return failures;
  }
}

export async function withResources<T>(action: (resources: TestResources) => T | Promise<T>): Promise<T> {
  const resources = new TestResources();
  const outcome = await settle(() => action(resources));
  const failures = await resources.close();
  if (outcome.status === 'rejected') {
    if (failures.length) throw new AggregateError([outcome.reason, ...failures], 'Setup/action and cleanup failed', { cause: outcome.reason });
    throw outcome.reason;
  }
  if (failures.length) throw new AggregateError(failures, 'Test resource cleanup failed');
  return outcome.value;
}

export async function temporaryDirectory(resources: TestResources, prefix: string) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  resources.defer(`temporary directory ${directory}`, () => rm(directory, { recursive: true, force: true }));
  return directory;
}

export function ownDatabase<T extends { connection: { isOpen: boolean }; close(): void }>(resources: TestResources, database: T) {
  // App shutdown normally closes the database; this also covers app construction
  // failure and explicit close/reopen scenarios without closing it twice.
  resources.defer('SQLite database', () => { if (database.connection.isOpen) database.close(); });
  return database;
}

export async function listen(resources: TestResources, app: FastifyInstance, name: string) {
  resources.defer(name, () => app.close());
  return app.listen({ host: '127.0.0.1', port: 0 });
}
