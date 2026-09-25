import { vi } from 'vitest';

// Captured at module load, before any test can stub it: some tests assign
// global.fetch directly, so tracking the prior value at install time wouldn't
// guarantee a clean restore, and a leaked mock breaks suites doing real HTTP.
const nativeFetch: typeof globalThis.fetch = globalThis.fetch;

export interface MockFetchOptions {
  status?: number;
  statusText?: string;
  body?: any;
  headers?: Record<string, string>;
  delay?: number;
  shouldAbort?: boolean;
  emptyBody?: boolean;
}

export function createMockFetch(options: MockFetchOptions = {}) {
  const {
    status = 200,
    statusText = 'OK',
    body = {},
    headers = {},
    delay = 0,
    shouldAbort = false,
    emptyBody = false
  } = options;

  return vi.fn(async (url: string, init?: RequestInit) => {
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    if (shouldAbort || init?.signal?.aborted) {
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      throw error;
    }

    if (init?.signal) {
      init.signal.addEventListener('abort', () => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        throw error;
      });
    }

    const response = {
      ok: status >= 200 && status < 300,
      status,
      statusText,
      headers: new Map(Object.entries({
        'content-type': 'application/json',
        ...headers
      })),
      json: async () => {
        if (emptyBody) {
          throw new SyntaxError('Unexpected end of JSON input');
        }
        return body;
      },
      text: async () => (emptyBody ? '' : JSON.stringify(body)),
      blob: async () => new Blob([JSON.stringify(body)]),
      arrayBuffer: async () => new ArrayBuffer(0),
      formData: async () => new FormData(),
      clone: () => response
    };

    return response as Response;
  });
}

export function setupMockFetch(options: MockFetchOptions = {}) {
  const mockFetch = createMockFetch(options);
  global.fetch = mockFetch as any;
  return mockFetch;
}

export function createNetworkErrorFetch() {
  return vi.fn(async () => {
    throw new Error('Network error');
  });
}

export function createTimeoutFetch(timeoutMs: number = 100) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    return new Promise((_, reject) => {
      const timeout = setTimeout(() => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        reject(error);
      }, timeoutMs);

      if (init?.signal) {
        init.signal.addEventListener('abort', () => {
          clearTimeout(timeout);
          const error = new Error('The operation was aborted');
          error.name = 'AbortError';
          reject(error);
        });
      }
    });
  });
}

export function restoreFetch() {
  global.fetch = nativeFetch;
  vi.restoreAllMocks();
}

export function verifyFetchCall(
  mockFetch: any,
  expectedUrl: string,
  expectedInit?: Partial<RequestInit>
) {
  const calls = mockFetch.mock.calls;
  const matchingCall = calls.find((call: any) => {
    const [url, init] = call;
    if (!url.includes(expectedUrl)) return false;
    if (!expectedInit) return true;

    if (expectedInit.method && init?.method !== expectedInit.method) return false;
    if (expectedInit.headers) {
      const headers = init?.headers as Record<string, string>;
      for (const [key, value] of Object.entries(expectedInit.headers)) {
        if (headers[key] !== value) return false;
      }
    }
    return true;
  });

  return matchingCall !== undefined;
}
