import Fastify, { type FastifyServerOptions } from 'fastify';

// Routes and service-owned persistence arrive in KAN-6 / KAN-7.
export function buildApp(options: FastifyServerOptions = {}) {
  return Fastify(options);
}
