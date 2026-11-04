import { describe, expect, it } from 'vitest';
import { authoredExamples, loadContract } from './helpers/contract-examples.js';

for (const service of ['products', 'orders'] as const) {
  describe(`${service} OpenAPI contract`, async () => {
    const { document, schemas, ajv } = await loadContract(service);

    it('validates every authored schema, request, response and parameter example', () => {
      const examples = authoredExamples(document);
      expect(examples.length).toBeGreaterThan(0);
      for (const { schema, value } of examples) {
        const validate = ajv.compile(schema);
        expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
      }
    });

    it('rejects numeric, negative, null and incorrectly formatted money', () => {
      const validate = ajv.compile(schemas.Money!);
      for (const value of [89, -1, null, '-1.00', '1.0', '01.00']) {
        expect(validate(value), JSON.stringify(value)).toBe(false);
      }
      expect(validate('0.00')).toBe(true);
    });

    if (service === 'products') {
      it('rejects empty patches, invalid stock and duplicate resolve IDs', () => {
        const patch = ajv.compile(schemas.UpdateOfferRequest!);
        for (const value of [{}, { stock: -1 }, { stock: '8' }, { version: 2 }]) {
          expect(patch(value)).toBe(false);
        }
        expect(patch({ stock: 0 })).toBe(true);
        const resolve = ajv.compile(schemas.ResolveOffersRequest!);
        expect(resolve({ offerIds: [] })).toBe(false);
        expect(resolve({ offerIds: ['offer-101', 'offer-101'] })).toBe(false);
        expect(resolve({ offerIds: Array.from({ length: 31 }, (_, i) => `offer-${i}`) })).toBe(false);
      });
    } else {
      it('accepts ConflictError.changes but rejects malformed or missing details', () => {
        const validate = ajv.compile(schemas.ConflictError!);
        const error = {
          code: 'OFFER_CHANGED',
          message: 'Reconfirm current offer',
          changes: [{
            offerId: 'offer-101',
            expectedUnitPrice: '89.00',
            expectedOfferVersion: 3,
            currentUnitPrice: '90.00',
            currentOfferVersion: 4,
          }],
        };
        expect(validate(error), JSON.stringify(validate.errors)).toBe(true);
        expect(validate({ code: error.code, message: error.message })).toBe(false);
        expect(validate({ ...error, changes: [] })).toBe(false);
        expect(validate({ ...error, changes: [{ ...error.changes[0], currentUnitPrice: 90 }] })).toBe(false);
        expect(validate({ ...error, unexpected: true })).toBe(false);
      });

      it('enforces checkout item bounds and required expectations', () => {
        const validate = ajv.compile(schemas.CreateOrderRequest!);
        const item = { offerId: 'offer-101', quantity: 1, expectedUnitPrice: '89.00', expectedOfferVersion: 3 };
        expect(validate({ items: [item] })).toBe(true);
        for (const quantity of [0, 101, 1.5]) {
          expect(validate({ items: [{ ...item, quantity }] })).toBe(false);
        }
        expect(validate({ items: [] })).toBe(false);
        expect(validate({ items: [item, item] })).toBe(false);
        expect(validate({ items: [{ ...item, expectedOfferVersion: 0 }] })).toBe(false);
        expect(validate({ items: [{ offerId: 'offer-101', quantity: 1 }] })).toBe(false);
      });
    }
  });
}
