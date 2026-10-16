import { SciXAPIClient, repeated } from '../client.js';
import { DEFAULT_FIELDS } from '../config.js';
import { SearchInput, ResponseFormat, SolrResponse } from '../types.js';
import { formatPapersListMarkdown } from '../formatters.js';
import { searchUrl } from '../scix-urls.js';

export async function search(client: SciXAPIClient, input: SearchInput): Promise<string> {
  const filterQuery = input.filter_query ?? [];

  const params = {
    q: input.query,
    fq: filterQuery.length > 0 ? repeated(filterQuery) : undefined,
    fl: DEFAULT_FIELDS,
    rows: input.rows,
    start: input.start,
    sort: input.sort
  };

  const response = await client.get<SolrResponse>('search/query', params);

  const numFound = response.response?.numFound || 0;
  const docs = response.response?.docs || [];

  if (input.response_format === ResponseFormat.JSON) {
    return JSON.stringify({ numFound, start: input.start, docs }, null, 2);
  }

  const hasMore = (input.start + input.rows) < numFound;

  let result = formatPapersListMarkdown(docs, numFound);

  result += `\n[View on SciX](${searchUrl(input.query, filterQuery)})\n`;

  if (hasMore) {
    result += `\n*Use start=${input.start + input.rows} to see more results*\n`;
  }

  return result;
}
