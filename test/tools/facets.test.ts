import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SciXAPIClient } from '../../src/client.js';
import { setupMockFetch, restoreFetch } from '../helpers/mockFetch.js';
import { getFacets } from '../../src/tools/facets.js';
import { GetFacetsInputSchema, ResponseFormat } from '../../src/types.js';

const AUTHOR_RESPONSE = {
  response: { numFound: 4821, docs: [] },
  facets: {
    count: 4821,
    author_facet_hier: {
      numBuckets: 3200,
      buckets: [
        { val: '0/Smith, J', count: 120 },
        { val: '0/Chen, L', count: 88 }
      ]
    }
  }
};

function parse(input: unknown) {
  return GetFacetsInputSchema.parse(input);
}

describe('get_facets tool', () => {
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

  it('asks Solr for facet counts only, not documents', async () => {
    const mockFetch = setupMockFetch({ body: AUTHOR_RESPONSE });

    await getFacets(client, parse({ query: 'black hole', facets: ['author'] }));

    const url = new URL(mockFetch.mock.calls[0][0] as string);
    expect(url.pathname).toContain('search/query');
    expect(url.searchParams.get('q')).toBe('black hole');
    expect(url.searchParams.get('rows')).toBe('0');
    expect(url.searchParams.get('fl')).toBe('id');

    const jsonFacet = JSON.parse(url.searchParams.get('json.facet') as string);
    expect(jsonFacet.author_facet_hier).toMatchObject({
      type: 'terms',
      field: 'author_facet_hier',
      prefix: '0/',
      mincount: 1,
      numBuckets: true
    });
  });

  it('sends each filter_query as its own repeated fq parameter', async () => {
    const mockFetch = setupMockFetch({ body: AUTHOR_RESPONSE });

    await getFacets(client, parse({
      query: 'black hole',
      facets: ['author'],
      filter_query: ['property:"refereed"', 'database:"astronomy"']
    }));

    const url = new URL(mockFetch.mock.calls[0][0] as string);
    expect(url.searchParams.getAll('fq')).toEqual([
      'property:"refereed"',
      'database:"astronomy"'
    ]);
  });

  it('omits fq when no filters are given', async () => {
    const mockFetch = setupMockFetch({ body: AUTHOR_RESPONSE });

    await getFacets(client, parse({ query: 'star', facets: ['keywords'] }));

    const url = new URL(mockFetch.mock.calls[0][0] as string);
    expect(url.searchParams.has('fq')).toBe(false);
  });

  it('passes limit and sort through to the facet body', async () => {
    const mockFetch = setupMockFetch({ body: AUTHOR_RESPONSE });

    await getFacets(client, parse({
      query: 'star',
      facets: ['year'],
      limit: 50,
      sort: 'index desc'
    }));

    const url = new URL(mockFetch.mock.calls[0][0] as string);
    const jsonFacet = JSON.parse(url.searchParams.get('json.facet') as string);
    expect(jsonFacet.year.limit).toBe(50);
    expect(jsonFacet.year.sort).toBe('index desc');
  });

  it('requests several facets in one round trip', async () => {
    const mockFetch = setupMockFetch({ body: AUTHOR_RESPONSE });

    await getFacets(client, parse({
      query: 'star',
      facets: ['author', 'year', 'refereed']
    }));

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const url = new URL(mockFetch.mock.calls[0][0] as string);
    const jsonFacet = JSON.parse(url.searchParams.get('json.facet') as string);
    expect(Object.keys(jsonFacet).sort()).toEqual([
      'author_facet_hier',
      'property',
      'year'
    ]);
  });

  it('renders markdown with counts, usable filters, and a SciX link', async () => {
    setupMockFetch({ body: AUTHOR_RESPONSE });

    const result = await getFacets(client, parse({
      query: 'black hole',
      facets: ['author']
    }));

    expect(result).toContain('# Facets for `black hole`');
    expect(result).toContain('## Author (showing 2 of 3200)');
    expect(result).toContain('Field: `author_facet_hier`');
    expect(result).toContain('**Smith, J** — 120');
    expect(result).toContain('filter_query: `author_facet_hier:"0/Smith, J"`');
    expect(result).toContain('expandable: prefix `1/Smith, J/`');
    expect(result).toContain('https://scixplorer.org/search?q=black+hole');
    expect(result).not.toContain('adsabs');
  });

  it('reports the applied filters in markdown', async () => {
    setupMockFetch({ body: AUTHOR_RESPONSE });

    const result = await getFacets(client, parse({
      query: 'black hole',
      facets: ['author'],
      filter_query: ['property:"refereed"']
    }));

    expect(result).toContain('Filtered by: `property:"refereed"`');
    expect(result).toContain('fq=property');
  });

  it('shows a plain count when every bucket is returned', async () => {
    setupMockFetch({
      body: {
        facets: {
          property: { numBuckets: 2, buckets: [
            { val: 'refereed', count: 90 },
            { val: 'notrefereed', count: 10 }
          ] }
        }
      }
    });

    const result = await getFacets(client, parse({ query: 'star', facets: ['refereed'] }));

    expect(result).toContain('## Refereed (2)');
    expect(result).toContain('**refereed** — 90');
  });

  it('says so when a facet has no values', async () => {
    setupMockFetch({ body: { facets: { vizier_facet: { numBuckets: 0, buckets: [] } } } });

    const result = await getFacets(client, parse({ query: 'star', facets: ['vizier'] }));

    expect(result).toContain('## Vizier Tables (0)');
    expect(result).toContain('No values for this facet.');
  });

  it('returns structured JSON when asked', async () => {
    setupMockFetch({ body: AUTHOR_RESPONSE });

    const result = await getFacets(client, parse({
      query: 'black hole',
      facets: ['author'],
      response_format: ResponseFormat.JSON
    }));

    const parsed = JSON.parse(result);
    expect(parsed.query).toBe('black hole');
    expect(parsed.facets).toHaveLength(1);
    expect(parsed.facets[0]).toMatchObject({
      id: 'author',
      field: 'author_facet_hier',
      total_buckets: 3200
    });
    expect(parsed.facets[0].buckets[0]).toEqual({
      value: '0/Smith, J',
      label: 'Smith, J',
      count: 120,
      filter: 'author_facet_hier:"0/Smith, J"',
      expandable: true,
      child_prefix: '1/Smith, J/'
    });
  });

  it('drills into a hierarchy with an explicit prefix', async () => {
    const mockFetch = setupMockFetch({
      body: {
        facets: {
          author_facet_hier: {
            numBuckets: 3,
            buckets: [{ val: '1/Smith, J/Smith, John', count: 40 }]
          }
        }
      }
    });

    const result = await getFacets(client, parse({
      query: 'black hole',
      facets: ['author'],
      prefix: '1/Smith, J/'
    }));

    const url = new URL(mockFetch.mock.calls[0][0] as string);
    const jsonFacet = JSON.parse(url.searchParams.get('json.facet') as string);
    expect(jsonFacet.author_facet_hier.prefix).toBe('1/Smith, J/');
    expect(result).toContain('**Smith, John** — 40');
    expect(result).not.toContain('expandable');
  });

  it('propagates API errors', async () => {
    setupMockFetch({ status: 401, statusText: 'Unauthorized', body: {} });

    await expect(
      getFacets(client, parse({ query: 'star', facets: ['author'] }))
    ).rejects.toThrow(/Authentication failed/);
  });
});

