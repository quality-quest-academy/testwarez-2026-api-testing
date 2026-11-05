import { describe, expect } from 'vitest';
import { it } from './fixtures/databases.js';

describe('ProductsDatabase', () => {
  it('initializes a reproducible catalog with multiple suppliers and an unavailable offer', ({ databases }) => {
    const database = databases.openProducts();
    const catalog = database.getSeededData();
    expect(catalog.products).toHaveLength(2);
    expect(catalog.suppliers).toHaveLength(3);
    expect(catalog.offers).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'offer-101', productId: 'prod-001', supplierId: 'supplier-alpha', price: '89.00', currency: 'EUR', stock: 8, version: 3 }),
      expect.objectContaining({ id: 'offer-102', productId: 'prod-001', supplierId: 'supplier-beta', stock: 0 }),
    ]));
  });

  it('produces the same seed records for independent empty databases', ({ databases }) => {
    const first = databases.openProducts();
    const second = databases.openProducts();
    expect(first.getSeededData()).toEqual(second.getSeededData());
  });

  it('does not duplicate seed records when an existing database is reopened', async ({ databases }) => {
    const filename = await databases.filename('testwarez-products-');
    const first = databases.openProducts(filename);
    const expected = first.getSeededData();
    first.close();

    const restarted = databases.openProducts(filename);

    expect(restarted.getSeededData()).toEqual(expected);
  });

  it('preserves edited offers when startup seeds an existing database again', async ({ databases }) => {
    const filename = await databases.filename('testwarez-products-edited-');
    const first = databases.openProducts(filename);
    first.updateOffer('offer-101', { price: '90.00', stock: 7 });
    const expected = first.getSeededData();
    first.close();

    const restarted = databases.openProducts(filename);

    expect(restarted.getSeededData()).toEqual(expected);
    expect(restarted.resolveOffers(['offer-101']).offers[0]).toMatchObject({ price: '90.00', stock: 7, version: 4 });
  });

  for (const [description, price, currency, stock, version] of [
    ['currency', '1.00', 'PLN', 1, 1],
    ['money', '01.00', 'EUR', 1, 1],
    ['negative stock', '1.00', 'EUR', -1, 1],
    ['fractional stock', '1.00', 'EUR', 1.5, 1],
    ['zero version', '1.00', 'EUR', 1, 0],
    ['fractional version', '1.00', 'EUR', 1, 1.5],
  ] as const) {
    it(`rejects invalid ${description} in SQLite`, ({ databases }) => {
      const database = databases.openProducts();
      const insert = database.connection.prepare(
        'INSERT INTO offers (id, product_id, supplier_id, price, currency, stock, version) VALUES (?, ?, ?, ?, ?, ?, ?)',
      );

      expect(() => insert.run('invalid-offer', 'prod-001', 'supplier-alpha', price, currency, stock, version)).toThrow();
      expect(database.resolveOffers(['invalid-offer']).missingOfferIds).toEqual(['invalid-offer']);
    });
  }
});
