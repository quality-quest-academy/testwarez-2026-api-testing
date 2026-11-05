import type { Page } from '@playwright/test';

// One screen, one page object. Locators and user actions live here; business
// expectations, API arrangement and traffic observation stay in the scenario.
export class ShopPage {
  constructor(private readonly page: Page, private readonly url: string) {}

  get catalogHeading() { return this.page.getByRole('heading', { name: 'Catalog', exact: true }); }
  get indicativeTotal() { return this.page.getByTestId('indicative-total'); }
  get status() { return this.page.getByRole('status'); }
  get placeOrderButton() { return this.page.getByRole('button', { name: 'Place order', exact: true }); }
  get confirmationHeading() { return this.page.getByRole('heading', { name: 'Order confirmed', exact: true }); }
  get confirmation() { return this.page.getByRole('region', { name: 'Order confirmed', exact: true }); }

  offerButton(offerId: string) { return this.page.getByTestId(offerId).getByRole('button'); }
  quantity(product: string, supplier: string) {
    return this.page.getByRole('spinbutton', { name: `Quantity for ${product} from ${supplier}`, exact: true });
  }
  acceptedOffer(text: string) { return this.page.getByText(`Accepted: ${text}`, { exact: true }); }
  currentOffer(text: string) { return this.page.getByText(`Current: ${text}`, { exact: true }); }

  async open() { await this.page.goto(this.url); }
  async reload() { await this.page.reload(); }
  async addOffer(product: string, supplier: string) {
    await this.page.getByRole('button', { name: `Add ${product} from ${supplier}`, exact: true }).click();
  }
  async setQuantity(product: string, supplier: string, quantity: number) {
    await this.quantity(product, supplier).fill(String(quantity));
    await this.quantity(product, supplier).press('Tab');
  }
  async placeOrder() { await this.placeOrderButton.click(); }
  async acceptCurrentOffers() {
    await this.page.getByRole('button', { name: 'Accept current offers', exact: true }).click();
  }
}
