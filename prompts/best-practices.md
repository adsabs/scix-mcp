# SciX MCP Server - Best Practices & Tips

## Core Concepts

**Bibcode**: Unique identifier format `YYYYJJJJJVVVVMPPPPA`
- YYYY = year
- JJJJJ = journal
- VVVV = volume
- M = section
- PPPP = page
- A = first author initial

Example: `2019ApJ...886..145M`

**Response Formats**: Most tools support:
- `markdown` (default) - Human-readable
- `json` - Machine-readable for programmatic use

## Performance Optimization

### Request Efficiency

1. **Limit results**: Use `rows` parameter appropriately
   - Don't request 100 results when you need 10
   - Default is usually sufficient

2. **Batch operations**: Combine multiple bibcodes in one request
   - `get_metrics` accepts up to 2000 bibcodes
   - `export` accepts up to 2000 bibcodes
   - More efficient than individual requests

3. **Cache bibcodes**: Store bibcodes for papers of interest
   - Metadata changes rarely
   - Avoids repeated searches

4. **Choose format wisely**:
   - Use `markdown` for human review
   - Use `json` only when parsing programmatically

### Large Result Sets

For pagination beyond 100 results:
- Use Solr `cursormark` pagination
- More stable than offset-based `start` parameter
- Set `cursormark=*` initially
- Use stable `sort`
- Loop until `nextCursorMark` repeats

For bulk queries:
- Use ADS BigQuery endpoint (not via this MCP server)
- Avoids thousands of individual `search` calls

## Error Handling

### Common Errors

**No results from search:**
- Try broader terms
- Remove filters
- Check spelling
- Verify field syntax (quotes, operators)

**Too many results:**
- Add field-specific filters
- Use Boolean operators
- Narrow year range
- Add `property:refereed`

**Invalid bibcode:**
- Use `search` to find correct bibcode first
- Verify format: YYYYJJJJJVVVVMPPPPA
- Check for typos

**Rate limits:**
- Default: 5000 requests/day per API key
- Contact adshelp@cfa.harvard.edu for higher limits
- Monitor rate limit headers in responses

## Rate Limits

- **Daily limit**: 5000 requests per API token
- Rate limit info returned in response headers
- Plan workflows to minimize requests
- Use batch operations when possible

## Security Best Practices

- Store API token in environment variables, not code
- Use `.env` files (not committed to git)
- Don't share API tokens
- Rotate tokens periodically

## Data Organization

### When to Use Libraries

Use libraries for:
- Reading lists
- Research collections
- Bibliographies in progress
- Collaborative projects
- Paper tracking

Don't use libraries for:
- One-time searches
- Quick lookups
- Throwaway queries

### Annotation Strategy

Good annotation practices:
- Summarize key findings
- Note methodology
- Record relevance to your research
- Track follow-up questions
- Max 10,000 characters per annotation

## Response Format Selection

**Use Markdown when:**
- Presenting to users
- Quick review needed
- Human readability priority

**Use JSON when:**
- Programmatic processing required
- Integrating with other tools
- Need full data structure
- Building automated workflows

## Bibcode Limits

Tool-specific limits:
- `search`: Max 100 rows per request
- `get_metrics`: 1-2000 bibcodes
- `export`: 1-2000 bibcodes
- `manage_documents`: 1-2000 bibcodes
- `add_documents_by_query`: Max 2000 rows

## Integration Tips

When building workflows:
1. **Always show bibcodes** in results for reference
2. **Explain search strategy** when refining queries
3. **Suggest related tools** (e.g., after search, offer metrics)
4. **Batch operations** for related actions
5. **Verify library operations** by checking contents after modifications

## Troubleshooting

**Resource not found (404):**
- Verify bibcode format and existence
- Use search to confirm paper exists

**Unauthorized (401):**
- On a local (stdio) server: check the SCIX_API_TOKEN environment variable
- On a hosted (HTTP) server: send `Authorization: Bearer <token>` with the
  request — the hosted server holds no token of its own
- Verify token is valid at scixplorer.org
- Run `health_check` to tell a setup problem from an API error

**Rate limit (429):**
- Wait until reset time (check headers)
- Reduce request frequency
- Batch operations more aggressively

**Timeout:**
- Requests timeout after 30 seconds
- Reduce result size (`rows` parameter)
- Try narrower query

## Support Resources

- **SciX Homepage**: https://scixplorer.org/
- **API Documentation**: https://github.com/adsabs/adsabs-dev-api
- **Search Syntax**: https://adsabs.github.io/help/search/search-syntax
- **API Issues**: adshelp@cfa.harvard.edu