# SciX MCP Server - AI Agent Guide

This server provides access to SciX, enabling search and management of astronomical literature.

**Link policy**: when citing or linking a record, always use `https://scixplorer.org/abs/<bibcode>/abstract`. Tool output already contains these links — use them verbatim and never rewrite them to an ADS host.

## Core Concepts

**Bibcode**: Unique identifier for papers (e.g., `2019ApJ...886..145M`). Format: `YYYYJJJJJVVVVMPPPPA` where YYYY=year, JJJJJ=journal, VVVV=volume, M=section, PPPP=page, A=first author initial.

**Response Formats**: Most tools accept `response_format` parameter:

- `markdown` (default): Human-readable, structured text
- `json`: Machine-readable, full data structure

## Tool Categories

### 1. Literature Discovery

**search** - Primary tool for finding papers

- Use advanced Solr syntax for precise queries
- Always prefer specific field searches over full-text when possible
- Supports pagination via `start` parameter

**Key search patterns:**

```
author:"Last, F."          # Exact author match
author:^Last               # First author only
title:keyword              # Title search
abstract:"exact phrase"    # Abstract search
year:2020-2023            # Year range
property:refereed         # Peer-reviewed only
citations(bibcode:X)      # Papers citing X
```

**Boolean operators:** `AND`, `OR`, `NOT` (must be uppercase)

**filter_query** - narrow results without touching the query

`search` accepts `filter_query`, a list of Solr `fq` strings ANDed together,
e.g. `['property:"refereed"', 'database:"astronomy"']`. Prefer this over
folding constraints into `query` when the constraint came from a facet.

**get_facets** - see how a result set breaks down, then filter on it

- Takes the same `query` and `filter_query` as `search`, plus `facets`
- Returns buckets with counts and a ready-made `filter` string per bucket
- Available facets: `author`, `collections`, `refereed`, `institutions`,
  `keywords`, `publications`, `bibgroups`, `simbad`, `ned`, `award`, `data`,
  `vizier`, `pubtype`, `planetary`, `uat`, `year`
- Hierarchical facets (`author`, `institutions`, `simbad`, `ned`, `award`,
  `pubtype`, `planetary`) return level-prefixed values like `0/Smith, J`.
  Pass a bucket's `child_prefix` back as `prefix` to drill in — valid only
  when requesting a single facet.

**Facet-then-filter workflow:**

```
1. get_facets(query: "exoplanet atmospheres", facets: ["author", "year"])
2. read the bucket you want, e.g. filter: author_facet_hier:"0/Smith, J"
3. search(query: "exoplanet atmospheres",
          filter_query: ['author_facet_hier:"0/Smith, J"'])
```

Use `get_facets` instead of guessing at constraints or paging through
hundreds of results to work out the shape of a result set.

**Sorting options:**

- `score desc` (default): Relevance
- `citation_count desc`: Most cited
- `date desc/asc`: Publication date
- `read_count desc`: Most read

### 2. Paper Analysis

**get_paper** - Detailed metadata for single paper

- Requires bibcode
- Returns: title, authors, abstract, citation count, keywords, affiliations, publication info

**get_metrics** - Citation analysis for paper sets

- Accepts 1-2000 bibcodes
- Returns: h-index, g-index, i10-index, total citations, paper counts, usage statistics
- Use for author impact analysis or collection assessment

**get_citations** - Forward citations (who cited this?)

- Shows papers that reference the given paper
- Useful for tracking impact and finding related recent work

**get_references** - Backward citations (what did this cite?)

- Shows bibliography of given paper
- Useful for literature review and foundational papers

### 3. Export & Citations

**export** - Format citations for papers

- Formats: `bibtex`, `aastex`, `endnote`, `medlars`
- Accepts 1-2000 bibcodes
- Returns plain text formatted citations
- Essential for bibliography generation

### 4. Library Management

**Libraries** are personal collections of papers with optional annotations.

**get_libraries** - List user's libraries

- Filter by: `all`, `owner`, `collaborator`
- Returns library IDs needed for other operations

**get_library** - View library contents

- Shows metadata and all documents (bibcodes)
- Use to retrieve library_id from name

**create_library** - Create new collection

- Required: `name` (1-255 chars)
- Optional: `description`, `public` flag, initial `bibcodes`
- Returns library_id for future operations

**edit_library** - Modify metadata

- Can update: name, description, public status
- Does not affect documents

**delete_library** - Permanent deletion

- Destructive operation, cannot be undone
- Agents should pause and confirm with the user before invoking this or any destructive action

### 5. Document Management

**manage_documents** - Add/remove papers from library

- Actions: `add`, `remove`
- Accepts 1-2000 bibcodes per operation
- Idempotent: adding existing document or removing non-existent is safe

**add_documents_by_query** - Bulk add from search

- Executes search query and adds results to library
- Useful for: "add all papers by author X to library"
- Default: 25 results, max: 2000

**library_operation** - Set operations between libraries

- `union`: Combine libraries (OR)
- `intersection`: Common papers (AND)
- `difference`: Papers in target not in sources
- `copy`: Duplicate library with new name
- `empty`: Remove all documents (keep library)

