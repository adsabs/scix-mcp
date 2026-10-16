import { SciXAPIClient, repeated } from '../client.js';
import { buildJsonFacet, parseFacetResponse, type JsonFacetResponse } from '../facets.js';
import { formatFacetsMarkdown } from '../formatters.js';
import { GetFacetsInput, ResponseFormat } from '../types.js';

export async function getFacets(
  client: SciXAPIClient,
  input: GetFacetsInput
): Promise<string> {
  const params = {
    q: input.query,
    fq: input.filter_query && input.filter_query.length > 0
      ? repeated(input.filter_query)
      : undefined,
    rows: 0,
    fl: 'id',
    'json.facet': buildJsonFacet({
      ids: input.facets,
      limit: input.limit,
      sort: input.sort,
      prefix: input.prefix
    })
  };

  const response = await client.get<JsonFacetResponse>('search/query', params);
  const groups = parseFacetResponse(response, input.facets);

  if (input.response_format === ResponseFormat.JSON) {
    return JSON.stringify({ query: input.query, facets: groups }, null, 2);
  }

  return formatFacetsMarkdown(groups, input.query, input.filter_query ?? []);
}
