import { expect, type Page, type APIRequestContext } from '@playwright/test';
import { ShopPage } from '../e2e/pages/shop-page.js';

export async function browserCheckout({ page, request, shop }: { page: Page; request: APIRequestContext; shop: string }) {
  // Defense in depth: this flow must never contact the public FX provider.
  await page.route('https://api.nbp.pl/**', (route) => route.abort());
  const storefront = new ShopPage(page, shop);
  await storefront.open();
  await expect(storefront.catalogHeading).toBeVisible();
  await expect(storefront.offerButton('offer-102')).toBeDisabled();
  await storefront.addOffer('Demo keyboard', 'Alpha');
  await storefront.setQuantity('Demo keyboard', 'Alpha', 2);
  await storefront.addOffer('Demo mouse', 'Gamma');
  await expect(storefront.indicativeTotal).toHaveText('Indicative total: 915.90 PLN');
  await storefront.reload();
  await expect(storefront.quantity('Demo keyboard', 'Alpha')).toHaveValue('2');
  // Test-data arrangement only: change stock/version after the shopper accepted
  // the offer. API tests already prove conflict codes and transactional writes.
  const update = await request.patch(`${shop}/api/products/offers/offer-101`, { data: { stock: 7 } });
  expect(update.ok()).toBe(true);
  let submissions = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url() === `${shop}/api/orders/orders`) submissions++;
  });
  await storefront.placeOrder();
  await expect(storefront.status).toContainText('OFFER_CHANGED');
  await expect(storefront.placeOrderButton).toBeDisabled();
  await expect(storefront.acceptedOffer('89.00 EUR · version 3')).toBeVisible();
  await expect(storefront.currentOffer('89.00 EUR · version 4 · 7 available')).toBeVisible();
  await expect(storefront.confirmationHeading).toHaveCount(0);
  await storefront.acceptCurrentOffers();
  await expect(storefront.status).toContainText('Press Place order');
  expect(submissions).toBe(1); // Refresh and acceptance are not checkout retries.
  await storefront.placeOrder();
  const confirmation = storefront.confirmation;
  await expect(confirmation).toContainText('Final total from Orders: 915.90 PLN');
  await expect(confirmation).toContainText('Demo keyboard × 2');
  await expect(confirmation).toContainText('Demo mouse × 1');
  expect(submissions).toBe(2);
  await expect(storefront.placeOrderButton).toBeDisabled();
}
