import SwaggerParser from '@apidevtools/swagger-parser';
import Ajv from 'ajv-draft-04';
import addFormats from 'ajv-formats';
import type { OpenAPIV3 } from 'openapi-types';
import { describe, expect, it } from 'vitest';

type ObjectValue = Record<string, unknown>;

function isObject(value: unknown): value is ObjectValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// These are schema-tooling unit tests, not tests against an implemented API.
// No nullable or other OpenAPI-only validation keywords are used by these specs.
// Explicit .default supports these CommonJS packages under NodeNext typing.
const ajv = new Ajv.default({ strict: false, allErrors: true });
addFormats.default(ajv);

for (const service of ['products', 'orders']) {
  describe(`${service} OpenAPI contract`, async () => {
    const path = `contracts/${service}.openapi.yaml`;
    await SwaggerParser.validate(path);
    const document = await SwaggerParser.dereference(path) as OpenAPIV3.Document;
    const schemas = document.components?.schemas as Record<string, ObjectValue>;

    function validateExample(schema: object, value: unknown) {
      const validate = ajv.compile(schema);
      expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
    }

    it('validates every authored schema, request, response and parameter example', () => {
      let checked = 0;
      function visit(value: unknown) {
        if (Array.isArray(value)) {
          value.forEach(visit);
          return;
        }
        if (!isObject(value)) return;
        const schema = isObject(value.schema) ? value.schema : value;
        if ('example' in value) {
          validateExample(schema, value.example);
          checked++;
        }
        if (isObject(value.schema) && isObject(value.examples)) {
          for (const example of Object.values(value.examples)) {
            if (isObject(example) && 'value' in example) {
              validateExample(value.schema, example.value);
              checked++;
            }
          }
        }
        for (const [key, child] of Object.entries(value)) {
          if (key !== 'example' && key !== 'examples') visit(child);
        }
      }
      visit(document);
      expect(checked).toBeGreaterThan(0);
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
