import { openProductsDatabase } from './database.js';
import { buildApp } from './app.js';

const port = Number.parseInt(process.env.PORT ?? '3001', 10);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

const databasePath = process.env.PRODUCTS_DATABASE_PATH ?? '/data/products.db';
const app = buildApp({ database: openProductsDatabase(databasePath) });

async function shutdown() {
  await app.close();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

await app.listen({ host: '0.0.0.0', port });
