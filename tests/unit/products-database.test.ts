import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openProductsDatabase, type ProductsDatabase, type SeededProducts } from '../../apps/products-api/src/database.js';

const temporaryDirectories: string[] = [];

async function openTemporaryDatabase(): Promise<ProductsDatabase> {
  const directory = await mkdtemp(join(tmpdir(), 'testwarez-products-'));
  temporaryDirectories.push(directory);
  return openProductsDatabase(join(directory, 'products.db'));
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('ProductsDatabase', () => {
  it('initializes a reproducible catalog with multiple suppliers and an unavailable offer', async () => {
    const database = await openTemporaryDatabase();
    try {
      const catalog = database.getSeededData();
      expect(catalog.products).toHaveLength(2);
      expect(catalog.suppliers).toHaveLength(3);
      expect(catalog.offers).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'offer-101', productId: 'prod-001', supplierId: 'supplier-alpha', price: '89.00', currency: 'EUR', stock: 8, version: 3 }),
        expect.objectContaining({ id: 'offer-102', productId: 'prod-001', supplierId: 'supplier-beta', stock: 0 }),
      ]));
    } finally { database.close(); }
  });

  it('produces the same seed records for independent empty databases', async () => {
    const first = await openTemporaryDatabase();
    const second = await openTemporaryDatabase();
    try { expect(first.getSeededData()).toEqual(second.getSeededData()); }
    finally { first.close(); second.close(); }
  });

  it('does not duplicate seed records when an existing database is reopened', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'testwarez-products-'));
    temporaryDirectories.push(directory);
    const filename = join(directory, 'products.db');
    const first = openProductsDatabase(filename);
    const expected: SeededProducts = first.getSeededData();
    first.close();
    const restarted = openProductsDatabase(filename);
    try { expect(restarted.getSeededData()).toEqual(expected); }
    finally { restarted.close(); }
  });

  it('enforces offer currency, money, stock and version invariants in SQLite', async () => {
    const database = await openTemporaryDatabase();
    const insert = database.connection.prepare(
      'INSERT INTO offers (id, product_id, supplier_id, price, currency, stock, version) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    try {
      expect(() => insert.run('bad-currency', 'prod-001', 'supplier-alpha', '1.00', 'PLN', 1, 1)).toThrow();
      expect(() => insert.run('bad-money', 'prod-001', 'supplier-alpha', '01.00', 'EUR', 1, 1)).toThrow();
      expect(() => insert.run('bad-stock', 'prod-001', 'supplier-alpha', '1.00', 'EUR', -1, 1)).toThrow();
      expect(() => insert.run('bad-version', 'prod-001', 'supplier-alpha', '1.00', 'EUR', 1, 0)).toThrow();
    } finally { database.close(); }
  });
});
