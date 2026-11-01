import Fastify, { type FastifyServerOptions } from 'fastify';

// Persistence is service-owned in database.ts. Routes arrive in KAN-7.
export function buildApp(options: FastifyServerOptions = {}) {
  return Fastify(options);
}
