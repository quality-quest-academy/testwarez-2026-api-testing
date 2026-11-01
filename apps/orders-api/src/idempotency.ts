import { createHash } from 'node:crypto';
import type { CreateOrderItem } from './checkout.js';

export function fingerprintRequest(items: CreateOrderItem[]): string {
  // Explicit field order ignores JSON object property order, not array order.
  const payload = { items: items.map((item) => ({
    offerId: item.offerId,
    quantity: item.quantity,
    expectedUnitPrice: item.expectedUnitPrice,
    expectedOfferVersion: item.expectedOfferVersion,
  })) };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
