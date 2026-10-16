import {
  getAPIKey,
  SCIX_API_BASE,
  REQUEST_TIMEOUT,
  RATE_LIMIT,
  buildUserAgent,
  CLIENT_SOURCE,
  CLIENT_SOURCE_HEADER,
  TransportKind
} from './config.js';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export class RepeatedParam {
  constructor(readonly values: readonly string[]) {}
}

export function repeated(values: readonly string[]): RepeatedParam {
  return new RepeatedParam(values);
}

interface RequestOptions {
  params?: Record<string, unknown>;
  body?: unknown;
}

function formatRateLimitReset(resetHeader: string | null): string | undefined {
  if (!resetHeader) {
    return undefined;
  }
  const seconds = Number(resetHeader);
  if (!Number.isFinite(seconds)) {
    return undefined;
  }
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}

interface RateLimitHeaders {
  limit: string | null;
  remaining: string | null;
  reset: string | null;
}

function parseRateLimitCount(header: string | null): number | undefined {
  const trimmed = header?.trim();
  if (!trimmed) {
    return undefined;
  }
  const count = Number(trimmed);
  if (!Number.isInteger(count) || count < 0) {
    return undefined;
  }
  return count;
}

function describeRateLimit(headers: RateLimitHeaders): string {
  const limit = parseRateLimitCount(headers.limit);
  const remaining = parseRateLimitCount(headers.remaining);

  if (limit !== undefined && remaining !== undefined) {
    return `This endpoint's limit is ${limit} requests, ${remaining} remaining.`;
  }
  if (limit !== undefined) {
    return `This endpoint's limit is ${limit} requests.`;
  }
  if (remaining !== undefined) {
    return `${remaining} remaining on this endpoint's limit.`;
  }
  return 'Limits vary by endpoint; this response did not report a usable limit.';
}

function describeRetryHint(method: HttpMethod): string {
  if (method === 'GET') {
    return 'This is usually transient; retrying may help.';
  }
  return 'This is usually transient; retrying may help, but if this request modifies ' +
    'data, check whether it was applied first.';
}

interface AbortState {
  signal: AbortSignal;
  // Any AbortError not caused by the caller is attributed to the timeout.
  cancelledByCaller: () => boolean;
  dispose: () => void;
}

// Hand-wired instead of AbortSignal.any(), which needs Node 20; package.json
// allows Node 18.
function linkAbort(callerSignal: AbortSignal | undefined, timeoutMs: number): AbortState {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const onCallerAbort = () => controller.abort();
  if (callerSignal?.aborted) {
    controller.abort();
  } else {
    callerSignal?.addEventListener('abort', onCallerAbort, { once: true });
  }

  return {
    signal: controller.signal,
    cancelledByCaller: () => callerSignal?.aborted === true,
    dispose: () => {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onCallerAbort);
    }
  };
}

function abortMessage(cancelledByCaller: boolean): string {
  return cancelledByCaller
    ? 'Request cancelled before the SciX API responded'
    : `Request timeout after ${REQUEST_TIMEOUT / 1000} seconds`;
}

function extractAdsErrorMessage(body: unknown): string | undefined {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    if (typeof record.error === 'string') {
      return record.error;
    }
    if (typeof record.message === 'string') {
      return record.message;
    }
  }
  return undefined;
}

export class SciXAPIError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'SciXAPIError';
    this.status = status;
    this.body = body;
  }
}

export interface SciXAPIClientOptions {
  // Falls back to SCIX_API_TOKEN when absent.
  token?: string;
  transport?: TransportKind;
  // Aborted by the HTTP transport on caller disconnect, so an abandoned
  // request doesn't keep running against the caller's rate limit.
  signal?: AbortSignal;
}

export class SciXAPIClient {
  private apiKey: string;
  private baseURL: string;
  private userAgent: string;
  private signal?: AbortSignal;

  constructor(options: SciXAPIClientOptions = {}) {
    const provided = options.token?.trim();
    this.apiKey = provided ? provided : getAPIKey();
    this.baseURL = SCIX_API_BASE;
    this.userAgent = buildUserAgent(options.transport ?? 'stdio');
    this.signal = options.signal;
  }

  async get<T = unknown>(endpoint: string, params?: Record<string, unknown>): Promise<T> {
    return this.request<T>('GET', endpoint, { params });
  }

  async post<T = unknown>(endpoint: string, data: unknown): Promise<T> {
    return this.request<T>('POST', endpoint, { body: data });
  }

  async put<T = unknown>(endpoint: string, data: unknown): Promise<T> {
    return this.request<T>('PUT', endpoint, { body: data });
  }

