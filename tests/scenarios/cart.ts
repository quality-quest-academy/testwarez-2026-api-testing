import { expect, type APIRequestContext } from '@playwright/test';
import type { CreateOrderItem } from '../../apps/orders-api/src/checkout.js';
import type { ProductWithOffers } from '../../apps/products-api/src/database.js';

export async function readCart(request: APIRequestContext, productsUrl: string) {
  const response = await request.get(`${productsUrl}/products`);
  expect(response.status()).toBe(200);
  const products: ProductWithOffers[] = await response.json();
  const offers = products.flatMap((product) => product.offers);
  const items: CreateOrderItem[] = ['offer-101', 'offer-205'].map((id, index) => {
    const offer = offers.find((candidate) => candidate.id === id);
    expect(offer, `Seeded offer ${id}`).toBeDefined();
    return {
      offerId: id, quantity: index === 0 ? 2 : 1,
      expectedUnitPrice: offer!.price, expectedOfferVersion: offer!.version,
    };
  });
  return { items };
}
