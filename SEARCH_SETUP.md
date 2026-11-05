# SciX Documentation Search

Fast, in-memory search for SciX help documentation using MiniSearch.

## Overview

This search system provides efficient full-text search across SciX help documentation with:

- **52 indexed chunks** from scixplorer.org/scixhelp (404/nav pages filtered out)
- **Fuzzy matching** for typo tolerance
- **Prefix search** for partial word matching
- **Weighted ranking** (titles boosted 4x, sections 3x, subsections 2x)
- **Smart snippets** centered on matching terms

## Quick Start

### Search from CLI

```bash
pnpm build
node build/search-docs.js "author search"
node build/search-docs.js "export bibtex"
node build/search-docs.js "how to create a library"
```

### Programmatic Usage

```typescript
import { searchDocs } from './build/search-docs.js';

const results = await searchDocs("author search", 10);

results.forEach(result => {
  console.log(`${result.title} (score: ${result.score})`);
  console.log(`  ${result.snippet}`);
});
```

## API

### `searchDocs(query, limit?, options?)`

Full-text search across all documentation.

**Parameters:**
- `query` (string): Search query
- `limit` (number): Maximum results to return (default: 5)
- `options` (object): Additional MiniSearch options

**Returns:** `Promise<SearchResult[]>`

```typescript
interface SearchResult {
  id: string;
  title: string;
  section: string;
  subsection: string;
  source_file: string;
  source_url: string;
  doc_type: string;
  category: string;
  score: number;
  snippet: string;
}
```

## Data Processing

### Generate Chunked Index

The chunked documentation index is generated in the separate **scix-docs-scraper** repository:

```bash
cd ~/code/scix-docs-scraper
pnpm export  # Scrape -> process -> chunk

# Copy to MCP server
cp output/chunked/chunked-index.json ~/code/scix-mcp-server/data/scix/
```

The index contains:
- Scraped SciX help pages from scixplorer.org
- Categorized by topic (search_docs, api_docs, faq, etc.)
- Metadata (source URL, doc type, category)
- Search-optimized format

**Source:** Live SciX help documentation at scixplorer.org/scixhelp

### Index Structure

```json
{
  "id": "usage_guide__chunk0",
  "source_file": "USAGE_GUIDE.md",
  "source_url": "https://github.com/adsabs/scix-mcp/blob/master/USAGE_GUIDE.md",
  "doc_type": "usage_guide",
  "category": "user_docs",
  "title": "SciX MCP Server - Usage Guide",
  "section": "Quick Start",
  "subsection": "",
  "content": "What you can do:\n- Search 15M+ papers...",
  "char_count": 387
}
```

## Search Features

### Fuzzy Matching

Handles typos and misspellings:

```typescript
await searchDocs("authr serch");
```

### Prefix Search

Matches partial words:

```typescript
await searchDocs("citat");
```

### Weighted Ranking

- **Title matches**: 4x boost
- **Section matches**: 3x boost
- **Subsection matches**: 2x boost
- **Doc type matches**: 2x boost
- **Content matches**: 1x

### Smart Snippets

Snippets are automatically generated:
- Centered on first matching term
- Max 260 characters
- Ellipsis (`...`) for truncated content

## Testing

Run the test suite:

```bash
pnpm test search-docs
```

**Test coverage:**
- Basic search queries (23 tests)
- Fuzzy matching
- Result limiting
- Field validation
- Snippet generation
- Ranking and scoring

## Performance

- **Index build time**: ~5ms (52 documents after filtering)
- **Search latency**: <1ms for most queries
- **Memory usage**: ~50KB for index
- **Cache**: Index built once on first search

## Integration with MCP

To integrate with your MCP server:

```typescript
import { searchDocs } from './search-docs.js';

server.tool({
  name: 'search_docs',
  description: 'Search SciX documentation',
  parameters: z.object({
    query: z.string(),
    limit: z.number().optional().default(5),
  }),
  handler: async ({ query, limit }) => {
    const results = await searchDocs(query, limit);

    return {
      content: [
        {
          type: 'text',
          text: formatResults(results),
        },
      ],
    };
  },
});
```

## Next Steps

Future enhancements could include:

1. **Hybrid search**: Combine lexical + semantic (embeddings)
2. **Highlighting**: Wrap matched terms in `**` for markdown
3. **Query expansion**: Auto-suggest related terms
4. **Caching**: Persist frequently searched queries
5. **More sources**: Index API docs, code comments, examples
6. **Field filtering**: Search only titles, or only AI docs, etc.
