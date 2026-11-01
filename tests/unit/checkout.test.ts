import { expect, it } from 'vitest';
import { calculateOrder } from '../../apps/orders-api/src/checkout.js';

it.each([
  ['0.10', 3, '4.3000', '0.30', '1.29'],
  ['0.01', 1, '0.5000', '0.01', '0.01'],
  ['0.00', 100, '4.3000', '0.00', '0.00'],
  ['123456789012345678901234567890.12', 100, '4.3000', '12345678901234567890123456789012.00', '53086419275308641927530864192751.60'],
])('calculates %s × %s × %s exactly', (price, quantity, rate, subtotalEUR, total) => {
  const result = calculateOrder(
    [{ offerId: 'offer-1', quantity, expectedUnitPrice: price, expectedOfferVersion: 1 }],
    [{ id: 'offer-1', productName: 'Demo', price, currency: 'EUR', stock: 100, version: 1 }],
    rate,
  );
  expect(result.subtotalEUR).toBe(subtotalEUR);
  expect(result.total).toBe(total);
  expect(result.items[0]!.lineTotal).toBe(subtotalEUR);
});
