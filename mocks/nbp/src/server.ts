import { buildNbpMock } from './app.js';

const port = Number.parseInt(process.env.PORT ?? '3003', 10);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

const app = buildNbpMock();

async function shutdown() {
  await app.close();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

await app.listen({ host: '0.0.0.0', port });
