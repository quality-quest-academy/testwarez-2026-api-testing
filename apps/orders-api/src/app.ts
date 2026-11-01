import Fastify, { type FastifyServerOptions } from 'fastify';

// Routes and service-owned persistence arrive in KAN-9 / KAN-10.
export function buildApp(options: FastifyServerOptions = {}) {
  return Fastify(options);
}
