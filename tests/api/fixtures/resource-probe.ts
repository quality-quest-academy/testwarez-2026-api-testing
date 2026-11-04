import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../apps/products-api/src/app.js';
import { openProductsDatabase, type ProductsDatabase } from '../../../apps/products-api/src/database.js';
import { listen, ownDatabase, temporaryDirectory, withResources } from '../../helpers/resources.js';

// Exercises the same ownership helpers with real resources, without adding a
// production fault endpoint or intentionally failing the regression suite.
export function createResourceProbe() {
  let directory = '';
  let database: ProductsDatabase | undefined;
  let app: FastifyInstance | undefined;
  return {
    run(action: (address: string) => void | Promise<void>) {
      return withResources(async (resources) => {
        directory = await temporaryDirectory(resources, 'testwarez-cleanup-probe-');
        database = ownDatabase(resources, openProductsDatabase(join(directory, 'products.db')));
        app = buildApp({ database });
        await action(await listen(resources, app, 'Cleanup probe Products API'));
      });
    },
    async state() {
      const directoryExists = await stat(directory).then(() => true, (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return false;
        throw error;
      });
      return { databaseOpen: database?.connection.isOpen, listenerListening: app?.server.listening, directoryExists };
    },
  };
}
