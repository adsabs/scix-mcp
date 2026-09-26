#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SciXAPIClient } from './client.js';
import {
  SERVER_NAME,
  TransportKind,
  isAPIKeyConfigured,
  readServerVersion
} from './config.js';
import { isDirectRun } from './is-direct-run.js';
import { search } from './tools/search.js';
import { getPaper } from './tools/paper.js';
import { getMetrics } from './tools/metrics.js';
import { getCitations, getReferences } from './tools/citations.js';
import { exportCitations } from './tools/export.js';
import { healthCheck } from './tools/health.js';
import { searchDocs } from './search-docs.js';
import { formatDocsSearchMarkdown } from './formatters.js';
import {
  getLibraries,
  getLibrary,
  createLibrary,
  deleteLibrary,
  editLibrary,
  manageDocuments,
  addDocumentsByQuery,
  libraryOperation,
  getPermissions,
  updatePermissions,
  transferLibrary,
  getAnnotation,
  manageAnnotation,
  deleteAnnotation
} from './tools/library.js';
import {
  SearchInputSchema,
  GetPaperInputSchema,
  MetricsInputSchema,
  CitationsInputSchema,
  ExportInputSchema,
  GetLibrariesInputSchema,
  GetLibraryInputSchema,
  CreateLibraryInputSchema,
  DeleteLibraryInputSchema,
  EditLibraryInputSchema,
  ManageDocumentsInputSchema,
  AddDocumentsByQueryInputSchema,
  LibraryOperationInputSchema,
  GetPermissionsInputSchema,
  UpdatePermissionsInputSchema,
  TransferLibraryInputSchema,
  GetAnnotationInputSchema,
  ManageAnnotationInputSchema,
  DeleteAnnotationInputSchema,
  SearchDocsInputSchema,
  HealthCheckInputSchema
} from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const usageGuidePath = path.join(__dirname, '..', 'USAGE_GUIDE.md');
const promptsDir = path.join(__dirname, '..', 'prompts');

function promptPath(id: string): string {
  return path.join(promptsDir, `${id}.md`);
}

function textResult(text: string): CallToolResult {
  return { content: [{ type: 'text', text }] };
}

