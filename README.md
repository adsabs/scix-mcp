# NASA SciX MCP Server

A Model Context Protocol (MCP) server for the NASA Astrophysics Data System (SciX) API. This server enables LLMs to search astronomical literature, retrieve paper metadata, analyze citation metrics, and export bibliographic data.

## Quick Start (MCP clients)

### Get an API Key

1. Create an account at [SciX](https://scixplorer.org/)
2. Generate an API token at https://scixplorer.org/user/settings/token
3. Set the environment variable:

```bash
export SCIX_API_TOKEN=your_api_key_here
```

Or create a `.env` file:

```bash
cp .env.example .env
# Edit .env and add your key
```

### Configure your MCP client (Claude, Codex, etc.)

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "ads": {
      "command": "npx",
      "args": ["scix-mcp"],
      "env": {
        "SCIX_API_TOKEN": "your_api_key_here"
      }
    }
  }
}
```

Common locations: Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS or `%AppData%\\Claude\\claude_desktop_config.json` on Windows) and Codex CLI (`~/.config/codex/config.json`). Restart your client after editing.

Local MCP clients that read `.mcp/server.json` can also pick up the packaged config in `.mcp/server.json`; just drop in your `SCIX_API_TOKEN`.

### Environment variables

- `SCIX_API_TOKEN` (required for stdio): your SciX/ADS API key. Not used by the
  HTTP transport, which takes the token from each request.
- `SCIX_API_BASE` (optional): override the API base URL. Defaults to
  `https://api.adsabs.harvard.edu/v1` when unset. Primarily used to point the
  server at a local mock during the e2e test suite.
- `PORT` / `HOST` (HTTP only): where the HTTP transport listens. Default
  `8000` on `0.0.0.0`.

## HTTP transport

`scix-mcp-http` serves the same tools over Streamable HTTP instead of stdio:
`POST /mcp` for JSON-RPC, `GET /healthz` as an unauthenticated probe.

Unlike stdio, the server holds no token of its own — each request must carry
the caller's, and requests without one get a 401:

```
Authorization: Bearer <your SciX API token>
```

Tool calls act as the calling user and spend that user's rate limit. Clients
that cannot set the header (ChatGPT connectors, which need OAuth or no auth)
cannot use this endpoint.

## Example Prompts

```text
- Find refereed JWST exoplanet papers from 2022-2024 sorted by citation_count, return the top 5 in markdown with bibcodes, titles, first author, and citation counts.
- Build a query for gravitational wave kilonova follow-ups since 2017 (fielded abstract search), add the first 50 results to library <library_id>, and then give me metrics (h-index, total cites) for those bibcodes in JSON.
- Fetch paper 2020ApJ...905....3A, list its first 10 references with titles, and also list the first 10 forward citations with publication years.
- Create a public library named “Cosmic Web Reviews”, seeded with bibcodes [...], then share the public URL and export the contents in BibTeX.
- For bibcodes [...], return citation metrics plus a ranked list of which papers cite the most recent one (rows=25) in markdown.
- Get all my libraries, pick the one with the most documents, and return its metadata plus the first 5 document titles in JSON.
```

## Features

- **Literature Search**: Full-text search with advanced Solr query syntax
- **Paper Details**: Retrieve metadata for any publication
- **Citation Metrics**: Calculate h-index, citation counts, and usage statistics
- **Citation Network**: Explore forward and backward citations
- **Export**: Generate citations in 23 bibliographic formats (BibTeX, AASTeX, EndNote, RIS, and more) — see the `export` tool's `format` enum in `src/types.ts` for the full list
- **Documentation Search**: Query SciX help/docs content via the `search_docs` tool
- **Health Check**: Diagnose setup (token, API reachability, tool registry) via the `health_check` tool
- **Dual Format**: Support for both human-readable Markdown and machine-readable JSON

## Available Tools

### Search & Metadata

- `search`: Solr-powered search across SciX. Params: `query` (required), `rows` (1-100, default 10), `start` (offset, default 0), `sort` (`score desc` | `citation_count desc` | `date desc` | `date asc` | `read_count desc`, default `score desc`), `response_format` (`markdown` | `json`, default `markdown`).
  - Example queries: `author:"Einstein, A." title:relativity`, `black holes year:2020-2023`, `author:^Smith`, `dark energy AND galaxy clusters`.
