import { expect } from '@playwright/test';
import type { OrdersDatabase } from '../../apps/orders-api/src/database.js';

// Test-only inspection: running services never access each other's stores.
export function expectStoredCounts(database: OrdersDatabase, count: number) {
  expect(database.connection.prepare('SELECT count(*) AS count FROM orders').get()).toEqual({ count });
  expect(database.connection.prepare('SELECT count(*) AS count FROM idempotency_records').get()).toEqual({ count });
}
