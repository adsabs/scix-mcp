# SciX Literature Search Guide

## Search Tool Overview

The `search` tool is your primary method for finding astronomical papers. It uses Solr query syntax for powerful, precise searches.

## Key Search Patterns

**Author searches:**
- `author:"Last, F."` - Exact author match
- `author:^Last` - First author only
- Always use quotes for exact matches

**Field-specific searches:**
- `title:keyword` - Search in titles
- `abstract:"exact phrase"` - Search abstracts with quotes for phrases
- `year:2020-2023` - Year ranges
- `property:refereed` - Peer-reviewed papers only

**Citation-based searches:**
- `citations(bibcode:X)` - Find papers that cite X
- `references(bibcode:X)` - Find papers cited by X

**Boolean operators (must be UPPERCASE):**
- `AND`, `OR`, `NOT`
- Example: `(dark energy OR dark matter) AND year:2020-2023`

## Sorting Options

- `score desc` (default) - Relevance ranking
- `citation_count desc` - Most cited first
- `date desc/asc` - Publication date
- `read_count desc` - Most read papers

## Pagination

- Use `rows` parameter (1-100) to limit results
- Use `start` parameter for pagination (e.g., start=0, start=10, start=20)
- For large result sets (>100), use Solr cursormark pagination

## Narrowing With Facets

`get_facets` shows how a result set breaks down before you commit to a filter:

```
get_facets(
  query="exoplanet atmospheres",
  facets=["author", "year", "publications", "refereed"]
)
```

Each bucket returns a count and a `filter` string. Apply it via `search`'s
`filter_query` rather than editing the query text — Solr caches filters
separately, and it keeps the topic and the constraints independent:

```
search(
  query="exoplanet atmospheres",
  filter_query=['property:"refereed"', 'pub_abbrev:"ApJ"']
)
```

Facets available: `author`, `collections`, `refereed`, `institutions`,
`keywords`, `publications`, `bibgroups`, `simbad`, `ned`, `award`, `data`,
`vizier`, `pubtype`, `planetary`, `uat`, `year`.

Hierarchical facets return level-prefixed values (`0/Smith, J`). Request a
single facet and pass a bucket's `child_prefix` as `prefix` to expand it.

## Query Construction Best Practices

1. **Start broad, refine narrow**: Begin with key terms, then use `get_facets`
   to pick filters from the actual distribution
2. **Use field-specific searches**: More accurate than full-text
3. **Check numFound**: If too many results, add filters; if too few, broaden
4. **Combine strategically**: Use parentheses to group conditions

## Example Workflows

**Find recent papers by author:**
```
search(
  query="author:\"Einstein, A.\" year:2020-2024",
  sort="date desc",
  rows=20
)
```

**Find highly-cited review papers:**
```
search(
  query="title:review AND property:refereed",
  sort="citation_count desc",
  rows=10
)
```

**Literature review workflow:**
1. Broad search with topic + year range, then `get_facets` to see the shape
2. Use `get_metrics` on top results to identify key papers
3. Use `get_references` on key papers for foundational work
4. Use `get_citations` to find recent developments