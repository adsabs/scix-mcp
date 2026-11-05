# SciX MCP Server - Usage Guide

This server provides access to SciX for searching astronomical literature, analyzing citations, and managing research collections.

Link to records as `https://scixplorer.org/abs/<bibcode>/abstract`. Tool output already includes these links; use them as given rather than constructing ADS URLs.

## Quick Start

**What you can do:**
- Search 15M+ astronomy papers with advanced queries
- Break a result set down by facet, then filter on what you find
- Get paper details, citations, and metrics
- Export bibliographies in BibTeX, AASTeX, EndNote formats
- Create and manage personal paper libraries
- Analyze citation networks and research impact

**Core concept - Bibcode:** Papers are identified by bibcodes like `2019ApJ...886..145M` (format: `YYYYJJJJJVVVVMPPPPA`)

**Response formats:** Most tools accept `response_format` parameter:
- `markdown` (default) - Human-readable
- `json` - Machine-readable for programmatic use

## Essential Search Syntax

The `search` tool uses Solr query syntax:

**Author searches:**
- `author:"Last, F."` - Exact author match (use quotes!)
- `author:^Last` - First author only

**Field-specific searches:**
- `title:keyword` - Search in titles
- `abstract:"exact phrase"` - Search abstracts
- `year:2020-2023` - Year ranges
- `property:refereed` - Peer-reviewed only

**Citation searches:**
- `citations(identifier:X)` - Papers citing X
- `references(identifier:X)` - Papers cited by X

## Faceting

`get_facets` reports how a result set distributes across a facet, so you can
narrow a search from evidence instead of guesswork.

```
get_facets(query="exoplanet atmospheres", facets=["author", "year", "publications"])
```

Each bucket comes back with a count and a ready-made `filter` string. Pass
those to `search` as `filter_query`:

```
search(query="exoplanet atmospheres",
       filter_query=['author_facet_hier:"0/Smith, J"', 'property:"refereed"'])
```

Facets: `author`, `collections`, `refereed`, `institutions`, `keywords`,
`publications`, `bibgroups`, `simbad`, `ned`, `award`, `data`, `vizier`,
`pubtype`, `planetary`, `uat`, `year`.

Hierarchical facets (`author`, `institutions`, `simbad`, `ned`, `award`,
`pubtype`, `planetary`) use level-prefixed values such as `0/Smith, J`. To
drill into one, request that facet alone and pass the bucket's `child_prefix`
as `prefix`.

**Boolean operators (UPPERCASE required):**
- `AND`, `OR`, `NOT`
- Example: `(dark energy OR dark matter) AND year:2020-2023`

**Sorting:**
- `score desc` (default) - Relevance
- `citation_count desc` - Most cited
- `date desc/asc` - Publication date
- `read_count desc` - Most read

## Common Workflows

### Literature Search
```
1. search(query="exoplanet detection year:2022-2024", rows=20, sort="citation_count desc")
2. Review results, identify key papers
3. get_metrics(bibcodes=[...]) to compare impact
4. get_references(bibcode="key_paper") for foundational work
5. get_citations(bibcode="key_paper") for recent developments
```

### Author Impact Analysis
```
1. search(query='author:"Smith, J." AND property:refereed')
2. get_metrics(bibcodes=[all_papers]) → h-index, total citations
3. get_citations(bibcode="most_cited") → see influence
```

### Building a Bibliography
```
1. search(query="your topic year:2020-2024", rows=50)
2. Export: export(bibcodes=[...], format="bibtex")
3. OR create library first:
   - create_library(name="Paper Bibliography")
   - manage_documents(library_id="...", bibcodes=[...], action="add")
   - export when ready
```

### Research Library Management
```
1. create_library(name="Reading List", public=false)
2. add_documents_by_query(library_id="...", query="topic year:2023")
3. manage_annotation(library_id="...", bibcode="...", content="notes...")
4. update_permissions(library_id="...", email="colleague@...", permission="read")
```

