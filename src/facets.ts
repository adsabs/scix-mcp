export interface FacetDefinition {
  id: string;
  label: string;
  field: string;
  hierarchical: boolean;
  maxLevel: number;
  values?: readonly string[];
}

export const FACET_DEFINITIONS = [
  {
    id: 'author',
    label: 'Author',
    field: 'author_facet_hier',
    hierarchical: true,
    maxLevel: 1
  },
  {
    id: 'collections',
    label: 'Collections',
    field: 'database',
    hierarchical: false,
    maxLevel: 0,
    values: ['astronomy', 'physics', 'general', 'earthscience']
  },
  {
    id: 'refereed',
    label: 'Refereed',
    field: 'property',
    hierarchical: false,
    maxLevel: 0,
    values: ['refereed', 'notrefereed']
  },
  {
    id: 'institutions',
    label: 'Institutions',
    field: 'aff_facet_hier',
    hierarchical: true,
    maxLevel: 1
  },
  {
    id: 'keywords',
    label: 'Keywords',
    field: 'keyword_facet',
    hierarchical: false,
    maxLevel: 0
  },
  {
    id: 'publications',
    label: 'Publications',
    field: 'pub_abbrev',
    hierarchical: false,
    maxLevel: 0
  },
  {
    id: 'bibgroups',
    label: 'Bibgroups',
    field: 'bibgroup_facet',
    hierarchical: false,
    maxLevel: 0
  },
  {
    id: 'simbad',
    label: 'SIMBAD Objects',
    field: 'simbad_object_facet_hier',
    hierarchical: true,
    maxLevel: 1
  },
  {
    id: 'ned',
    label: 'NED Objects',
    field: 'ned_object_facet_hier',
    hierarchical: true,
    maxLevel: 1
  },
  {
    id: 'award',
    label: 'Award',
    field: 'grant_facet_hier',
    hierarchical: true,
    maxLevel: 1
  },
  {
    id: 'data',
    label: 'Data',
    field: 'data_facet',
    hierarchical: false,
    maxLevel: 0
  },
  {
    id: 'vizier',
    label: 'Vizier Tables',
    field: 'vizier_facet',
    hierarchical: false,
    maxLevel: 0
  },
  {
    id: 'pubtype',
    label: 'Publication Type',
    field: 'doctype_facet_hier',
    hierarchical: true,
    maxLevel: 1
  },
  {
    id: 'planetary',
    label: 'Planetary Features',
    field: 'planetary_feature_facet_hier_3level',
    hierarchical: true,
    maxLevel: 2
  },
  {
    id: 'uat',
    label: 'UAT',
    field: 'uat',
    hierarchical: false,
    maxLevel: 0
  },
  {
    id: 'year',
    label: 'Year',
    field: 'year',
    hierarchical: false,
    maxLevel: 0
  }
] as const satisfies readonly FacetDefinition[];

export type FacetId = (typeof FACET_DEFINITIONS)[number]['id'];

export const FACET_IDS = FACET_DEFINITIONS.map((facet) => facet.id) as [FacetId, ...FacetId[]];

export const DEFAULT_FACET_IDS: readonly FacetId[] = [
  'author',
  'year',
  'publications',
  'keywords',
  'refereed',
  'collections'
];

const BY_ID = new Map<string, FacetDefinition>(
  FACET_DEFINITIONS.map((facet) => [facet.id, facet])
);

export function facetById(id: string): FacetDefinition {
  const facet = BY_ID.get(id);
  if (!facet) {
    throw new Error(`Unknown facet '${id}'. Known facets: ${FACET_IDS.join(', ')}`);
  }
  return facet;
}

export const HIERARCHY_ROOT_PREFIX = '0/';

export function levelOf(value: string): number {
  const match = /^(\d+)\//.exec(value);
  return match ? Number(match[1]) : 0;
}

export function leafLabel(value: string): string {
  if (!/^\d+\//.test(value)) {
    return value;
  }
  const parts = value.split('/');
  return parts[parts.length - 1];
}

export function childPrefix(value: string): string {
  const parts = value.split('/');
  const level = levelOf(value);
  return [level + 1, ...parts.slice(1)].join('/') + '/';
}

export function facetFilter(field: string, value: string): string {
  return `${field}:"${value.replace(/[\\"]/g, '\\$&')}"`;
}

export type FacetSort = 'count desc' | 'count asc' | 'index asc' | 'index desc';

export interface FacetQuerySpec {
  ids: readonly FacetId[];
  limit: number;
  sort: FacetSort;
  prefix?: string;
}

interface TermsFacet {
  type: 'terms';
  field: string;
  limit: number;
  mincount: number;
  offset: number;
  numBuckets: true;
  sort: FacetSort;
  prefix?: string;
}

export function buildJsonFacet(spec: FacetQuerySpec): string {
  const body: Record<string, TermsFacet> = {};

  for (const id of spec.ids) {
    const facet = facetById(id);
    const terms: TermsFacet = {
      type: 'terms',
      field: facet.field,
      limit: spec.limit,
      mincount: 1,
      offset: 0,
      numBuckets: true,
      sort: spec.sort
    };

    const prefix = spec.prefix ?? (facet.hierarchical ? HIERARCHY_ROOT_PREFIX : undefined);
    if (prefix !== undefined && prefix !== '') {
      terms.prefix = prefix;
    }

    body[facet.field] = terms;
  }

  return JSON.stringify(body);
}

export interface FacetBucket {
  value: string;
  label: string;
  count: number;
  filter: string;
  expandable: boolean;
  child_prefix?: string;
}

export interface FacetGroup {
  id: FacetId;
  label: string;
  field: string;
  total_buckets?: number;
  buckets: FacetBucket[];
}

export interface JsonFacetBucket {
  val?: string | number;
  count?: number;
}

export interface JsonFacetResponse {
  facets?: Record<string, { numBuckets?: number; buckets?: JsonFacetBucket[] } | number>;
}

function toBucket(facet: FacetDefinition, raw: JsonFacetBucket): FacetBucket | undefined {
  if (raw.val === undefined || raw.val === null) {
    return undefined;
  }
  const value = String(raw.val);
  const expandable = facet.hierarchical && levelOf(value) < facet.maxLevel;

  return {
    value,
    label: facet.hierarchical ? leafLabel(value) : value,
    count: raw.count ?? 0,
    filter: facetFilter(facet.field, value),
    expandable,
    ...(expandable ? { child_prefix: childPrefix(value) } : {})
  };
}

export function parseFacetResponse(
  response: JsonFacetResponse,
  ids: readonly FacetId[]
): FacetGroup[] {
  const facets = response.facets ?? {};

  return ids.map((id) => {
    const facet = facetById(id);
    const block = facets[facet.field];
    const parsed = typeof block === 'object' && block !== null ? block : undefined;
    const buckets = (parsed?.buckets ?? [])
      .map((raw) => toBucket(facet, raw))
      .filter((bucket): bucket is FacetBucket => bucket !== undefined);

    return {
      id,
      label: facet.label,
      field: facet.field,
      total_buckets: parsed?.numBuckets,
      buckets
    };
  });
}