describe('GetFacetsInputSchema', () => {
  it('defaults to a useful spread of facets', () => {
    const parsed = parse({ query: 'star' });
    expect(parsed.facets).toEqual([
      'author',
      'year',
      'publications',
      'keywords',
      'refereed',
      'collections'
    ]);
    expect(parsed.limit).toBe(10);
    expect(parsed.sort).toBe('count desc');
    expect(parsed.response_format).toBe(ResponseFormat.MARKDOWN);
  });

  it('rejects an unknown facet name', () => {
    expect(() => parse({ query: 'star', facets: ['bibstem'] })).toThrow();
  });

  it('rejects a prefix when more than one facet is requested', () => {
    expect(() => parse({
      query: 'star',
      facets: ['author', 'year'],
      prefix: '1/Smith, J/'
    })).toThrow(/prefix is only valid when exactly one facet is requested/);
  });

  it('accepts a prefix for a single facet', () => {
    expect(parse({ query: 'star', facets: ['author'], prefix: '1/Smith, J/' }).prefix)
      .toBe('1/Smith, J/');
  });

  it('rejects an empty facet list and an out-of-range limit', () => {
    expect(() => parse({ query: 'star', facets: [] })).toThrow();
    expect(() => parse({ query: 'star', limit: 0 })).toThrow();
    expect(() => parse({ query: 'star', limit: 201 })).toThrow();
  });

  it('caps the number of filter queries', () => {
    const tooMany = Array.from({ length: 21 }, (_, i) => `property:"p${i}"`);
    expect(() => parse({ query: 'star', filter_query: tooMany })).toThrow();
  });
});
