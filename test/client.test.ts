import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SciXAPIClient, SciXAPIError, repeated } from '../src/client.js';
import {
  setupMockFetch,
  createTimeoutFetch,
  createNetworkErrorFetch,
  restoreFetch
} from './helpers/mockFetch.js';
import {
  REQUEST_TIMEOUT,
  CLIENT_SOURCE,
  CLIENT_SOURCE_HEADER,
  SCIX_API_BASE
} from '../src/config.js';

describe('SciXAPIClient', () => {
  let client: SciXAPIClient;
  const originalEnv = process.env.SCIX_API_TOKEN;

  beforeEach(() => {
    process.env.SCIX_API_TOKEN = 'test-api-key';
    client = new SciXAPIClient();
  });

  afterEach(() => {
    restoreFetch();
    process.env.SCIX_API_TOKEN = originalEnv;
  });

  describe('GET requests', () => {
    it('should make successful GET request', async () => {
      const mockData = { results: ['data'] };
      const mockFetch = setupMockFetch({ body: mockData });

      const result = await client.get('test/endpoint');

      expect(result).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain('test/endpoint');
      expect(init.method).toBe('GET');
      expect(init.headers['Authorization']).toBe('Bearer test-api-key');
      expect(init.headers['Content-Type']).toBeUndefined();
    });

    it('should encode query parameters correctly', async () => {
      const mockFetch = setupMockFetch({ body: {} });

      await client.get('search', {
        q: 'author:"Einstein"',
        rows: 10,
        start: 0
      });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('q=author%3A%22Einstein%22');
      expect(url).toContain('rows=10');
      expect(url).toContain('start=0');
    });

    it('should handle array parameters', async () => {
      const mockFetch = setupMockFetch({ body: {} });

      await client.get('test', {
        fields: ['title', 'author', 'year']
      });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('fields=title%2Cauthor%2Cyear');
    });

    it('repeats a RepeatedParam once per value instead of comma-joining', async () => {
      const mockFetch = setupMockFetch({ body: {} });

      await client.get('search/query', {
        q: 'star',
        fq: repeated(['property:"refereed"', 'database:"astronomy"'])
      });

      const url = new URL(mockFetch.mock.calls[0][0] as string);
      expect(url.searchParams.getAll('fq')).toEqual([
        'property:"refereed"',
        'database:"astronomy"'
      ]);
    });

    it('emits nothing for an empty RepeatedParam', async () => {
      const mockFetch = setupMockFetch({ body: {} });

      await client.get('search/query', { q: 'star', fq: repeated([]) });

      const url = new URL(mockFetch.mock.calls[0][0] as string);
      expect(url.searchParams.has('fq')).toBe(false);
    });

    it('should skip null and undefined parameters', async () => {
      const mockFetch = setupMockFetch({ body: {} });

      await client.get('test', {
        defined: 'value',
        nullValue: null,
        undefinedValue: undefined
      });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('defined=value');
      expect(url).not.toContain('null');
      expect(url).not.toContain('undefined');
    });

    it('should throw on 401 Unauthorized', async () => {
      setupMockFetch({ status: 401, statusText: 'Unauthorized' });

      await expect(client.get('test')).rejects.toThrow('Authentication failed');
      await expect(client.get('test')).rejects.toThrow('token was missing or rejected');
    });

    it('should throw on 403 Forbidden', async () => {
      setupMockFetch({ status: 403, statusText: 'Forbidden' });

      const error = await client.get('test').catch((e) => e);

      expect(error).toBeInstanceOf(SciXAPIError);
      expect(error.status).toBe(403);
      expect(error.message).toContain('Permission denied');
      expect(error.message).toMatch(/re-authenticating will not help/i);
      expect(error.message).toContain('GET test');
    });

    it('should not reuse the 401 wording for a 403', async () => {
      setupMockFetch({ status: 403, statusText: 'Forbidden' });

      const forbidden = await client.get('test').catch((e) => e);

      expect(forbidden.message).not.toContain('Authentication failed');
      expect(forbidden.message).not.toContain('token was missing or rejected');
      expect(forbidden.message).not.toContain('SciX API error: 403');
    });

    it('does not claim to know the token is valid on a 403', async () => {
      setupMockFetch({ status: 403, statusText: 'Forbidden' });

      const forbidden = await client.get('test').catch((e) => e);

      expect(forbidden.message).not.toMatch(/token is valid/i);
      expect(forbidden.message).toMatch(/blocked upstream|lacks access/i);
    });

    it('should throw on 404 Not Found', async () => {
      setupMockFetch({ status: 404, statusText: 'Not Found' });

      await expect(client.get('test')).rejects.toThrow('Resource not found');
    });

    it('should throw on 429 Rate Limit', async () => {
      setupMockFetch({ status: 429, statusText: 'Too Many Requests' });

      await expect(client.get('test')).rejects.toThrow('Rate limit exceeded');
    });

    it('should throw on generic HTTP errors', async () => {
      setupMockFetch({ status: 500, statusText: 'Internal Server Error' });

      await expect(client.get('test')).rejects.toThrow('500');
    });

    it('should handle request timeout', async () => {
      global.fetch = createTimeoutFetch(100) as any;

      await expect(client.get('test')).rejects.toThrow('Request timeout after 30 seconds');
    });

    it('should handle abort signal', async () => {
      const mockFetch = setupMockFetch({ shouldAbort: true });
      global.fetch = mockFetch as any;

      await expect(client.get('test')).rejects.toThrow('Request timeout after 30 seconds');
    });
  });

  describe('POST requests', () => {
    it('should make successful POST request', async () => {
      const mockData = { success: true };
      const mockFetch = setupMockFetch({ body: mockData });

      const payload = { name: 'test', value: 123 };
      const result = await client.post('test/endpoint', payload);

      expect(result).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain('test/endpoint');
      expect(init.method).toBe('POST');
      expect(init.headers['Authorization']).toBe('Bearer test-api-key');
      expect(init.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(init.body)).toEqual(payload);
    });

    it('should stringify JSON body correctly', async () => {
      const mockFetch = setupMockFetch({ body: {} });

      const complexPayload = {
        string: 'value',
        number: 42,
        boolean: true,
        array: [1, 2, 3],
        nested: { key: 'value' }
      };

      await client.post('test', complexPayload);

      const [, init] = mockFetch.mock.calls[0];
      const parsedBody = JSON.parse(init.body);
      expect(parsedBody).toEqual(complexPayload);
    });

    it('should throw on 401 Unauthorized', async () => {
      setupMockFetch({ status: 401 });

      await expect(client.post('test', {})).rejects.toThrow('Authentication failed');
    });

    it('should throw on 403 Forbidden', async () => {
      setupMockFetch({ status: 403, statusText: 'Forbidden' });

      const error = await client.post('test', {}).catch((e) => e);

      expect(error.message).toContain('Permission denied');
      expect(error.message).toContain('POST test');
      expect(error.message).not.toContain('Authentication failed');
    });

    it('should throw on 404 Not Found', async () => {
      setupMockFetch({ status: 404 });

      await expect(client.post('test', {})).rejects.toThrow('Resource not found');
    });

    it('should throw on 429 Rate Limit', async () => {
      setupMockFetch({ status: 429 });

      await expect(client.post('test', {})).rejects.toThrow('Rate limit exceeded');
    });

    it('should handle request timeout', async () => {
      global.fetch = createTimeoutFetch(100) as any;

      await expect(client.post('test', {})).rejects.toThrow('Request timeout');
    });
  });

  describe('PUT requests', () => {
    it('should make successful PUT request', async () => {
      const mockData = { updated: true };
      const mockFetch = setupMockFetch({ body: mockData });

      const payload = { field: 'updated value' };
      const result = await client.put('test/endpoint', payload);

      expect(result).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain('test/endpoint');
      expect(init.method).toBe('PUT');
      expect(init.headers['Authorization']).toBe('Bearer test-api-key');
      expect(JSON.parse(init.body)).toEqual(payload);
    });

    it('should throw on 401 Unauthorized', async () => {
      setupMockFetch({ status: 401 });

      await expect(client.put('test', {})).rejects.toThrow('Authentication failed');
    });

    it('should throw on 403 Forbidden', async () => {
      setupMockFetch({ status: 403, statusText: 'Forbidden' });

      const error = await client.put('test', {}).catch((e) => e);

      expect(error.message).toContain('Permission denied');
      expect(error.message).toContain('PUT test');
      expect(error.message).not.toContain('Authentication failed');
    });

    it('should throw on 404 Not Found', async () => {
      setupMockFetch({ status: 404 });

      await expect(client.put('test', {})).rejects.toThrow('Resource not found');
    });

    it('should handle request timeout', async () => {
      global.fetch = createTimeoutFetch(100) as any;

      await expect(client.put('test', {})).rejects.toThrow('Request timeout');
    });
  });

  describe('DELETE requests', () => {
    it('should make successful DELETE request', async () => {
      const mockData = { deleted: true };
      const mockFetch = setupMockFetch({ body: mockData });

      const result = await client.delete('test/endpoint');

      expect(result).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain('test/endpoint');
      expect(init.method).toBe('DELETE');
      expect(init.headers['Authorization']).toBe('Bearer test-api-key');
    });

    it('should throw on 401 Unauthorized', async () => {
      setupMockFetch({ status: 401 });

      await expect(client.delete('test')).rejects.toThrow('Authentication failed');
    });

    it('should throw on 403 Forbidden', async () => {
      setupMockFetch({ status: 403, statusText: 'Forbidden' });

      const error = await client.delete('test').catch((e) => e);

      expect(error.message).toContain('Permission denied');
      expect(error.message).toContain('DELETE test');
      expect(error.message).not.toContain('Authentication failed');
    });

    it('should throw on 404 Not Found', async () => {
      setupMockFetch({ status: 404 });

      await expect(client.delete('test')).rejects.toThrow('Resource not found');
    });

    it('should handle request timeout', async () => {
      global.fetch = createTimeoutFetch(100) as any;

      await expect(client.delete('test')).rejects.toThrow('Request timeout');
    });
  });

  describe('Authentication', () => {
    it('should use API key from environment', () => {
      const client = new SciXAPIClient();
      expect(client).toBeDefined();
    });

    it('should include Bearer token in all requests', async () => {
      const mockFetch = setupMockFetch({ body: {} });

      await client.get('test');
      const [, getInit] = mockFetch.mock.calls[0];
      expect(getInit.headers['Authorization']).toBe('Bearer test-api-key');

      await client.post('test', {});
      const [, postInit] = mockFetch.mock.calls[1];
      expect(postInit.headers['Authorization']).toBe('Bearer test-api-key');

      await client.put('test', {});
      const [, putInit] = mockFetch.mock.calls[2];
      expect(putInit.headers['Authorization']).toBe('Bearer test-api-key');

      await client.delete('test');
      const [, deleteInit] = mockFetch.mock.calls[3];
      expect(deleteInit.headers['Authorization']).toBe('Bearer test-api-key');
    });
  });

  describe('client source header', () => {
    it('tags every request method so SciX access logs can attribute MCP traffic', async () => {
      const mockFetch = setupMockFetch({ body: {} });

      await client.get('test');
      await client.post('test', {});
      await client.put('test', {});
      await client.delete('test');

      expect(mockFetch.mock.calls).toHaveLength(4);
      for (const [, init] of mockFetch.mock.calls) {
        expect(init.headers[CLIENT_SOURCE_HEADER]).toBe('scix-mcp');
      }
    });

    it('keeps the tag stable while User-Agent carries version and transport', async () => {
      const mockFetch = setupMockFetch({ body: {} });

      await new SciXAPIClient({ transport: 'http' }).get('test');

      const [, init] = mockFetch.mock.calls[0];
      expect(init.headers[CLIENT_SOURCE_HEADER]).toBe(CLIENT_SOURCE);
      expect(init.headers[CLIENT_SOURCE_HEADER]).not.toContain('transport');
      expect(init.headers['User-Agent']).toContain('transport=http');
    });
  });

  describe('caller cancellation', () => {
    it('aborts the upstream request when the caller signal fires', async () => {
      const controller = new AbortController();
      const cancellable = new SciXAPIClient({ signal: controller.signal });
      const mockFetch = setupMockFetch({ body: {}, delay: 5000 });

      const pending = cancellable.get('test');
      controller.abort();

      await expect(pending).rejects.toThrow('Request cancelled');
      const [, init] = mockFetch.mock.calls[0];
      expect(init.signal.aborted).toBe(true);
    });

    it('rejects immediately when the signal is already aborted', async () => {
      const mockFetch = setupMockFetch({ body: {} });
      const cancellable = new SciXAPIClient({ signal: AbortSignal.abort() });

      await expect(cancellable.get('test')).rejects.toThrow('Request cancelled');
      const [, init] = mockFetch.mock.calls[0];
      expect(init.signal.aborted).toBe(true);
    });

    it('still reports a timeout when no caller signal is involved', async () => {
      global.fetch = createTimeoutFetch(50) as any;

      await expect(client.get('test')).rejects.toThrow('Request timeout after 30 seconds');
    });
  });

  describe('Content-Type headers', () => {
    it('should set application/json only for requests with a body', async () => {
      const mockFetch = setupMockFetch({ body: {} });

      await client.get('test');
      await client.post('test', {});
      await client.put('test', {});
      await client.delete('test');

      const [, getInit] = mockFetch.mock.calls[0];
      const [, postInit] = mockFetch.mock.calls[1];
      const [, putInit] = mockFetch.mock.calls[2];
      const [, deleteInit] = mockFetch.mock.calls[3];

      expect(getInit.headers['Content-Type']).toBeUndefined();
      expect(postInit.headers['Content-Type']).toBe('application/json');
      expect(putInit.headers['Content-Type']).toBe('application/json');
      expect(deleteInit.headers['Content-Type']).toBeUndefined();
    });
  });

  describe('timeout message', () => {
    it('should derive the timeout message from REQUEST_TIMEOUT', async () => {
      global.fetch = createTimeoutFetch(50) as any;

      const error = await client.get('test').catch((e) => e);

      expect(error.message).toContain(`after ${REQUEST_TIMEOUT / 1000} seconds`);
    });
  });

  describe('network failures', () => {
    it('wraps a transport rejection with method, endpoint, and base URL', async () => {
      global.fetch = createNetworkErrorFetch() as unknown as typeof fetch;

      const error = await client.get('test/endpoint').catch((e) => e);

      expect(error.message).toMatch(/request failed/i);
      expect(error.message).toContain('GET');
      expect(error.message).toContain('test/endpoint');
      expect(error.message).toContain(SCIX_API_BASE);
      expect(error.message).toContain('Network error');
      expect(error.message).not.toBe('Network error');
    });

    it('does not claim the API was never reached', async () => {
      global.fetch = createNetworkErrorFetch() as unknown as typeof fetch;

      const error = await client.get('test/endpoint').catch((e) => e);

      expect(error.message).not.toMatch(/could not reach/i);
      expect(error.message).not.toMatch(/unreachable/i);
    });

    it('releases the request timer when the body cannot be serialized', async () => {
      vi.useFakeTimers();
      try {
        setupMockFetch({ body: {} });
        const circular: Record<string, unknown> = {};
        circular.self = circular;

        await expect(client.post('test', circular)).rejects.toThrow();
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it('wraps the rejection on every verb', async () => {
      global.fetch = createNetworkErrorFetch() as unknown as typeof fetch;

      const get = await client.get('a/one').catch((e) => e);
      const post = await client.post('b/two', {}).catch((e) => e);
      const put = await client.put('c/three', {}).catch((e) => e);
      const del = await client.delete('d/four').catch((e) => e);

      expect(get.message).toContain('GET a/one');
      expect(post.message).toContain('POST b/two');
      expect(put.message).toContain('PUT c/three');
      expect(del.message).toContain('DELETE d/four');
    });

    it('preserves the original transport error as the cause', async () => {
      const underlying = new TypeError('fetch failed');
      global.fetch = vi.fn(async () => {
        throw underlying;
      }) as unknown as typeof fetch;

      const error = await client.get('test/endpoint').catch((e) => e);

      expect(error.cause).toBe(underlying);
      expect(error.message).toContain('fetch failed');
      expect(error.message).toContain(SCIX_API_BASE);
    });

    it('leaves an HTTP error status unwrapped', async () => {
      setupMockFetch({ status: 500, statusText: 'Internal Server Error' });

      const error = await client.get('test').catch((e) => e);

      expect(error).toBeInstanceOf(SciXAPIError);
      expect(error.status).toBe(500);
      expect(error.message).not.toContain('Network error');
      expect(error.cause).toBeUndefined();
    });

    it('does not blame the network for a malformed body on a 200', async () => {
      const mockFetch = setupMockFetch({ body: {} });
      mockFetch.mockImplementation(async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        text: async () => '<html><body>upstream misconfigured</body></html>'
      } as any));

      const error = await client.get('test').catch((e) => e);

      expect(error).toBeInstanceOf(Error);
      expect(error.message).not.toMatch(/could not reach/i);
      expect(error.message).not.toMatch(/request failed/i);
      expect(error.message).toMatch(/malformed/i);
      expect(error.message).toContain('GET test');
      expect(error.cause).toBeInstanceOf(SyntaxError);
    });

    it('still reports a transport failure during the body read', async () => {
      const mockFetch = setupMockFetch({ body: {} });
      mockFetch.mockImplementation(async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        text: async () => {
          throw new TypeError('terminated');
        }
      } as any));

      const error = await client.get('test').catch((e) => e);

      expect(error.message).toMatch(/request failed/i);
      expect(error.message).toContain('terminated');
      expect(error.message).toContain(SCIX_API_BASE);
      expect(error.message).not.toMatch(/malformed/i);
    });

    it('still reports a timeout rather than a transport failure', async () => {
      global.fetch = createTimeoutFetch(50) as any;

      const error = await client.get('test').catch((e) => e);

      expect(error.message).toContain('Request timeout after 30 seconds');
      expect(error.message).not.toContain(SCIX_API_BASE);
    });
  });

  describe('rate limit headers', () => {
    it('reports the limit and remaining count from the response headers', async () => {
      setupMockFetch({
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'X-RateLimit-Limit': '100', 'X-RateLimit-Remaining': '0' }
      });

      const error = await client.get('test').catch((e) => e);

      expect(error.message).toContain('Rate limit exceeded');
      expect(error.message).toContain('GET test');
      expect(error.message).toMatch(/\b100\b/);
      expect(error.message).toMatch(/\b0 remaining\b/);
      expect(error.message).not.toContain('5000');
    });

    it('reads the counts from the headers rather than a hardcoded pair', async () => {
      setupMockFetch({
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'X-RateLimit-Limit': '37', 'X-RateLimit-Remaining': '4' }
      });

      const error = await client.get('test').catch((e) => e);

      expect(error.message).toMatch(/\b37\b/);
      expect(error.message).toMatch(/\b4 remaining\b/);
      expect(error.message).not.toContain('100');
    });

    it('asserts no cap at all when neither header is present', async () => {
      setupMockFetch({ status: 429, statusText: 'Too Many Requests' });

      const error = await client.get('test').catch((e) => e);

      expect(error.message).toContain('Rate limit exceeded');
      expect(error.message).toContain('Limits vary by endpoint');
      expect(error.message).not.toContain('5000');
      expect(error.message).not.toMatch(/requests?\s*\/?\s*(per\s*)?day/i);
      expect(error.message).not.toMatch(/remaining/);
      expect(error.message).not.toMatch(/\d/);
    });

    it('does not claim the headers were absent when they were merely unusable', async () => {
      setupMockFetch({
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'X-RateLimit-Limit': '-1', 'X-RateLimit-Remaining': 'unknown' }
      });

      const error = await client.get('test').catch((e) => e);

      expect(error.message).toContain('Limits vary by endpoint');
      expect(error.message).not.toMatch(/carried no rate limit headers/i);
      expect(error.message).not.toMatch(/\d/);
    });

    it('reports only the limit when the remaining header is absent', async () => {
      setupMockFetch({
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'X-RateLimit-Limit': '100' }
      });

      const error = await client.get('test').catch((e) => e);

      expect(error.message).toMatch(/\b100\b/);
      expect(error.message).not.toMatch(/remaining/);
    });

    it('reports only the remaining count when the limit header is absent', async () => {
      setupMockFetch({
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'X-RateLimit-Remaining': '4' }
      });

      const error = await client.get('test').catch((e) => e);

      expect(error.message).toMatch(/\b4 remaining\b/);
      expect(error.message).not.toContain('100');
    });

    it('treats a blank header as absent rather than as zero', async () => {
      setupMockFetch({
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'X-RateLimit-Limit': '   ', 'X-RateLimit-Remaining': '' }
      });

      const error = await client.get('test').catch((e) => e);

      expect(error.message).toContain('Rate limit exceeded');
      expect(error.message).not.toMatch(/remaining/);
      expect(error.message).not.toMatch(/\d/);
    });

    it('ignores a negative count instead of claiming it', async () => {
      setupMockFetch({
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'X-RateLimit-Limit': '-1', 'X-RateLimit-Remaining': '-1' }
      });

      const error = await client.get('test').catch((e) => e);

      expect(error.message).not.toContain('-1');
      expect(error.message).not.toMatch(/\d/);
    });

    it('ignores a fractional count instead of claiming it', async () => {
      setupMockFetch({
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'X-RateLimit-Limit': '100.5' }
      });

      const error = await client.get('test').catch((e) => e);

      expect(error.message).not.toContain('100.5');
      expect(error.message).not.toMatch(/\d/);
    });

    it('ignores a duplicated comma-joined header value', async () => {
      setupMockFetch({
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'X-RateLimit-Limit': '100, 100' }
      });

      const error = await client.get('test').catch((e) => e);

      expect(error.message).not.toContain('100');
      expect(error.message).not.toMatch(/\d/);
    });

    it('combines the header counts with the reset time', async () => {
      setupMockFetch({
        status: 429,
        statusText: 'Too Many Requests',
        headers: {
          'X-RateLimit-Limit': '100',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': '1735689600'
        }
      });

      const error = await client.get('test').catch((e) => e);

      expect(error.message).toMatch(/\b100\b/);
      expect(error.message).toMatch(/\b0 remaining\b/);
      expect(error.message).toContain('2025-01-01T00:00:00.000Z');
    });
  });

  describe('rate limit reset', () => {
    it('should include the reset time from X-RateLimit-Reset on a 429', async () => {
      // 1735689600 = 2025-01-01T00:00:00.000Z (unix seconds)
      setupMockFetch({
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'X-RateLimit-Reset': '1735689600' }
      });

      const error = await client.get('search/query').catch((e) => e);

      expect(error.message).toContain('Rate limit exceeded');
      expect(error.message).toContain('2025-01-01T00:00:00.000Z');
    });

    it('should omit reset time and not crash when the header is absent', async () => {
      setupMockFetch({ status: 429, statusText: 'Too Many Requests' });

      const error = await client.get('search/query').catch((e) => e);

      expect(error.message).toContain('Rate limit exceeded');
      expect(error.message).not.toContain('Invalid Date');
    });
  });

  describe('empty response bodies', () => {
    it('should return {} for an empty 204 body on every verb', async () => {
      setupMockFetch({ status: 204, statusText: 'No Content', emptyBody: true });

      await expect(client.get('test')).resolves.toEqual({});
      await expect(client.post('test', {})).resolves.toEqual({});
      await expect(client.put('test', {})).resolves.toEqual({});
      await expect(client.delete('test')).resolves.toEqual({});
    });

    it('should return {} for a whitespace-only success body instead of throwing', async () => {
      const mockFetch = setupMockFetch({ status: 200, statusText: 'OK' });
      mockFetch.mockImplementation(async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        text: async () => '   \n  ',
        json: async () => ({})
      } as any));

      await expect(client.get('test')).resolves.toEqual({});
    });
  });

  describe('error messages', () => {
    it('should include method and endpoint context in the error message', async () => {
      setupMockFetch({ status: 500, statusText: 'Internal Server Error' });

      const error = await client.get('biblib/libraries/lib1').catch((e) => e);

      expect(error.message).toContain('GET');
      expect(error.message).toContain('biblib/libraries/lib1');
    });

    it('should not include the misleading bibcode hint on a 404', async () => {
      setupMockFetch({ status: 404, statusText: 'Not Found' });

      const error = await client.get('biblib/libraries/missing').catch((e) => e);

      expect(error.message).toContain('Resource not found');
      expect(error.message).not.toContain('bibcode');
      expect(error.message).not.toMatch(/search query/i);
    });

    it('should keep the token-setup hint on a 401', async () => {
      setupMockFetch({ status: 401, statusText: 'Unauthorized' });

      const error = await client.post('biblib/libraries', {}).catch((e) => e);

      expect(error.message).toContain('Authentication failed');
      expect(error.message).toContain('token was missing or rejected');
      expect(error.message).toContain('scixplorer.org/user/settings/token');
    });
  });

  describe('server errors', () => {
    it('tells the caller a 500 is transient and worth retrying', async () => {
      setupMockFetch({ status: 500, statusText: 'Internal Server Error' });

      const error = await client.get('test').catch((e) => e);

      expect(error).toBeInstanceOf(SciXAPIError);
      expect(error.status).toBe(500);
      expect(error.message).toMatch(/temporarily unavailable/i);
      expect(error.message).toMatch(/retry/i);
      expect(error.message).toContain('500');
      expect(error.message).toContain('GET test');
    });

    it('applies the retry hint across the 5xx range', async () => {
      for (const status of [502, 503, 504]) {
        setupMockFetch({ status, statusText: 'Upstream Problem' });

        const error = await client.get('test').catch((e) => e);

        expect(error.message).toMatch(/temporarily unavailable/i);
        expect(error.message).toMatch(/retry/i);
        expect(error.message).toContain(String(status));
      }
    });

    it('offers an unqualified retry for a read', async () => {
      setupMockFetch({ status: 503, statusText: 'Service Unavailable' });

      const error = await client.get('test').catch((e) => e);

      expect(error.message).toMatch(/retrying may help/i);
      expect(error.message).not.toMatch(/modifies data/i);
    });

    it('qualifies the retry on a non-GET without asserting the request was applied', async () => {
      const nonReads: Array<[string, () => Promise<unknown>]> = [
        ['POST', () => client.post('biblib/libraries', { name: 'x' })],
        ['PUT', () => client.put('biblib/documents/lib1', {})],
        ['DELETE', () => client.delete('biblib/documents/lib1')]
      ];

      for (const [verb, call] of nonReads) {
        setupMockFetch({ status: 503, statusText: 'Service Unavailable' });

        const error = await call().catch((e) => e);

        expect(error.message).toMatch(/temporarily unavailable/i);
        expect(error.message).toMatch(/retrying may help/i);
        expect(error.message).toMatch(/if this request modifies data/i);
        expect(error.message).toContain(verb);
      }
    });

    it('does not tell a POST-based read that its request may have been applied', async () => {
      setupMockFetch({ status: 503, statusText: 'Service Unavailable' });

      const error = await client.post('metrics', { bibcodes: ['x'] }).catch((e) => e);

      expect(error.message).not.toMatch(/may already have been applied/i);
      expect(error.message).not.toMatch(/was applied; check/i);
      expect(error.message).toMatch(/retrying may help/i);
    });

    it('does not offer the retry hint for a 4xx the caller must fix', async () => {
      setupMockFetch({ status: 400, statusText: 'Bad Request' });

      const error = await client.get('test').catch((e) => e);

      expect(error.status).toBe(400);
      expect(error.message).toContain('SciX API error: 400');
      expect(error.message).not.toMatch(/temporarily unavailable/i);
      expect(error.message).not.toMatch(/retry/i);
    });
  });

  describe('token safety', () => {
    const SENTINEL = 'zzz-secret-token-zzz';

    it('keeps the token out of every error message the client can throw', async () => {
      const scoped = new SciXAPIClient({ token: SENTINEL });
      const statuses = [400, 401, 403, 404, 429, 500, 502];

      for (const status of statuses) {
        setupMockFetch({ status, statusText: 'Failure', body: { error: 'upstream said no' } });

        const error = await scoped.get('biblib/libraries/lib1').catch((e) => e);

        expect(error.message).not.toContain(SENTINEL);
      }

      global.fetch = createNetworkErrorFetch() as unknown as typeof fetch;
      const network = await scoped.get('biblib/libraries/lib1').catch((e) => e);
      expect(network.message).not.toContain(SENTINEL);

      global.fetch = createTimeoutFetch(50) as any;
      const timeout = await scoped.get('biblib/libraries/lib1').catch((e) => e);
      expect(timeout.message).not.toContain(SENTINEL);
    });

    it('keeps the token out of anything the client logs', async () => {
      const spies = (['log', 'error', 'warn', 'info', 'debug'] as const).map((level) =>
        vi.spyOn(console, level).mockImplementation(() => undefined)
      );

      try {
        const scoped = new SciXAPIClient({ token: SENTINEL });

        for (const status of [401, 403, 429, 500]) {
          setupMockFetch({ status, statusText: 'Failure' });
          await scoped.get('biblib/libraries/lib1').catch(() => undefined);
        }

        global.fetch = createNetworkErrorFetch() as unknown as typeof fetch;
        await scoped.get('biblib/libraries/lib1').catch(() => undefined);

        setupMockFetch({ body: { ok: true } });
        await scoped.post('biblib/libraries', { name: 'x' });

        for (const spy of spies) {
          for (const call of spy.mock.calls) {
            expect(JSON.stringify(call)).not.toContain(SENTINEL);
          }
        }
      } finally {
        for (const spy of spies) {
          spy.mockRestore();
        }
      }
    });

    it('sends the token only in the Authorization header', async () => {
      const mockFetch = setupMockFetch({ body: {} });

      await new SciXAPIClient({ token: SENTINEL }).post('biblib/libraries', { name: 'x' });

      const [url, init] = mockFetch.mock.calls[0];
      expect(String(url)).not.toContain(SENTINEL);
      expect(String(init.body)).not.toContain(SENTINEL);
      expect(init.headers['Authorization']).toBe(`Bearer ${SENTINEL}`);

      const headerValues = Object.entries(init.headers as Record<string, string>)
        .filter(([name]) => name !== 'Authorization')
        .map(([, value]) => value);
      expect(headerValues.some((value) => value.includes(SENTINEL))).toBe(false);
    });
  });

  describe('SciXAPIError', () => {
    it('should throw a typed error carrying status and the ADS error-body message', async () => {
      setupMockFetch({
        status: 400,
        statusText: 'Bad Request',
        body: { error: 'Malformed query near "foo"' }
      });

      const error = await client.get('search/query').catch((e) => e);

      expect(error).toBeInstanceOf(SciXAPIError);
      expect(error.status).toBe(400);
      expect(error.message).toContain('Malformed query near "foo"');
    });

    it('should preserve the raw error-body text on SciXAPIError.body when not JSON', async () => {
      const mockFetch = setupMockFetch({ status: 500, statusText: 'Internal Server Error' });
      const raw = '<html><body>500 upstream failure</body></html>';
      mockFetch.mockImplementation(async () => ({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Map([['content-type', 'text/html']]),
        text: async () => raw,
        json: async () => {
          throw new Error('not json');
        }
      } as any));

      const error = await client.get('test').catch((e) => e);

      expect(error).toBeInstanceOf(SciXAPIError);
      expect(error.body).toBe(raw);
    });

    it('should still throw a typed error when the error body is not JSON', async () => {
      const mockFetch = setupMockFetch({ status: 502, statusText: 'Bad Gateway' });
      mockFetch.mockImplementation(async () => ({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        headers: new Map([['content-type', 'text/html']]),
        text: async () => '<html><body>502 Bad Gateway</body></html>',
        json: async () => {
          throw new Error('not json');
        }
      } as any));

      const error = await client.get('test').catch((e) => e);

      expect(error).toBeInstanceOf(SciXAPIError);
      expect(error.status).toBe(502);
      expect(error.message).toContain('502');
    });
  });
});
