import { describe, it, expect } from 'vitest';
import {
  FACET_DEFINITIONS,
  FACET_IDS,
  DEFAULT_FACET_IDS,
  facetById,
  levelOf,
  leafLabel,
  childPrefix,
  facetFilter,
  buildJsonFacet,
  parseFacetResponse
} from '../src/facets.js';

describe('facet registry', () => {
  it('covers every facet the SciX UI exposes, plus year', () => {
    expect(FACET_IDS).toEqual([
      'author',
      'collections',
      'refereed',
      'institutions',
      'keywords',
      'publications',
      'bibgroups',
      'simbad',
      'ned',
      'award',
      'data',
      'vizier',
      'pubtype',
      'planetary',
      'uat',
      'year'
    ]);
  });

  it('maps each facet to the Solr field the UI uses', () => {
    const fields = Object.fromEntries(
      FACET_DEFINITIONS.map((facet) => [facet.id, facet.field])
    );

    expect(fields).toEqual({
      author: 'author_facet_hier',
      collections: 'database',
      refereed: 'property',
      institutions: 'aff_facet_hier',
      keywords: 'keyword_facet',
      publications: 'pub_abbrev',
      bibgroups: 'bibgroup_facet',
      simbad: 'simbad_object_facet_hier',
      ned: 'ned_object_facet_hier',
      award: 'grant_facet_hier',
      data: 'data_facet',
      vizier: 'vizier_facet',
      pubtype: 'doctype_facet_hier',
      planetary: 'planetary_feature_facet_hier_3level',
      uat: 'uat',
      year: 'year'
    });
  });

  it('marks exactly the hierarchical facets, with planetary three levels deep', () => {
    const hierarchical = FACET_DEFINITIONS
      .filter((facet) => facet.hierarchical)
      .map((facet) => facet.id);

    expect(hierarchical).toEqual([
      'author',
      'institutions',
      'simbad',
      'ned',
      'award',
      'pubtype',
      'planetary'
    ]);
    expect(facetById('planetary').maxLevel).toBe(2);
    expect(facetById('author').maxLevel).toBe(1);
    expect(facetById('keywords').maxLevel).toBe(0);
  });

  it('records the closed vocabularies for collections and refereed', () => {
    expect(facetById('collections').values).toEqual([
      'astronomy',
      'physics',
      'general',
      'earthscience'
    ]);
    expect(facetById('refereed').values).toEqual(['refereed', 'notrefereed']);
  });

  it('uses no duplicate ids or fields', () => {
    expect(new Set(FACET_IDS).size).toBe(FACET_IDS.length);
    const fields = FACET_DEFINITIONS.map((facet) => facet.field);
    expect(new Set(fields).size).toBe(fields.length);
  });

  it('defaults to a subset of known facets', () => {
    for (const id of DEFAULT_FACET_IDS) {
      expect(FACET_IDS).toContain(id);
    }
  });

  it('names the known facets when asked for an unknown one', () => {
    expect(() => facetById('bibstem')).toThrow(/Unknown facet 'bibstem'/);
    expect(() => facetById('bibstem')).toThrow(/author/);
  });
});

describe('hierarchical value helpers', () => {
  it('reads the level off a prefixed value', () => {
    expect(levelOf('0/Smith, J')).toBe(0);
    expect(levelOf('1/Smith, J/Smith, John')).toBe(1);
    expect(levelOf('2/Mars/Crater/Gale')).toBe(2);
    expect(levelOf('astronomy')).toBe(0);
  });

  it('reduces a prefixed value to its leaf', () => {
    expect(leafLabel('0/Smith, J')).toBe('Smith, J');
    expect(leafLabel('1/Smith, J/Smith, John')).toBe('Smith, John');
    expect(leafLabel('2/Mars/Crater/Gale')).toBe('Gale');
    expect(leafLabel('astronomy')).toBe('astronomy');
  });

  it('builds the child prefix by incrementing the level', () => {
    expect(childPrefix('0/Smith, J')).toBe('1/Smith, J/');
    expect(childPrefix('1/Mars/Crater')).toBe('2/Mars/Crater/');
  });
});

describe('facetFilter', () => {
  it('quotes the value as a Solr fq term', () => {
    expect(facetFilter('author_facet_hier', '0/Smith, J'))
      .toBe('author_facet_hier:"0/Smith, J"');
  });

  it('escapes embedded quotes and backslashes so the fq stays well formed', () => {
    expect(facetFilter('keyword_facet', 'the "big" one'))
      .toBe('keyword_facet:"the \\"big\\" one"');
    expect(facetFilter('keyword_facet', 'a\\b'))
      .toBe('keyword_facet:"a\\\\b"');
  });
});

