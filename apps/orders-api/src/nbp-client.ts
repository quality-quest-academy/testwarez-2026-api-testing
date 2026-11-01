export const DEFAULT_NBP_BASE_URL = 'https://api.nbp.pl';

export type NbpExchangeRate = {
  rate: string;
  effectiveDate: string;
};

export type NbpClientOptions = {
  baseUrl?: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
};

export class NbpClientError extends Error {
  constructor(
    readonly reason: 'TIMEOUT' | 'UNAVAILABLE' | 'INVALID_RESPONSE',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'NbpClientError';
  }
}

type NbpResponse = {
  table: unknown;
  currency: unknown;
  code: unknown;
  rates: unknown;
};

function isNbpResponse(value: unknown): value is NbpResponse {
  return typeof value === 'object' && value !== null;
}

function parseRate(value: unknown): NbpExchangeRate {
  if (
    !isNbpResponse(value) || value.table !== 'A' || value.currency !== 'euro' ||
    value.code !== 'EUR' || !Array.isArray(value.rates)
  ) {
    throw new NbpClientError('INVALID_RESPONSE', 'NBP response does not contain an EUR table A rate');
  }

  const [latestRate] = value.rates;
  if (
    typeof latestRate !== 'object' || latestRate === null ||
    !('no' in latestRate) || !('effectiveDate' in latestRate) || !('mid' in latestRate) ||
    typeof latestRate.no !== 'string' || latestRate.no.length === 0 ||
    typeof latestRate.effectiveDate !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(latestRate.effectiveDate) ||
    typeof latestRate.mid !== 'number' || !Number.isFinite(latestRate.mid) || latestRate.mid <= 0
  ) {
    throw new NbpClientError('INVALID_RESPONSE', 'NBP response has an invalid latest EUR rate');
  }

  return { rate: latestRate.mid.toFixed(4), effectiveDate: latestRate.effectiveDate };
}

export class NbpClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly request: typeof globalThis.fetch;

  constructor({ baseUrl = DEFAULT_NBP_BASE_URL, timeoutMs = 2_000, fetch = globalThis.fetch }: NbpClientOptions = {}) {
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
    this.request = fetch;
  }

  async getLatestEurPlnRate(): Promise<NbpExchangeRate> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      let response: Response;
      try {
        response = await this.request(new URL('/api/exchangerates/rates/a/eur/', this.baseUrl), {
          headers: { accept: 'application/json' },
          signal: controller.signal,
        });
      } catch (error) {
        if (controller.signal.aborted) {
          throw new NbpClientError('TIMEOUT', 'NBP request timed out', { cause: error });
        }
        throw new NbpClientError('UNAVAILABLE', 'NBP request failed', { cause: error });
      }

      if (!response.ok) {
        throw new NbpClientError('UNAVAILABLE', `NBP returned HTTP ${response.status}`);
      }

      try {
        return parseRate(await response.json());
      } catch (error) {
        if (controller.signal.aborted) {
          throw new NbpClientError('TIMEOUT', 'NBP request timed out', { cause: error });
        }
        if (error instanceof NbpClientError) throw error;
        throw new NbpClientError('INVALID_RESPONSE', 'NBP response was not valid JSON', { cause: error });
      }
    } finally {
      // The timeout covers consuming the response body as well as its headers.
      clearTimeout(timer);
    }
  }
}
