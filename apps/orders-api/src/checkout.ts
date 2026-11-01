import { Decimal } from 'decimal.js';
import type { OrderItem } from './database.js';
import type { ResolvedOffer } from './products-client.js';

export type CreateOrderItem = {
  offerId: string;
  quantity: number;
  expectedUnitPrice: string;
  expectedOfferVersion: number;
};

export function calculateOrder(items: CreateOrderItem[], offers: ResolvedOffer[], exchangeRate: string) {
  // Precision follows the input size, including large contract-valid amounts.
  // Extra digits cover quantity multiplication and the sum of up to 30 lines.
  const Money = Decimal.clone({
    precision: Math.max(...offers.map((offer) => offer.price.length)) + exchangeRate.length + 10,
    rounding: Decimal.ROUND_HALF_UP,
  });
  const orderItems: OrderItem[] = items.map((item, index) => {
    const offer = offers[index]!;
    return {
      offerId: offer.id,
      productName: offer.productName,
      quantity: item.quantity,
      unitPrice: offer.price,
      currency: offer.currency,
      lineTotal: new Money(offer.price).times(item.quantity).toFixed(2),
    };
  });
  const subtotal = orderItems.reduce((sum, item) => sum.plus(item.lineTotal), new Money(0));
  return {
    items: orderItems,
    subtotalEUR: subtotal.toFixed(2),
    total: subtotal.times(exchangeRate).toFixed(2),
  };
}
