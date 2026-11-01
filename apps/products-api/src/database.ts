import { DatabaseSync } from 'node:sqlite';

export type Product = { id: string; name: string; description: string };
export type Supplier = { id: string; name: string };
export type Offer = {
  id: string;
  productId: string;
  supplierId: string;
  price: string;
  currency: 'EUR';
  stock: number;
  version: number;
};
export type SeededProducts = { products: Product[]; suppliers: Supplier[]; offers: Offer[] };

const seed: SeededProducts = {
  products: [
    { id: 'prod-001', name: 'Demo keyboard', description: 'A keyboard with multiple supplier offers' },
    { id: 'prod-002', name: 'Demo mouse', description: 'A mouse for the multi-item checkout example' },
  ],
  suppliers: [
    { id: 'supplier-alpha', name: 'Alpha' },
    { id: 'supplier-beta', name: 'Beta' },
    { id: 'supplier-gamma', name: 'Gamma' },
  ],
  offers: [
    { id: 'offer-101', productId: 'prod-001', supplierId: 'supplier-alpha', price: '89.00', currency: 'EUR', stock: 8, version: 3 },
    { id: 'offer-102', productId: 'prod-001', supplierId: 'supplier-beta', price: '91.00', currency: 'EUR', stock: 0, version: 1 },
    { id: 'offer-205', productId: 'prod-002', supplierId: 'supplier-gamma', price: '35.00', currency: 'EUR', stock: 12, version: 2 },
  ],
};

export class ProductsDatabase {
  readonly connection: DatabaseSync;

  constructor(filename: string) {
    this.connection = new DatabaseSync(filename, { enableForeignKeyConstraints: true });
    this.connection.exec('PRAGMA foreign_keys = ON;');
    this.createSchema();
    this.seed();
  }

  close() { this.connection.close(); }

  getSeededData(): SeededProducts {
    return {
      products: this.connection.prepare('SELECT id, name, description FROM products ORDER BY id').all() as Product[],
      suppliers: this.connection.prepare('SELECT id, name FROM suppliers ORDER BY id').all() as Supplier[],
      offers: this.connection.prepare('SELECT id, product_id AS productId, supplier_id AS supplierId, price, currency, stock, version FROM offers ORDER BY id').all() as Offer[],
    };
  }

  private createSchema() {
    this.connection.exec(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY, name TEXT NOT NULL CHECK (length(name) > 0), description TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT PRIMARY KEY, name TEXT NOT NULL CHECK (length(name) > 0)
      );
      CREATE TABLE IF NOT EXISTS offers (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES products(id),
        supplier_id TEXT NOT NULL REFERENCES suppliers(id),
        price TEXT NOT NULL CHECK (
          (price GLOB '0.[0-9][0-9]' OR price GLOB '[1-9]*.[0-9][0-9]')
          AND price NOT GLOB '*[^0-9.]*'
          AND length(price) - length(replace(price, '.', '')) = 1
        ),
        currency TEXT NOT NULL CHECK (currency = 'EUR'),
        stock INTEGER NOT NULL CHECK (stock >= 0),
        version INTEGER NOT NULL CHECK (version >= 1)
      );
    `);
  }

  private seed() {
    const insertProduct = this.connection.prepare('INSERT OR IGNORE INTO products (id, name, description) VALUES (?, ?, ?)');
    const insertSupplier = this.connection.prepare('INSERT OR IGNORE INTO suppliers (id, name) VALUES (?, ?)');
    const insertOffer = this.connection.prepare('INSERT OR IGNORE INTO offers (id, product_id, supplier_id, price, currency, stock, version) VALUES (?, ?, ?, ?, ?, ?, ?)');
    this.connection.exec('BEGIN');
    try {
      for (const product of seed.products) insertProduct.run(product.id, product.name, product.description);
      for (const supplier of seed.suppliers) insertSupplier.run(supplier.id, supplier.name);
      for (const offer of seed.offers) {
        insertOffer.run(offer.id, offer.productId, offer.supplierId, offer.price, offer.currency, offer.stock, offer.version);
      }
      this.connection.exec('COMMIT');
    } catch (error) {
      this.connection.exec('ROLLBACK');
      throw error;
    }
  }
}

export function openProductsDatabase(filename: string) {
  return new ProductsDatabase(filename);
}
