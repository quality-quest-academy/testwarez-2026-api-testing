import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export function frontendConfig({
  products = process.env.FRONTEND_PRODUCTS_URL ?? 'http://localhost:3001',
  orders = process.env.FRONTEND_ORDERS_URL ?? 'http://localhost:3002',
  indicativeFx = process.env.FRONTEND_FX_URL ?? 'http://localhost:3003/api/exchangerates/rates/a/eur/',
} = {}) {
  // The local UI host forwards API requests, not business logic. Only Orders
  // resolves authoritative prices/FX. No root .env or credentials are loaded.
  const proxy = {
    '/api/products': { target: products, rewrite: (path: string) => path.replace(/^\/api\/products/, '') },
    '/api/orders': { target: orders, rewrite: (path: string) => path.replace(/^\/api\/orders/, '') },
  };
  return defineConfig({
    root: fileURLToPath(new URL('.', import.meta.url)),
    envDir: false,
    define: { 'import.meta.env.VITE_INDICATIVE_FX_URL': JSON.stringify(indicativeFx) },
    server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy },
    preview: { port: 5173, strictPort: true, proxy },
  });
}

export default frontendConfig();