### 6. Permissions & Sharing

**get_permissions** - View library access

- Shows all users with access and their permission levels

**update_permissions** - Grant/modify access

- Levels: `owner`, `admin`, `write`, `read`
- Requires user email

**transfer_library** - Change ownership

- Requires new owner email
- Original owner becomes admin

**Sharing links**

- Public libraries should be shared using `https://scixplorer.org/public-libraries/<library_id>`; private ones live at `https://scixplorer.org/user/libraries/<library_id>`. Never link to an ADS UI host.
### 7. Annotations

**get_annotation** - Retrieve note for paper in library

- Notes are per-document within library context

**manage_annotation** - Add/update note

- Content: 1-10000 characters
- Use for: research notes, summaries, personal comments

**delete_annotation** - Remove note

- Does not remove document from library

## Best Practices for AI Agents

### Query Construction

1. **Start broad, refine narrow**: Initial search with key terms, then add filters
2. **Use field-specific searches**: `author:"Smith, J."` not `"J. Smith author"`
3. **Combine operators strategically**: `(dark energy OR dark matter) AND year:2020-2023`
4. **Check numFound**: Adjust query if results too many/few
5. **Scale with cursormark**: For large result sets, use Solr `cursormark` pagination (`cursormark=*`, stable `sort`, loop until `nextCursorMark` repeats) instead of `start` offsets
6. **Batch many queries**: If you already have a text file full of queries, run them through the SciX BigQuery endpoint to avoid thousands of individual `search` calls

### Efficient Workflows

**Literature Review:**

1. `search` with broad topic + year range
2. `get_metrics` on top results to identify key papers
3. `get_references` on key papers for foundational work
4. `get_citations` to find recent developments

**Author Analysis:**

1. `search` with `author:"Last, F." AND property:refereed`
2. `get_metrics` on all papers for h-index
3. `get_citations` on top papers to see influence

**Building Research Collections:**

1. `create_library` with descriptive name
2. `add_documents_by_query` for bulk additions
3. `manage_annotation` to add notes as you review
4. `export` when ready to cite

### Error Handling

- **No results**: Try broader terms, remove filters, check spelling
- **Too many results**: Add field-specific filters, use Boolean operators
- **Invalid bibcode**: Use `search` to find correct bibcode first
- **Rate limits**: 5000 requests/day per API key

### Performance Tips

1. **Request only needed data**: Use `rows` parameter to limit results
2. **Batch operations**: Use metrics/export with multiple bibcodes in one call
3. **Cache bibcodes**: Store bibcodes for papers of interest, metadata changes rarely
4. **Use markdown format**: Unless parsing is required, markdown is more efficient

## Common Use Cases

**Find recent papers by author:**

```
Tool: search
Query: author:"Einstein, A." year:2020-2024
Sort: date desc
```

**Build bibliography for paper:**

```
1. search → get bibcodes
2. export with format:bibtex
```

**Track citation metrics over time:**

```
1. search → get author's papers
2. get_metrics → current h-index and citations
3. Store for comparison later
```

**Create reading list:**

```
1. create_library (name: "Reading List - Exoplanets")
2. add_documents_by_query (query: "exoplanet detection year:2023-2024")
3. manage_annotation for each paper after reading
```

**Find seminal papers in field:**

```
1. search (broad topic query)
2. sort: citation_count desc
3. get_citations on top results (highly cited → foundational)
```

## Limitations

- **Rate limit**: 5000 requests/day (request higher limits at https://scixplorer.org/feedback/general)
- **Bibcode limits**: Max 2000 bibcodes per request for metrics/export/library operations
- **Search results**: Max 100 rows per search request
- **Annotation length**: Max 10000 characters
- **Library name**: Max 255 characters

## Quick Reference

| Task                | Tool                     | Key Parameters                       |
| ------------------- | ------------------------ | ------------------------------------ |
| Find papers         | `search`                 | `query`, `rows`, `sort`              |
| Paper details       | `get_paper`              | `bibcode`                            |
| Citation stats      | `get_metrics`            | `bibcodes[]`                         |
| Who cited this?     | `get_citations`          | `bibcode`                            |
| What did this cite? | `get_references`         | `bibcode`                            |
| Generate citations  | `export`                 | `bibcodes[]`, `format`               |
| List collections    | `get_libraries`          | `type`                               |
| View collection     | `get_library`            | `library_id`                         |
| New collection      | `create_library`         | `name`                               |
| Add papers          | `manage_documents`       | `library_id`, `bibcodes[]`, `action` |
| Bulk add            | `add_documents_by_query` | `library_id`, `query`                |
| Combine collections | `library_operation`      | `library_id`, `operation`            |
| Add note            | `manage_annotation`      | `library_id`, `bibcode`, `content`   |

## Integration Tips

When responding to users:

- **Always show bibcodes** in results for reference
- **Explain search strategy** when queries need refinement
- **Suggest related tools** (e.g., after search, offer metrics or citations)
- **Use markdown format** for readability unless structured data needed
- **Batch operations** when user requests multiple related actions
- **Verify library operations** by checking library contents after modifications
