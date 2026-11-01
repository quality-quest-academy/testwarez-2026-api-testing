import Fastify, { type FastifyServerOptions } from 'fastify';
import { randomUUID } from 'node:crypto';
import { calculateOrder, type CreateOrderItem } from './checkout.js';
import { openOrdersDatabase, type OrdersDatabase, type Order } from './database.js';
import { NbpClient, NbpClientError, type NbpClientOptions } from './nbp-client.js';
import { ProductsClient, ProductsClientError, type ProductsClientOptions } from './products-client.js';

export type OrdersAppOptions = FastifyServerOptions & {
  database?: OrdersDatabase;
  products?: ProductsClientOptions;
  nbp?: NbpClientOptions;
};

const identifierSchema = { type: 'string', minLength: 1 } as const;
const moneySchema = { type: 'string', pattern: '^(0|[1-9][0-9]*)\\.[0-9]{2}$' } as const;

export function buildApp({ database = openOrdersDatabase(':memory:'), products, nbp, ...options }: OrdersAppOptions = {}) {
  const app = Fastify({ ...options, ajv: { customOptions: { coerceTypes: false, removeAdditional: false } } });
  const productsClient = new ProductsClient(products);
  const nbpClient = new NbpClient(nbp);

  app.addHook('onClose', () => database.close());
  app.setErrorHandler((error, _request, reply) => {
    if (typeof error === 'object' && error !== null &&
      (('validation' in error && error.validation !== undefined) ||
        ('statusCode' in error && error.statusCode === 400))) {
      return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'Invalid request' });
    }
    if (error instanceof ProductsClientError && error.missingOfferIds !== undefined) {
      return reply.status(409).send({ code: 'OFFER_UNAVAILABLE', message: 'Offers no longer exist', offerIds: error.missingOfferIds });
    }
    if (error instanceof ProductsClientError || error instanceof NbpClientError) {
      return reply.status(503).send({ code: 'DEPENDENCY_UNAVAILABLE', message: error.message });
    }
    return reply.send(error);
  });

  app.get('/health', () => ({ status: 'ok' }));

  app.get<{ Params: { orderId: string } }>('/orders/:orderId', {
    schema: { params: { type: 'object', required: ['orderId'], additionalProperties: false, properties: { orderId: identifierSchema } } },
  }, (request, reply) => {
    const order = database.findOrder(request.params.orderId);
    return order === undefined
      ? reply.status(404).send({ code: 'NOT_FOUND', message: 'Order not found' })
      : order;
  });

  app.post<{ Body: { items: CreateOrderItem[] } }>('/orders', {
    schema: {
      headers: {
        type: 'object', required: ['idempotency-key'],
        properties: { 'idempotency-key': { type: 'string', minLength: 8, maxLength: 128 } },
      },
      body: {
        type: 'object', required: ['items'], additionalProperties: false,
        properties: {
          items: {
            type: 'array', minItems: 1, maxItems: 30, uniqueItems: true,
            items: {
              type: 'object', additionalProperties: false,
              required: ['offerId', 'quantity', 'expectedUnitPrice', 'expectedOfferVersion'],
              properties: {
                offerId: identifierSchema,
                quantity: { type: 'integer', minimum: 1, maximum: 100 },
                expectedUnitPrice: moneySchema,
                expectedOfferVersion: { type: 'integer', minimum: 1 },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { items } = request.body;
    const offerIds = items.map((item) => item.offerId);
    if (new Set(offerIds).size !== offerIds.length) {
      return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'Offer IDs must be unique' });
    }
    const offers = await productsClient.resolveOffers(offerIds);
    const unavailable = offers.filter((offer, index) => offer.stock < items[index]!.quantity);
    if (unavailable.length > 0) {
      return reply.status(409).send({ code: 'OFFER_UNAVAILABLE', message: 'Insufficient stock', offerIds: unavailable.map((offer) => offer.id) });
    }
    const changes = offers.flatMap((offer, index) => {
      const item = items[index]!;
      return offer.price === item.expectedUnitPrice && offer.version === item.expectedOfferVersion ? [] : [{
        offerId: offer.id,
        expectedUnitPrice: item.expectedUnitPrice,
        expectedOfferVersion: item.expectedOfferVersion,
        currentUnitPrice: offer.price,
        currentOfferVersion: offer.version,
      }];
    });
    if (changes.length > 0) {
      return reply.status(409).send({ code: 'OFFER_CHANGED', message: 'Reconfirm current offer prices and versions', changes });
    }
    const { rate, effectiveDate } = await nbpClient.getLatestEurPlnRate();
    const order: Order = {
      id: randomUUID(), status: 'CREATED', currency: 'PLN', createdAt: new Date().toISOString(),
      exchangeRate: rate, exchangeRateDate: effectiveDate,
      ...calculateOrder(items, offers, rate),
    };
    database.insertOrder(order);
    return reply.status(201).header('Location', `/orders/${order.id}`).send(order);
  });

  return app;
}
