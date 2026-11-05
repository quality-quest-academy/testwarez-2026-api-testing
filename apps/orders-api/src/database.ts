import { DatabaseSync } from 'node:sqlite';

export type OrderItem = {
  offerId: string;
  productName: string;
  quantity: number;
  unitPrice: string;
  currency: 'EUR';
  lineTotal: string;
};

export type Order = {
  id: string;
  status: 'CREATED';
  currency: 'PLN';
  subtotalEUR: string;
  exchangeRate: string;
  exchangeRateDate: string;
  total: string;
  createdAt: string;
  items: OrderItem[];
};

export class OrdersDatabase {
  readonly connection: DatabaseSync;

  constructor(filename: string) {
    this.connection = new DatabaseSync(filename);
    try {
      this.connection.exec(`
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS orders (
          id TEXT PRIMARY KEY,
          snapshot TEXT NOT NULL CHECK (json_valid(snapshot))
        );
        CREATE TABLE IF NOT EXISTS idempotency_records (
          key TEXT PRIMARY KEY NOT NULL,
          fingerprint TEXT NOT NULL,
          order_id TEXT NOT NULL UNIQUE REFERENCES orders(id)
        );
      `);
    } catch (error) {
      this.connection.close();
      throw error;
    }
  }

  close() { this.connection.close(); }

  insertOrder(order: Order, key: string, fingerprint: string) {
    // Only successful checkouts reach here; both writes commit or neither does.
    this.connection.exec('BEGIN');
    try {
      this.connection.prepare('INSERT INTO orders (id, snapshot) VALUES (?, ?)')
        .run(order.id, JSON.stringify(order));
      this.connection.prepare('INSERT INTO idempotency_records (key, fingerprint, order_id) VALUES (?, ?, ?)')
        .run(key, fingerprint, order.id);
      this.connection.exec('COMMIT');
    } catch (error) {
      this.connection.exec('ROLLBACK');
      throw error;
    }
  }

  findSuccessfulRequest(key: string): { fingerprint: string; order: Order } | undefined {
    const row = this.connection.prepare(`
      SELECT fingerprint, snapshot FROM idempotency_records
      JOIN orders ON orders.id = idempotency_records.order_id WHERE key = ?
    `).get(key) as { fingerprint: string; snapshot: string } | undefined;
    return row === undefined ? undefined : { fingerprint: row.fingerprint, order: JSON.parse(row.snapshot) as Order };
  }

  findOrder(id: string): Order | undefined {
    const row = this.connection.prepare('SELECT snapshot FROM orders WHERE id = ?')
      .get(id) as { snapshot: string } | undefined;
    return row === undefined ? undefined : JSON.parse(row.snapshot) as Order;
  }
}

export function openOrdersDatabase(filename: string) {
  return new OrdersDatabase(filename);
}
