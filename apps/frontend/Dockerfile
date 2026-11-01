FROM node:24.11.1-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/products-api/package.json apps/products-api/package.json
COPY apps/orders-api/package.json apps/orders-api/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY mocks/nbp/package.json mocks/nbp/package.json
RUN npm ci
COPY tsconfig.base.json ./
COPY apps/frontend apps/frontend
ARG FRONTEND_FX_URL=http://localhost:3003/api/exchangerates/rates/a/eur/
ENV FRONTEND_FX_URL=$FRONTEND_FX_URL
RUN npm run build:frontend
EXPOSE 5173
CMD ["npm", "run", "start", "--workspace", "@testwarez/frontend"]
