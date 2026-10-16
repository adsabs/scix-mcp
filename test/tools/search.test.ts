import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SciXAPIClient } from '../../src/client.js';
import { setupMockFetch, restoreFetch } from '../helpers/mockFetch.js';
import { search } from '../../src/tools/search.js';
import { ResponseFormat } from '../../src/types.js';
import { MAX_ROWS } from '../../src/config.js';

describe('Search Tool', () => {
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

  describe('search', () => {
    it('should perform basic search', async () => {
      const mockResponse = {
        response: {
          numFound: 100,
          start: 0,
          docs: [
            {
              bibcode: '2024ApJ...123..456A',
              title: ['Test Paper'],
              author: ['Author, A.'],
              year: '2024',
              citation_count: 10
            }
          ]
        }
      };

      const mockFetch = setupMockFetch({ body: mockResponse });

      const result = await search(client, {
        query: 'author:"Einstein"',
        rows: 10,
        start: 0,
        response_format: ResponseFormat.MARKDOWN
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('search/query');
      expect(url).toContain('q=author%3A%22Einstein%22');
      expect(url).toContain('rows=10');
      expect(url).toContain('start=0');
      expect(result).toContain('Test Paper');
    });

    it('should handle pagination with start parameter', async () => {
      const mockResponse = {
        response: {
          numFound: 200,
          start: 100,
          docs: []
        }
      };

      const mockFetch = setupMockFetch({ body: mockResponse });

      await search(client, {
        query: 'black holes',
        rows: 100,
        start: 100,
        response_format: ResponseFormat.MARKDOWN
      });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('start=100');
      expect(url).toContain('rows=100');
    });

    it('should show "use start=" hint when more results available', async () => {
      const mockResponse = {
        response: {
          numFound: 150,
          start: 0,
          docs: [{
            bibcode: '2024ApJ...123..456A',
            title: ['Paper 1']
          }]
        }
      };

      setupMockFetch({ body: mockResponse });

      const result = await search(client, {
        query: 'test',
        rows: 10,
        start: 0,
        response_format: ResponseFormat.MARKDOWN
      });

      expect(result).toContain('start=10');
    });

    it('should calculate next start correctly for pagination', async () => {
      const mockResponse = {
        response: {
          numFound: 250,
          start: 50,
          docs: []
        }
      };

      setupMockFetch({ body: mockResponse });

      const result = await search(client, {
        query: 'test',
        rows: 25,
        start: 50,
        response_format: ResponseFormat.MARKDOWN
      });

      expect(result).toContain('start=75');
    });

    it('should not show pagination hint when no more results', async () => {
      const mockResponse = {
        response: {
          numFound: 10,
          start: 0,
          docs: []
        }
      };

      setupMockFetch({ body: mockResponse });

      const result = await search(client, {
        query: 'test',
        rows: 20,
        start: 0,
        response_format: ResponseFormat.MARKDOWN
      });

      expect(result).not.toContain('start=');
    });

    it('should respect MAX_ROWS limit', async () => {
      const mockResponse = {
        response: { numFound: 1000, docs: [] }
      };

      const mockFetch = setupMockFetch({ body: mockResponse });

      await search(client, {
        query: 'test',
        rows: MAX_ROWS,
        start: 0,
        response_format: ResponseFormat.MARKDOWN
      });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain(`rows=${MAX_ROWS}`);
    });

    it('should include sort parameter', async () => {
      const mockResponse = {
        response: { numFound: 10, docs: [] }
      };

      const mockFetch = setupMockFetch({ body: mockResponse });

      await search(client, {
        query: 'test',
        rows: 10,
        start: 0,
        sort: 'citation_count desc',
        response_format: ResponseFormat.MARKDOWN
      });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('sort=citation_count+desc');
    });

    it('should return JSON format', async () => {
      const mockResponse = {
        responseHeader: { status: 0, QTime: 5 },
        response: {
          numFound: 1,
          docs: [{ bibcode: 'test' }]
        }
      };

      setupMockFetch({ body: mockResponse });

      const result = await search(client, {
        query: 'test',
        rows: 10,
        start: 25,
        response_format: ResponseFormat.JSON
      });

      const parsed = JSON.parse(result);
      expect(parsed).toEqual({ numFound: 1, start: 25, docs: [{ bibcode: 'test' }] });
      expect(Object.keys(parsed).sort()).toEqual(['docs', 'numFound', 'start']);
      expect(parsed).not.toHaveProperty('responseHeader');
    });

    it('should return slim JSON for empty/missing response', async () => {
      setupMockFetch({ body: { responseHeader: { status: 0 } } });

      const result = await search(client, {
        query: 'nonexistent',
        rows: 10,
        start: 0,
        response_format: ResponseFormat.JSON
      });

      const parsed = JSON.parse(result);
      expect(parsed).toEqual({ numFound: 0, start: 0, docs: [] });
    });

    it('sends each filter_query as its own repeated fq parameter', async () => {
      const mockFetch = setupMockFetch({ body: { response: { numFound: 1, docs: [] } } });

      await search(client, {
        query: 'black hole',
        filter_query: ['author_facet_hier:"0/Smith, J"', 'property:"refereed"'],
        rows: 10,
        start: 0,
        response_format: ResponseFormat.MARKDOWN
      });

      const url = new URL(mockFetch.mock.calls[0][0] as string);
      expect(url.searchParams.getAll('fq')).toEqual([
        'author_facet_hier:"0/Smith, J"',
        'property:"refereed"'
      ]);
    });

    it('omits fq when filter_query is absent or empty', async () => {
      const mockFetch = setupMockFetch({ body: { response: { numFound: 1, docs: [] } } });

      await search(client, {
        query: 'star',
        rows: 10,
        start: 0,
        response_format: ResponseFormat.MARKDOWN
      });
      expect(new URL(mockFetch.mock.calls[0][0] as string).searchParams.has('fq')).toBe(false);

      await search(client, {
        query: 'star',
        filter_query: [],
        rows: 10,
        start: 0,
        response_format: ResponseFormat.MARKDOWN
      });
      expect(new URL(mockFetch.mock.calls[1][0] as string).searchParams.has('fq')).toBe(false);
    });

    it('links the equivalent SciX search, carrying the filters', async () => {
      setupMockFetch({ body: { response: { numFound: 1, docs: [] } } });

      const result = await search(client, {
        query: 'black hole',
        filter_query: ['property:"refereed"'],
        rows: 10,
        start: 0,
        response_format: ResponseFormat.MARKDOWN
      });

      const link = /\[View on SciX\]\((?<url>[^)]+)\)/.exec(result)?.groups?.url;
      expect(link).toBeDefined();
      const url = new URL(link as string);
      expect(url.origin + url.pathname).toBe('https://scixplorer.org/search');
      expect(url.searchParams.get('q')).toBe('black hole');
      expect(url.searchParams.getAll('fq')).toEqual(['property:"refereed"']);
      expect(result).not.toContain('adsabs');
    });

    it('should handle empty results', async () => {
      const mockResponse = {
        response: { numFound: 0, docs: [] }
      };

      setupMockFetch({ body: mockResponse });

      const result = await search(client, {
        query: 'nonexistent',
        rows: 10,
        start: 0,
        response_format: ResponseFormat.MARKDOWN
      });

      expect(result).toBeDefined();
    });
  });
});
