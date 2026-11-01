export type ResolvedOffer = {
  id: string;
  productName: string;
  price: string;
  currency: 'EUR';
  stock: number;
  version: number;
};

export class ProductsClientError extends Error {
  constructor(message: string, readonly missingOfferIds?: string[]) {
    super(message);
    this.name = 'ProductsClientError';
  }
}

export type ProductsClientOptions = {
  baseUrl?: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
};

function isResolvedOffer(value: unknown): value is ResolvedOffer {
  if (typeof value !== 'object' || value === null) return false;
  const offer = value as Record<string, unknown>;
  return typeof offer.id === 'string' && offer.id.length > 0 &&
    typeof offer.productName === 'string' && offer.productName.length > 0 &&
    typeof offer.price === 'string' && /^(0|[1-9][0-9]*)\.[0-9]{2}$/.test(offer.price) &&
    offer.currency === 'EUR' && Number.isSafeInteger(offer.stock) && (offer.stock as number) >= 0 &&
    Number.isSafeInteger(offer.version) && (offer.version as number) >= 1;
}

export class ProductsClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly request: typeof globalThis.fetch;

  constructor({ baseUrl = 'http://localhost:3001', timeoutMs = 2_000, fetch = globalThis.fetch }: ProductsClientOptions = {}) {
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
    this.request = fetch;
  }

  async resolveOffers(offerIds: string[]): Promise<ResolvedOffer[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.request(new URL('/offers/resolve', this.baseUrl), {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ offerIds }),
        signal: controller.signal,
      });
      const body: unknown = await response.json();
      if (response.status === 404 && typeof body === 'object' && body !== null &&
        'offerIds' in body && Array.isArray(body.offerIds) && body.offerIds.length > 0 &&
        body.offerIds.every((id) => typeof id === 'string' && offerIds.includes(id))) {
        throw new ProductsClientError('Offers no longer exist', [...new Set(body.offerIds as string[])]);
      }
      if (!response.ok || !Array.isArray(body) || body.length !== offerIds.length ||
        !body.every((offer, index) => isResolvedOffer(offer) && offer.id === offerIds[index])) {
        throw new ProductsClientError('Products returned unusable offers');
      }
      return body as ResolvedOffer[];
    } catch (error) {
      if (error instanceof ProductsClientError) throw error;
      throw new ProductsClientError('Products request failed');
    } finally {
      clearTimeout(timer);
    }
  }
}