describe('buildJsonFacet', () => {
  it('requests a terms facet per field with bucket totals', () => {
    const body = JSON.parse(buildJsonFacet({
      ids: ['keywords'],
      limit: 25,
      sort: 'count desc'
    }));

    expect(body).toEqual({
      keyword_facet: {
        type: 'terms',
        field: 'keyword_facet',
        limit: 25,
        mincount: 1,
        offset: 0,
        numBuckets: true,
        sort: 'count desc'
      }
    });
  });

  it('defaults hierarchical facets to the root prefix and leaves flat ones unprefixed', () => {
    const body = JSON.parse(buildJsonFacet({
      ids: ['author', 'keywords'],
      limit: 10,
      sort: 'count desc'
    }));

    expect(body.author_facet_hier.prefix).toBe('0/');
    expect(body.keyword_facet).not.toHaveProperty('prefix');
  });

  it('honours an explicit prefix for drilling into a hierarchy', () => {
    const body = JSON.parse(buildJsonFacet({
      ids: ['author'],
      limit: 10,
      sort: 'count desc',
      prefix: '1/Smith, J/'
    }));

    expect(body.author_facet_hier.prefix).toBe('1/Smith, J/');
  });

  it('batches every facet into a single request body', () => {
    const body = JSON.parse(buildJsonFacet({
      ids: FACET_IDS,
      limit: 5,
      sort: 'index asc'
    }));

    expect(Object.keys(body)).toHaveLength(FACET_IDS.length);
    expect(body.year.sort).toBe('index asc');
  });
});

describe('parseFacetResponse', () => {
  it('turns buckets into labels, counts, and ready-to-use filters', () => {
    const groups = parseFacetResponse(
      {
        facets: {
          count: 1200,
          author_facet_hier: {
            numBuckets: 4821,
            buckets: [
              { val: '0/Smith, J', count: 120 },
              { val: '0/Chen, L', count: 88 }
            ]
          }
        }
      },
      ['author']
    );

    expect(groups).toEqual([
      {
        id: 'author',
        label: 'Author',
        field: 'author_facet_hier',
        total_buckets: 4821,
        buckets: [
          {
            value: '0/Smith, J',
            label: 'Smith, J',
            count: 120,
            filter: 'author_facet_hier:"0/Smith, J"',
            expandable: true,
            child_prefix: '1/Smith, J/'
          },
          {
            value: '0/Chen, L',
            label: 'Chen, L',
            count: 88,
            filter: 'author_facet_hier:"0/Chen, L"',
            expandable: true,
            child_prefix: '1/Chen, L/'
          }
        ]
      }
    ]);
  });

  it('does not strip a leading digit-slash from flat facet values', () => {
    const [group] = parseFacetResponse(
      { facets: { keyword_facet: { buckets: [{ val: '21/cm', count: 9 }] } } },
      ['keywords']
    );

    expect(group.buckets[0].label).toBe('21/cm');
    expect(group.buckets[0].filter).toBe('keyword_facet:"21/cm"');
    expect(group.buckets[0].expandable).toBe(false);
    expect(group.buckets[0]).not.toHaveProperty('child_prefix');
  });

  it('stops offering expansion at a facet maximum depth', () => {
    const [author] = parseFacetResponse(
      { facets: { author_facet_hier: { buckets: [{ val: '1/Smith, J/Smith, John', count: 3 }] } } },
      ['author']
    );
    expect(author.buckets[0].expandable).toBe(false);

    const [planetary] = parseFacetResponse(
      {
        facets: {
          planetary_feature_facet_hier_3level: {
            buckets: [
              { val: '1/Mars/Crater', count: 7 },
              { val: '2/Mars/Crater/Gale', count: 2 }
            ]
          }
        }
      },
      ['planetary']
    );
    expect(planetary.buckets[0].expandable).toBe(true);
    expect(planetary.buckets[0].child_prefix).toBe('2/Mars/Crater/');
    expect(planetary.buckets[1].expandable).toBe(false);
  });

  it('coerces numeric bucket values, as the year facet returns', () => {
    const [group] = parseFacetResponse(
      { facets: { year: { buckets: [{ val: 2024, count: 31 }] } } },
      ['year']
    );

    expect(group.buckets[0].value).toBe('2024');
    expect(group.buckets[0].label).toBe('2024');
    expect(group.buckets[0].filter).toBe('year:"2024"');
  });

  it('returns an empty group for a requested facet the response omits', () => {
    const groups = parseFacetResponse({ facets: { count: 0 } }, ['vizier']);

    expect(groups).toEqual([
      {
        id: 'vizier',
        label: 'Vizier Tables',
        field: 'vizier_facet',
        total_buckets: undefined,
        buckets: []
      }
    ]);
  });

  it('tolerates a response with no facets block at all', () => {
    expect(parseFacetResponse({}, ['data'])[0].buckets).toEqual([]);
  });

  it('drops buckets with no value and defaults a missing count to zero', () => {
    const [group] = parseFacetResponse(
      { facets: { data_facet: { buckets: [{ count: 5 }, { val: 'CDS' }] } } },
      ['data']
    );

    expect(group.buckets).toEqual([
      {
        value: 'CDS',
        label: 'CDS',
        count: 0,
        filter: 'data_facet:"CDS"',
        expandable: false
      }
    ]);
  });

  it('preserves the requested facet order', () => {
    const groups = parseFacetResponse(
      { facets: { year: { buckets: [] }, keyword_facet: { buckets: [] } } },
      ['keywords', 'year']
    );

    expect(groups.map((group) => group.id)).toEqual(['keywords', 'year']);
  });
});
