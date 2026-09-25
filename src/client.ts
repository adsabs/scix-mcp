import {
  getAPIKey,
  SCIX_API_BASE,
  REQUEST_TIMEOUT,
  RATE_LIMIT,
  buildUserAgent,
  TransportKind
} from './config.js';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

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
          if (Array.isArray(value)) {
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
    const abort = linkAbort(this.signal, REQUEST_TIMEOUT);

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'User-Agent': this.userAgent
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: abort.signal
      });

      const text = await response.text();

      if (!response.ok) {
        const parsedErrorBody = this.safeParseJson(text);
        const rateLimitReset = response.headers?.get(RATE_LIMIT.HEADERS.RESET) ?? null;
        throw this.buildError(
          response.status,
          response.statusText,
          method,
          endpoint,
          parsedErrorBody,
          rateLimitReset
        );
      }

      const trimmed = text.trim();
      // ADS responses are not runtime-validated; T is trusted at this boundary.
      const parsed: unknown = trimmed ? JSON.parse(trimmed) : {};
      return parsed as T;
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(abortMessage(abort.cancelledByCaller()));
      }
      throw error;
    } finally {
      // Not disposed right after fetch(): the signal has to stay armed through
      // the body read, which is where a large export actually spends its time.
      abort.dispose();
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
    rateLimitReset: string | null = null
  ): SciXAPIError {
    const context = `for ${method} ${endpoint}`;
    const adsMessage = extractAdsErrorMessage(body);

    let message: string;
    if (status === 401) {
      message = `Authentication failed ${context}. The SciX API token was missing or rejected. ` +
        `Get your key from https://scixplorer.org/user/settings/token`;
    } else if (status === 404) {
      message = `Resource not found ${context}.`;
    } else if (status === 429) {
      message = `Rate limit exceeded (5000 requests/day) ${context}. Please try again later.`;
      const resetTime = formatRateLimitReset(rateLimitReset);
      if (resetTime) {
        message += ` Retry after ${resetTime}.`;
      }
    } else {
      message = `SciX API error: ${status} ${statusText} ${context}`;
    }

    if (adsMessage) {
      message += ` — ${adsMessage}`;
    }

    return new SciXAPIError(message, status, body);
  }
}
