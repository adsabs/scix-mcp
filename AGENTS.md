# Codex Agents

This file defines local agents for Codex. Each agent includes name, description, style, examples, and a raw config block for quick copy/paste.

---

## Base Agent

**Name**

`default`

**Description**

General-purpose assistant using my preferred coding style and explanation depth.

**Style**
- Language: TypeScript (prefer explicit types; use `unknown` over `any`)
- Imports: ESM `import { x } from 'lib'`
- Formatting: 2-space indent, trailing commas in objects/arrays
- Comments: concise inline comments only when needed
- Error handling: explicit `try/catch` with typed errors
- Markdown: **bold** for emphasis, `###` subsections, fenced code blocks
- Confirmation: before destructive actions (delete/overwrite/force operations), pause and ask the user to confirm

**Examples**
- Explain how to add Sentry metrics in Backbone.
- Give me a JSON schema for a user profile.

**Config**
```json
{
  "agent": "default"
}
```

---

## SciX MCP Agent

**Name**

`scix-mcp`

**Description**

Agent specialized for the SciX MCP server (search/metrics/libraries). Uses the server’s AI usage guide resource to steer tool calls.

**Style**
- Keep requests minimal and specific; prefer fielded queries (e.g., `author:"Last, F." AND year:2020-2024`).
- Default to `markdown` responses unless JSON is explicitly needed for automation.
- For pagination, increment `start` by `rows` and stop when `numFound` reached.
- Respect rate limits; batch bibcodes for metrics/export (up to 2000).
- Use `get_facets` to learn a result set's distribution, then narrow with `search`'s `filter_query` rather than guessing at constraints.
- When citing a record, link `https://scixplorer.org/abs/<bibcode>/abstract`; tool output already carries that link.
- When sharing library links, use `https://scixplorer.org/public-libraries/<library_id>` instead of ADS UI URLs.

**Examples**
- Find refereed dark matter lensing papers from 2022-2024 and summarize top 5.
- Get metrics for bibcodes [...], return JSON.
- Add papers by query `author:"Hubble, E." AND year:1920-1930` to library `<id>`.

**Config**
```json
{
  "mcpServers": {
    "scix": {
      "command": "npx",
      "args": ["scix-mcp"],
      "env": {
        "SCIX_API_TOKEN": "<your_scix_token>"
      }
    }
  }
}
```

---

### chrome-devtools-mcp

**What it is**  
`chrome-devtools-mcp` is a Model Context Protocol (MCP) server that lets an AI coding agent connect to and control a live Chrome browser through the Chrome DevTools Protocol. It provides full access to inspection, debugging, and automation features — powered by Puppeteer — allowing the agent to observe and interact with real browser state.

**Core capabilities**

- Record and analyze performance traces (LCP, layout, CPU, memory)
- Inspect DOM, network requests, and console output
- Take screenshots or DOM snapshots
- Navigate, click, type, and wait for async page events with stable automation

**When to use it**
Use `chrome-devtools-mcp` when you need:

- Deep inspection or debugging of a live web page or app
- Reliable automation that depends on real DOM or network conditions
- Performance profiling or runtime context that headless fetches can’t provide

Avoid it when:

- You only need lightweight HTTP requests or static content
- You don’t need real browser instrumentation or rendering context

**Repo:** [github.com/ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp)
