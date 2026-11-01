import { readFileSync } from 'node:fs';
import Fastify, { type FastifyServerOptions } from 'fastify';

export type NbpMockMode = 'success' | 'timeout' | 'unavailable';

export type NbpMockOptions = FastifyServerOptions & {
  mode?: NbpMockMode;
  timeoutDelayMs?: number;
};

const rateFixture = JSON.parse(
  readFileSync(new URL('../example-rate.json', import.meta.url), 'utf8'),
) as unknown;

export function buildNbpMock({
  mode = 'success',
  timeoutDelayMs = 1_000,
  ...options
}: NbpMockOptions = {}) {
  const app = Fastify(options);

  app.get('/health', () => ({ status: 'ok' }));

  app.get('/api/exchangerates/rates/a/eur/', async (_request, reply) => {
    // Read-only public FX response: permit the browser's indicative direct
    // request, rather than hiding cross-origin behavior behind UI routing.
    reply.header('Access-Control-Allow-Origin', '*');
    if (mode === 'unavailable') {
      return reply.status(503).send({ error: 'NBP mock is unavailable' });
    }
    if (mode === 'timeout') {
      await new Promise((resolve) => setTimeout(resolve, timeoutDelayMs));
    }
    return rateFixture;
  });

  return app;
}
