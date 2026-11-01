import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { openOrdersDatabase, type Order } from '../../apps/orders-api/src/database.js';

const order: Order = {
  id: 'order-001', status: 'CREATED', currency: 'PLN', createdAt: '2026-10-21T12:00:00Z',
  subtotalEUR: '89.00', exchangeRate: '4.3000', exchangeRateDate: '2026-10-21', total: '382.70',
  items: [{ offerId: 'offer-101', productName: 'Demo keyboard', quantity: 1, unitPrice: '89.00', currency: 'EUR', lineTotal: '89.00' }],
};

it('stores the successful fingerprint with its order snapshot', () => {
  const database = openOrdersDatabase(':memory:');
  try {
    expect(database.findSuccessfulRequest('checkout-0001')).toBeUndefined();
    database.insertOrder(order, 'checkout-0001', 'fingerprint-1');
    expect(database.findSuccessfulRequest('checkout-0001')).toEqual({ fingerprint: 'fingerprint-1', order });
    expect(database.findOrder(order.id)).toEqual(order);
  } finally { database.close(); }
});

it('rolls back the order when writing the successful-key record fails, then permits retry', () => {
  const database = openOrdersDatabase(':memory:');
  try {
    database.connection.exec(`
      CREATE TRIGGER reject_key BEFORE INSERT ON idempotency_records
      BEGIN SELECT RAISE(ABORT, 'Simulated key write failure'); END;
    `);
    expect(() => database.insertOrder(order, 'checkout-0001', 'fingerprint-1')).toThrow('Simulated key write failure');
    expect(database.findOrder(order.id)).toBeUndefined();
    expect(database.findSuccessfulRequest('checkout-0001')).toBeUndefined();
    expect(database.connection.prepare('SELECT count(*) AS count FROM idempotency_records').get()).toEqual({ count: 0 });
    database.connection.exec('DROP TRIGGER reject_key');
    database.insertOrder(order, 'checkout-0001', 'fingerprint-1');
    expect(database.findSuccessfulRequest('checkout-0001')).toEqual({ fingerprint: 'fingerprint-1', order });
  } finally { database.close(); }
});

it('preserves the original successful record and rolls back a duplicate-key order', () => {
  const database = openOrdersDatabase(':memory:');
  try {
    database.insertOrder(order, 'checkout-0001', 'fingerprint-1');
    expect(() => database.insertOrder({ ...order, id: 'order-002' }, 'checkout-0001', 'fingerprint-2')).toThrow();
    expect(database.findOrder('order-002')).toBeUndefined();
    expect(database.findSuccessfulRequest('checkout-0001')).toEqual({ fingerprint: 'fingerprint-1', order });
    expect(database.connection.prepare('SELECT count(*) AS count FROM orders').get()).toEqual({ count: 1 });
  } finally { database.close(); }
});

it('adds key storage to a pre-KAN-10 database without changing existing history', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'testwarez-orders-upgrade-'));
  const filename = join(directory, 'orders.db');
  try {
    const legacy = new DatabaseSync(filename);
    try {
      legacy.exec('CREATE TABLE orders (id TEXT PRIMARY KEY, snapshot TEXT NOT NULL CHECK (json_valid(snapshot)))');
      legacy.prepare('INSERT INTO orders (id, snapshot) VALUES (?, ?)').run(order.id, JSON.stringify(order));
    } finally { legacy.close(); }

    const database = openOrdersDatabase(filename);
    try {
      expect(database.findOrder(order.id)).toEqual(order);
      expect(database.findSuccessfulRequest('checkout-0001')).toBeUndefined();
      const next = { ...order, id: 'order-002' };
      database.insertOrder(next, 'checkout-0001', 'fingerprint-1');
      expect(database.findSuccessfulRequest('checkout-0001')).toEqual({ fingerprint: 'fingerprint-1', order: next });
      expect(database.findOrder(order.id)).toEqual(order);
    } finally { database.close(); }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
