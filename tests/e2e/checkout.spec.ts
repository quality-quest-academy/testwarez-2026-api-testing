import { test } from './fixtures.js';
import { browserCheckout } from '../scenarios/browser-checkout.js';

test('catalog → cart → explicit conflict review → checkout → confirmation', browserCheckout);
