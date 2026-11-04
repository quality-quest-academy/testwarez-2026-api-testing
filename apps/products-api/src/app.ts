import Fastify, { type FastifyServerOptions } from 'fastify';
import { openProductsDatabase, type ProductsDatabase } from './database.js';

export type ProductsAppOptions = FastifyServerOptions & { database?: ProductsDatabase };

const identifierSchema = { type: 'string', minLength: 1 } as const;
const moneySchema = { type: 'string', pattern: '^(0|[1-9][0-9]*)\\.[0-9]{2}$' } as const;

export function buildApp({ database = openProductsDatabase(':memory:'), ...options }: ProductsAppOptions = {}) {
  const app = Fastify({ ...options, ajv: { customOptions: { coerceTypes: false, removeAdditional: false } } });

  app.setErrorHandler((error, _request, reply) => {
    if (typeof error === 'object' && error !== null &&
      (('validation' in error && error.validation !== undefined) ||
        ('statusCode' in error && error.statusCode === 400))) {
      return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'Invalid request' });
    }
    return reply.send(error);
  });

  app.addHook('onClose', () => database.close());

  app.get('/health', () => ({ status: 'ok' }));

  app.get('/products', () => database.listProducts());

  app.get<{ Params: { productId: string } }>('/products/:productId', {
    schema: { params: { type: 'object', required: ['productId'], additionalProperties: false, properties: { productId: identifierSchema } } },
  }, (request, reply) => {
    const product = database.findProduct(request.params.productId);
    return product === undefined
      ? reply.status(404).send({ code: 'NOT_FOUND', message: 'Product not found' })
      : product;
  });

  app.post<{ Body: { offerIds: string[] } }>('/offers/resolve', {
    schema: {
      body: {
        type: 'object', required: ['offerIds'], additionalProperties: false,
        properties: { offerIds: { type: 'array', minItems: 1, maxItems: 30, uniqueItems: true, items: identifierSchema } },
      },
    },
  }, (request, reply) => {
    const { offers, missingOfferIds } = database.resolveOffers(request.body.offerIds);
    return missingOfferIds.length > 0
      ? reply.status(404).send({ code: 'NOT_FOUND', message: 'Requested offers do not exist', offerIds: missingOfferIds })
      : offers;
  });

  app.patch<{ Params: { offerId: string }; Body: { price?: string; stock?: number } }>('/offers/:offerId', {
    schema: {
      params: { type: 'object', required: ['offerId'], additionalProperties: false, properties: { offerId: identifierSchema } },
      body: {
        type: 'object', minProperties: 1, additionalProperties: false,
        properties: { price: moneySchema, stock: { type: 'integer', minimum: 0 } },
      },
    },
  }, (request, reply) => {
    const offer = database.updateOffer(request.params.offerId, request.body);
    return offer === undefined
      ? reply.status(404).send({ code: 'NOT_FOUND', message: 'Offer not found' })
      : offer;
  });

  return app;
}