  async delete<T = unknown>(endpoint: string): Promise<T> {
    return this.request<T>('DELETE', endpoint, {});
  }

  private buildUrl(endpoint: string, params?: Record<string, unknown>): string {
    const url = new URL(`${this.baseURL}/${endpoint}`);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (value instanceof RepeatedParam) {
            for (const entry of value.values) {
              url.searchParams.append(key, entry);
            }
          } else if (Array.isArray(value)) {
            url.searchParams.append(key, value.join(','));
          } else {
            url.searchParams.append(key, String(value));
          }
        }
      });
    }

    return url.toString();
  }

  private async request<T = unknown>(
    method: HttpMethod,
    endpoint: string,
    { params, body }: RequestOptions
  ): Promise<T> {
    const url = this.buildUrl(endpoint, params);
    const serializedBody = body !== undefined ? JSON.stringify(body) : undefined;
    const abort = linkAbort(this.signal, REQUEST_TIMEOUT);

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'User-Agent': this.userAgent,
      [CLIENT_SOURCE_HEADER]: CLIENT_SOURCE
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const init: RequestInit = {
      method,
      headers,
      body: serializedBody,
      signal: abort.signal
    };

    try {
      const text = await this.fetchResponseText(method, endpoint, url, init, abort);
      return this.parseResponseBody<T>(method, endpoint, text);
    } finally {
      abort.dispose();
    }
  }

  private async fetchResponseText(
    method: HttpMethod,
    endpoint: string,
    url: string,
    init: RequestInit,
    abort: AbortState
  ): Promise<string> {
    try {
      const response = await fetch(url, init);
      const text = await response.text();

      if (!response.ok) {
        const parsedErrorBody = this.safeParseJson(text);
        const rateLimit: RateLimitHeaders = {
          limit: response.headers?.get(RATE_LIMIT.HEADERS.LIMIT) ?? null,
          remaining: response.headers?.get(RATE_LIMIT.HEADERS.REMAINING) ?? null,
          reset: response.headers?.get(RATE_LIMIT.HEADERS.RESET) ?? null
        };
        throw this.buildError(
          response.status,
          response.statusText,
          method,
          endpoint,
          parsedErrorBody,
          rateLimit
        );
      }

      return text;
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(abortMessage(abort.cancelledByCaller()));
      }
      if (error instanceof SciXAPIError) {
        throw error;
      }
      const original = error instanceof Error ? error : new Error(String(error));
      throw new Error(
        `SciX API request failed for ${method} ${endpoint} at ${this.baseURL}: ` +
          `${original.message}`,
        { cause: original }
      );
    }
  }

  private parseResponseBody<T>(method: HttpMethod, endpoint: string, text: string): T {
    const trimmed = text.trim();
    if (!trimmed) {
      return {} as T;
    }
    try {
      return JSON.parse(trimmed) as T;
    } catch (error: unknown) {
      const original = error instanceof Error ? error : new Error(String(error));
      throw new Error(
        `SciX API returned a malformed response body for ${method} ${endpoint}: ` +
          `${original.message}`,
        { cause: original }
      );
    }
  }

  private safeParseJson(text: string): unknown {
    if (!text) {
      return undefined;
    }
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  private buildError(
    status: number,
    statusText: string,
    method: HttpMethod,
    endpoint: string,
    body: unknown,
    rateLimit: RateLimitHeaders
  ): SciXAPIError {
    const context = `for ${method} ${endpoint}`;
    const adsMessage = extractAdsErrorMessage(body);

    let message: string;
    if (status === 401) {
      message = `Authentication failed ${context}. The SciX API token was missing or rejected. ` +
        `Get your key from https://scixplorer.org/user/settings/token`;
    } else if (status === 403) {
      message = `Permission denied ${context}. Re-authenticating will not help: the token ` +
        `either lacks access to this resource or the request was blocked upstream.`;
    } else if (status === 404) {
      message = `Resource not found ${context}.`;
    } else if (status === 429) {
      message = `Rate limit exceeded ${context}. ${describeRateLimit(rateLimit)} ` +
        `Please try again later.`;
      const resetTime = formatRateLimitReset(rateLimit.reset);
      if (resetTime) {
        message += ` Retry after ${resetTime}.`;
      }
    } else if (status >= 500) {
      message = `SciX API temporarily unavailable (${status} ${statusText}) ${context}. ` +
        describeRetryHint(method);
    } else {
      message = `SciX API error: ${status} ${statusText} ${context}`;
    }

    if (adsMessage) {
      message += ` — ${adsMessage}`;
    }

    return new SciXAPIError(message, status, body);
  }
}