function errorResult(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

export interface CreateServerOptions {
  // Falls back to SCIX_API_TOKEN when absent.
  apiToken?: string;
  transport?: TransportKind;
  signal?: AbortSignal;
}

export function createServer(options: CreateServerOptions = {}): McpServer {
  const serverVersion = readServerVersion();
  const server = new McpServer({
    name: SERVER_NAME,
    version: serverVersion,
  });

  // The SDK exposes no public accessor for registered tools, so track() wraps
  // each registerTool name to keep health_check's list from a second source
  // of truth that could drift.
  const toolNames: string[] = [];
  function track(name: string): string {
    toolNames.push(name);
    return name;
  }

  const tokenConfigured = options.apiToken?.trim() ? true : isAPIKeyConfigured();

  // Lazy so a missing/invalid SCIX_API_TOKEN surfaces as a tool error, not an
  // import-time crash.
  let cachedClient: SciXAPIClient | undefined;

  function getClient(): SciXAPIClient {
    if (!cachedClient) {
      cachedClient = new SciXAPIClient({
        token: options.apiToken,
        transport: options.transport,
        signal: options.signal
      });
    }
    return cachedClient;
  }

  server.registerTool(
    track('search'),
    {
      description: 'Search SciX for astronomical literature. Supports full Solr query syntax including author:"Last, F.", title:keyword, abstract:keyword, year:2020-2023, and Boolean operators (AND, OR, NOT).',
      inputSchema: SearchInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        const client = getClient();
        const result = await search(client, input);
        return textResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    track('get_paper'),
    {
      description: 'Get detailed information about a specific paper by identifier: bibcode, DOI, arXiv ID, or SciX ID (scix:...).',
      inputSchema: GetPaperInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        const client = getClient();
        const result = await getPaper(client, input);
        return textResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    track('get_metrics'),
    {
      description: 'Get citation metrics including h-index, citation counts, and paper statistics for a list of bibcodes.',
      inputSchema: MetricsInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        const client = getClient();
        const result = await getMetrics(client, input);
        return textResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    track('get_citations'),
    {
      description: 'Get papers that cite a given paper (forward citations). Accepts a bibcode, DOI, arXiv ID, or SciX ID.',
      inputSchema: CitationsInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        const client = getClient();
        const result = await getCitations(client, input);
        return textResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    track('get_references'),
    {
      description: 'Get papers referenced by a given paper (backward citations). Accepts a bibcode, DOI, arXiv ID, or SciX ID.',
      inputSchema: CitationsInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        const client = getClient();
        const result = await getReferences(client, input);
        return textResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    track('export'),
    {
      description: 'Export citations in 23 bibliographic formats (BibTeX, AASTeX, EndNote, IEEE, MNRAS, etc.) with support for custom formatting templates.',
      inputSchema: ExportInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        const client = getClient();
        const result = await exportCitations(client, input);
        return textResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    track('get_libraries'),
    {
      description: 'Get all libraries for the authenticated user. Can filter by type (all, owner, collaborator).',
      inputSchema: GetLibrariesInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        const client = getClient();
        const result = await getLibraries(client, input);
        return textResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    track('get_library'),
    {
      description: 'Get details about a specific library including metadata and list of documents.',
      inputSchema: GetLibraryInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        const client = getClient();
        const result = await getLibrary(client, input);
        return textResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    track('create_library'),
    {
      description: 'Create a new library with optional initial documents.',
      inputSchema: CreateLibraryInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        const client = getClient();
        const result = await createLibrary(client, input);
        return textResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    track('delete_library'),
    {
      description: 'Delete a library permanently.',
      inputSchema: DeleteLibraryInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        const client = getClient();
        const result = await deleteLibrary(client, input);
        return textResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    track('edit_library'),
    {
      description: 'Edit library metadata (name, description, public status). Overwrites the current values, and changing public status can expose a private library.',
      inputSchema: EditLibraryInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        const client = getClient();
        const result = await editLibrary(client, input);
        return textResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    track('manage_documents'),
    {
      description: 'Add or remove documents from a library. Removal discards the record of those documents in that library.',
      inputSchema: ManageDocumentsInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        const client = getClient();
        const result = await manageDocuments(client, input);
        return textResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    track('add_documents_by_query'),
    {
      description: 'Add documents to a library from a SciX search query.',
      inputSchema: AddDocumentsByQueryInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        const client = getClient();
        const result = await addDocumentsByQuery(client, input);
        return textResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    track('library_operation'),
    {
      description: 'Perform set operations on libraries (union, intersection, difference, copy, empty). The empty, difference and intersection actions replace or discard the contents of the target library.',
      inputSchema: LibraryOperationInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        const client = getClient();
        const result = await libraryOperation(client, input);
        return textResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    track('get_permissions'),
    {
      description: 'Get permission information for a library.',
      inputSchema: GetPermissionsInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        const client = getClient();
        const result = await getPermissions(client, input);
        return textResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    track('update_permissions'),
    {
      description: 'Grant or modify permissions for a user on a library. Can revoke access that an existing collaborator currently has.',
      inputSchema: UpdatePermissionsInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        const client = getClient();
        const result = await updatePermissions(client, input);
        return textResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    track('transfer_library'),
    {
      description: 'Transfer ownership of a library to another user. The current owner loses ownership and this server cannot undo it.',
      inputSchema: TransferLibraryInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        const client = getClient();
        const result = await transferLibrary(client, input);
        return textResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    track('get_annotation'),
    {
      description: 'Get annotation/note for a document in a library.',
      inputSchema: GetAnnotationInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        const client = getClient();
        const result = await getAnnotation(client, input);
        return textResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    track('manage_annotation'),
    {
      description: 'Add or update an annotation/note for a document in a library. Updating replaces the existing note content.',
      inputSchema: ManageAnnotationInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        const client = getClient();
        const result = await manageAnnotation(client, input);
        return textResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    track('delete_annotation'),
    {
      description: 'Delete an annotation/note for a document in a library.',
      inputSchema: DeleteAnnotationInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        const client = getClient();
        const result = await deleteAnnotation(client, input);
        return textResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    track('search_docs'),
    {
      description: 'Search SciX help documentation for information about search syntax, features, API usage, and best practices.',
      inputSchema: SearchDocsInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        const results = await searchDocs(input.query, input.limit);
        return textResult(formatDocsSearchMarkdown(results, input.query));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    track('health_check'),
    {
      description: 'Diagnose the SciX MCP server setup: reports server name and version, the API base URL, whether an API token is configured, an authentication probe result, and the registered tool names. Takes no required arguments. Use this to distinguish setup problems (missing/invalid token, unreachable API) from ordinary API errors.',
      inputSchema: HealthCheckInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        const result = await healthCheck(
          {
            serverName: SERVER_NAME,
            serverVersion,
            toolNames,
            tokenConfigured,
            createClient: getClient,
          },
          input
        );
        return textResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerPrompt(
    'search-workflow',
    {
      description: 'Guide for searching astronomical literature effectively using SciX search syntax, operators, and best practices.',
    },
    async () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: await readFile(promptPath('search-workflow'), 'utf-8'),
          },
        },
      ],
    })
  );

  server.registerPrompt(
    'library-management',
    {
      description: 'Workflows for creating, managing, and organizing paper collections in SciX libraries.',
    },
    async () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: await readFile(promptPath('library-management'), 'utf-8'),
          },
        },
      ],
    })
  );

  server.registerPrompt(
    'citation-analysis',
    {
      description: 'Techniques for analyzing citation metrics, h-index, and citation networks.',
    },
    async () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: await readFile(promptPath('citation-analysis'), 'utf-8'),
          },
        },
      ],
    })
  );

  server.registerPrompt(
    'export-bibliography',
    {
      description: 'Methods for exporting citations in various formats (BibTeX, AASTeX, EndNote, etc.).',
    },
    async () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: await readFile(promptPath('export-bibliography'), 'utf-8'),
          },
        },
      ],
    })
  );

  server.registerPrompt(
    'best-practices',
    {
      description: 'General best practices, performance tips, and error handling for the SciX MCP server.',
    },
    async () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: await readFile(promptPath('best-practices'), 'utf-8'),
          },
        },
      ],
    })
  );

  server.registerResource(
    'SciX Usage Guide',
    'scix://usage-guide',
    {
      description: 'Comprehensive guide for using the SciX MCP server: search syntax, workflows, tools reference, and best practices.',
      mimeType: 'text/markdown',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'text/markdown',
          text: await readFile(usageGuidePath, 'utf-8'),
        },
      ],
    })
  );

  return server;
}

async function main() {
  const server = createServer({ transport: 'stdio' });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('SciX MCP Server running on stdio');
}

if (isDirectRun(import.meta.url)) {
  main().catch((error) => {
    console.error('Server error:', error);
    process.exit(1);
  });
}
