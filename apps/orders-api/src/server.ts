import { buildApp } from './app.js';
import { openOrdersDatabase } from './database.js';

const port = Number.parseInt(process.env.PORT ?? '3002', 10);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

const databasePath = process.env.ORDERS_DATABASE_PATH ?? '/data/orders.db';
const app = buildApp({
  database: openOrdersDatabase(databasePath),
  products: { baseUrl: process.env.PRODUCTS_BASE_URL ?? 'http://localhost:3001' },
  nbp: { baseUrl: process.env.NBP_BASE_URL ?? 'https://api.nbp.pl' },
});

async function shutdown() {
  await app.close();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

await app.listen({ host: '0.0.0.0', port });