## Key Tools Reference

### Search & Discovery
- **search** - Main search tool. Params: `query` (required), `filter_query` (Solr `fq` strings, ANDed), `rows` (1-100, default 10), `start` (pagination), `sort`, `response_format`
- **get_facets** - Facet counts for a query. Params: `query` (required), `filter_query`, `facets`, `limit` (1-200, default 10), `sort`, `prefix`, `response_format`
- **get_paper** - Full details for one paper. Params: `bibcode`

### Citation Analysis
- **get_metrics** - Calculate h-index, citation counts for 1-2000 bibcodes
- **get_citations** - Papers citing this one (forward citations)
- **get_references** - Papers cited by this one (backward citations)

### Export
- **export** - Generate formatted citations. Params: `bibcodes` (1-2000), `format` (bibtex/aastex/endnote/medlars)

### Libraries (Personal Collections)
- **get_libraries** - List your libraries. Filter by `type` (all/owner/collaborator)
- **get_library** - View library contents
- **create_library** - New library. Params: `name` (required), `description`, `public` (default false), `bibcodes`
- **manage_documents** - Add/remove papers. Params: `library_id`, `bibcodes`, `action` (add/remove)
- **add_documents_by_query** - Bulk add from search. Params: `library_id`, `query`, `rows` (default 25)
- **library_operation** - Set operations. Ops: union/intersection/difference/copy/empty

### Annotations & Sharing
- **manage_annotation** - Add notes to papers in libraries. Max 10,000 chars
- **get_permissions** / **update_permissions** - Manage collaborator access
- **transfer_library** - Transfer ownership

## Best Practices

**Search Strategy:**
1. Start broad, refine narrow
2. Use field-specific searches (`title:`, `author:`) not full-text
3. Check `numFound` in results - adjust query if needed
4. Use parentheses to group conditions: `(A OR B) AND C`

**Performance:**
- Batch operations: `get_metrics` and `export` accept up to 2000 bibcodes
- Request only needed rows (don't ask for 100 when you need 10)
- Cache bibcodes - metadata rarely changes
- Use markdown format unless you need to parse JSON

**Rate Limits:**
- Limits are per-endpoint, not a single account-wide daily cap
- Check the `X-RateLimit-Limit` and `X-RateLimit-Remaining` response headers for the current
  count; a 429 error reports whichever of those the response carries
- Request higher limits at https://scixplorer.org/feedback/general

**Error Handling:**
- No results? Broaden terms, check spelling, verify field syntax
- Too many results? Add filters (`property:refereed`, year ranges)
- Invalid bibcode? Use `search` to find correct format first

## Example Queries

**Find recent JWST papers:**
```
search(query="JWST year:2023-2024 property:refereed", sort="date desc", rows=20)
```

**Track citation growth:**
```
search(query='author:"Einstein, A."')
→ get bibcodes
get_metrics(bibcodes=[...])
→ Store h-index for comparison later
```

**Build reading list:**
```
create_library(name="Exoplanet Research")
add_documents_by_query(library_id="...", query="exoplanet atmosphere year:2023-2024", rows=50)
```

**Export bibliography:**
```
get_library(library_id="...")
→ Extract bibcodes
export(bibcodes=[...], format="bibtex")
```

## Limits & Constraints

- **Search**: Max 100 rows per request (use pagination for more)
- **Metrics/Export/Library docs**: 1-2000 bibcodes per request
- **Annotation**: Max 10,000 characters
- **Library name**: Max 255 characters
- **Request timeout**: 30 seconds

## Public Library Sharing

Public libraries: `https://scixplorer.org/public-libraries/<library_id>`

## Support

- **SciX Homepage**: https://scixplorer.org/
- **API Docs**: https://scixplorer.org/scixhelp/api-scix
- **Search Syntax**: https://scixplorer.org/scixhelp/search-scix/search-syntax
- **API Issues**: https://scixplorer.org/feedback/general