- `get_paper`: Fetch a paper by `bibcode`, DOI, arXiv ID, or SciX ID (`scix:...`) with optional `response_format`.
- `get_metrics`: Metrics for `bibcodes` (1-2000) with optional `response_format`; returns h-index, g-index, citation counts, usage stats.

### Citation Network

- `get_citations`: Forward citations for a paper (`bibcode`, DOI, arXiv ID, or SciX ID); optional `rows` (1-100, default 20) and `response_format`.
- `get_references`: Backward references for a paper (`bibcode`, DOI, arXiv ID, or SciX ID); optional `rows` (1-100, default 20) and `response_format`.

### Export

- `export`: Export `bibcodes` (1-2000) in `format` — one of the 23 formats in the `ExportInputSchema` enum in `src/types.ts` (e.g. `bibtex`, `aastex`, `endnote`, `ris`, `ieee`, `mnras`). Use `custom_format` with `format: custom` for a template. Returns plain text in the chosen format.

### Documentation

- `search_docs`: Search SciX help documentation. Params: `query` (required, natural language), `limit` (1-20, default 5). Returns a ranked list with title, section/subsection, source URL, relevance score, and a focused snippet.

### Libraries

- `get_libraries`: List libraries; optional `type` (`all` | `owner` | `collaborator`, default `all`) and `response_format`.
- `get_library`: Metadata + documents for `library_id`; optional `response_format`.
- `create_library`: Create with `name` (required), optional `description`, `public` (default `false`), `bibcodes`, and `response_format`.
- `delete_library`: Permanently delete by `library_id`; optional `response_format`.
- `edit_library`: Update `name`, `description`, or `public` for `library_id`; optional `response_format`.
- `manage_documents`: Add/remove documents with `library_id`, `bibcodes` (1-2000), `action` (`add` | `remove`), and optional `response_format`.
- `add_documents_by_query`: Add search results to a library with `library_id`, `query`, optional `rows` (1-2000, default 25), and `response_format`.
- `library_operation`: Run set ops on a library with `library_id`, `operation` (`union` | `intersection` | `difference` | `copy` | `empty`), optional `source_library_ids`, `name`/`description` (for copy), and `response_format`.

### Permissions & Sharing

- `get_permissions`: View owners/collaborators for `library_id`; optional `response_format`.
- `update_permissions`: Grant/change a user's access with `library_id`, `email`, `permission` (`owner` | `admin` | `write` | `read`), and optional `response_format`.
- `transfer_library`: Transfer ownership with `library_id`, `email`, and optional `response_format`.

### Annotations

- `get_annotation`: Fetch note content for `library_id` + `bibcode`; optional `response_format`.
- `manage_annotation`: Add/update note with `library_id`, `bibcode`, `content`, and optional `response_format`.
- `delete_annotation`: Remove note for `library_id` + `bibcode`; optional `response_format`.

### Diagnostics

- `health_check`: Diagnose the server setup. No required params (optional `response_format`). Reports server name/version, API base URL, whether a token is configured, an authentication probe result (`ok` | `unauthorized` | `rate_limited` | `unreachable` | `skipped`), and the registered tool names. Never emits the token value. Runs without a token (probe is `skipped`); use it to tell setup problems apart from ordinary API errors.

## Rate Limits

- **5000 requests per day** per API key
- Rate limit info is returned in response headers
- Contact adshelp@cfa.harvard.edu for higher limits

## SciX Search Syntax

The SciX search supports Solr query syntax:

| Syntax                  | Description       | Example                          |
| ----------------------- | ----------------- | -------------------------------- |
| `author:"Last, F."`     | Exact author      | `author:"Huchra, John"`          |
| `author:^Last`          | First author      | `author:^Smith`                  |
| `title:keyword`         | Title search      | `title:exoplanet`                |
| `abstract:keyword`      | Abstract search   | `abstract:"dark matter"`         |
| `year:YYYY-YYYY`        | Year range        | `year:2020-2023`                 |
| `property:refereed`     | Refereed only     | `property:refereed`              |
| `citations(bibcode:X)`  | Papers citing X   | `citations(bibcode:2019ApJ...)`  |
| `references(bibcode:X)` | Papers cited by X | `references(bibcode:2019ApJ...)` |
| `AND`, `OR`, `NOT`      | Boolean operators | `black holes AND galaxy`         |

