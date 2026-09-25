import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SciXAPIClient, SciXAPIError } from '../src/client.js';
import { setupMockFetch, createTimeoutFetch, restoreFetch } from './helpers/mockFetch.js';
import { REQUEST_TIMEOUT } from '../src/config.js';

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
      // GET has no body, so no Content-Type header is sent
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

    it('should throw on 404 Not Found', async () => {
      setupMockFetch({ status: 404, statusText: 'Not Found' });

      await expect(client.get('test')).rejects.toThrow('Resource not found');
    });

    it('should throw on 429 Rate Limit', async () => {
      setupMockFetch({ status: 429, statusText: 'Too Many Requests' });

      await expect(client.get('test')).rejects.toThrow('Rate limit exceeded');
      await expect(client.get('test')).rejects.toThrow('5000 requests/day');
    });

    it('should throw on generic HTTP errors', async () => {
      setupMockFetch({ status: 500, statusText: 'Internal Server Error' });

      await expect(client.get('test')).rejects.toThrow('SciX API error: 500');
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
      expect(error.message).toContain('SciX API error: 502');
    });
  });
});
