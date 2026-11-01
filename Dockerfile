FROM node:24.11.1-bookworm-slim

ARG SERVICE
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/products-api/package.json apps/products-api/package.json
COPY apps/orders-api/package.json apps/orders-api/package.json
COPY mocks/nbp/package.json mocks/nbp/package.json
RUN npm ci

COPY tsconfig.base.json ./
COPY apps apps
COPY mocks mocks

RUN case "$SERVICE" in \
      products-api) ./node_modules/.bin/tsc -p apps/products-api/tsconfig.json --noEmit false --rootDir apps/products-api/src --outDir dist ;; \
      orders-api) ./node_modules/.bin/tsc -p apps/orders-api/tsconfig.json --noEmit false --rootDir apps/orders-api/src --outDir dist ;; \
      nbp-mock) ./node_modules/.bin/tsc -p mocks/nbp/tsconfig.json --noEmit false --rootDir mocks/nbp/src --outDir dist && cp mocks/nbp/example-rate.json example-rate.json ;; \
      *) echo "SERVICE must be products-api, orders-api, or nbp-mock" >&2; exit 1 ;; \
    esac

CMD ["node", "dist/server.js"]