## Development

### Install & Build

```bash
pnpm install
pnpm build
```

### Local commands

```bash
# Watch mode
pnpm dev

# Test with MCP Inspector
npx @modelcontextprotocol/inspector node build/index.js
```

## Testing

The project uses Vitest.

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage

# Run the end-to-end protocol smoke suite (builds first, then drives the
# built server over stdio against a local mock ADS API)
pnpm test:e2e
```

The e2e suite (`test/e2e/protocol.test.ts`) spawns `node build/index.js`,
connects a real MCP client over stdio, and asserts the live tool/prompt/
resource surface plus one canned call per tool. It points the server at a
local mock via the `SCIX_API_BASE` environment variable (see below); no real
network access is required.

### Test Structure

Tests are organized in the `test/` directory:

```
test/
├── helpers/
│   └── mockFetch.ts        # Fetch mocking utilities
├── client.test.ts          # HTTP client tests
├── search-docs.test.ts     # Documentation search tests
└── tools/
    ├── search.test.ts      # Search tool tests
    ├── paper.test.ts       # Paper details tests
    ├── metrics.test.ts     # Metrics tests
    ├── citations.test.ts   # Citations/references tests
    ├── export.test.ts      # Export tests
    └── library.test.ts     # Library management tests
```

### Test Coverage

The test suite covers:

- **HTTP Client**: GET/POST/PUT/DELETE methods, error handling (401/404/429), timeouts, request formatting
- **Search Tools**: Query parameter encoding, pagination, result limiting, response formatting
- **Paper Tools**: Bibcode validation, field selection, error handling for missing papers
- **Metrics Tools**: Batch bibcode processing, MAX_BIBCODES limits, metric type selection
- **Citation Tools**: Forward/backward citations, sorting, row limits
- **Export Tools**: Multiple export formats (BibTeX, AASTeX, EndNote, etc.), batch processing
- **Library Tools**: All CRUD operations, permissions, annotations, library operations

### API Token for Tests

Tests use mock fetch and don't require a real API token. Individual tests set `SCIX_API_TOKEN='test-api-key'` as needed.

## Project Structure

```
src/
├── index.ts             # Main server entry point
├── client.ts            # SciX API client wrapper
├── types.ts             # TypeScript/Zod type definitions
├── formatters.ts        # Response formatting utilities
├── config.ts            # Configuration constants
├── identifier-query.ts  # Identifier (bibcode/DOI/arXiv/SciX) resolution
├── search-docs.ts       # Offline docs search (search_docs tool)
└── tools/
    ├── search.ts        # Search tool
    ├── paper.ts         # Paper details tool
    ├── metrics.ts       # Metrics tool
    ├── citations.ts     # Citation network tools
    ├── export.ts        # Export tool
    └── library.ts       # Library management tools
```

## Example Usage

### Search for papers

```
Use search with query "supernova 2023" to find recent supernova papers
```

### Get paper details

```
Use get_paper with bibcode "2023ApJ...950..123S"
```

### Calculate metrics

```
Use get_metrics with bibcodes ["2023ApJ...950..123S", "2022MNRAS.517.1234T"]
```

### Export citations

```
Use export with bibcodes ["2023ApJ...950..123S"] and format "bibtex"
```

## Error Handling

The server provides clear error messages:

- **401**: Token missing or rejected - check `SCIX_API_TOKEN` (stdio) or the
  `Authorization: Bearer` header (HTTP)
- **404**: Resource not found - check bibcode format
- **429**: Rate limit exceeded - wait until reset
- **Timeout**: Request took > 30 seconds

## Resources

- [SciX Homepage](https://scixplorer.org/)
- [SciX API Documentation](https://github.com/adsabs/adsabs-dev-api)
- [SciX Search Syntax](https://adsabs.github.io/help/search/search-syntax)
- [MCP Documentation](https://modelcontextprotocol.io/)

## License

MIT

## Support

For API issues: adshelp@cfa.harvard.edu
For server issues: Open an issue on GitHub
