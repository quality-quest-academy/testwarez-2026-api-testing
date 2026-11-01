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
    // One complete snapshot per row: inserting a multi-item order is atomic.
    this.connection.exec(`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        snapshot TEXT NOT NULL CHECK (json_valid(snapshot))
      );
    `);
  }

  close() { this.connection.close(); }

  insertOrder(order: Order) {
    this.connection.prepare('INSERT INTO orders (id, snapshot) VALUES (?, ?)')
      .run(order.id, JSON.stringify(order));
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
