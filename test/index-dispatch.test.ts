import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/index.js';
import { setupMockFetch, restoreFetch } from './helpers/mockFetch.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const usageGuidePath = path.join(__dirname, '..', 'USAGE_GUIDE.md');
const promptsDir = path.join(__dirname, '..', 'prompts');

const EXPECTED_TOOL_NAMES = [
  'search',
  'get_paper',
  'get_metrics',
  'get_citations',
  'get_references',
  'export',
  'get_libraries',
  'get_library',
  'create_library',
  'delete_library',
  'edit_library',
  'manage_documents',
  'add_documents_by_query',
  'library_operation',
  'get_permissions',
  'update_permissions',
  'transfer_library',
  'get_annotation',
  'manage_annotation',
  'delete_annotation',
  'search_docs',
  'health_check',
];

const EXPECTED_PROMPT_NAMES = [
  'search-workflow',
  'library-management',
  'citation-analysis',
  'export-bibliography',
  'best-practices',
];

async function connectClient() {
  const server = createServer();
  const client = new Client({ name: 'test-client', version: '1.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.server.connect(serverTransport)]);
  return { client, server };
}

function callText(result: { content: Array<{ text?: string }> }): string {
  return result.content.map((c) => c.text ?? '').join('\n');
}

describe('index server (McpServer over InMemoryTransport)', () => {
  const originalToken = process.env.SCIX_API_TOKEN;

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.SCIX_API_TOKEN;
    } else {
      process.env.SCIX_API_TOKEN = originalToken;
    }
    restoreFetch();
  });

  describe('tools/list parity', () => {
    it('advertises exactly the expected set of tools through tools/list', async () => {
      const { client } = await connectClient();
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name).sort();
      expect(names).toEqual([...EXPECTED_TOOL_NAMES].sort());
    });

    it('advertises accepted id types in the id-based tool descriptions', async () => {
      const { client } = await connectClient();
      const { tools } = await client.listTools();
      for (const name of ['get_paper', 'get_citations', 'get_references']) {
        const description = tools.find((t) => t.name === name)?.description ?? '';
        expect(description, name).toMatch(/DOI/i);
        expect(description, name).toMatch(/arxiv/i);
        expect(description, name).toMatch(/scix/i);
      }
    });

    it('preserves tool annotations (e.g. delete_library is destructive)', async () => {
      const { client } = await connectClient();
      const { tools } = await client.listTools();
      const deleteLibrary = tools.find((t) => t.name === 'delete_library');
      expect(deleteLibrary?.annotations?.destructiveHint).toBe(true);
      const search = tools.find((t) => t.name === 'search');
      expect(search?.annotations?.readOnlyHint).toBe(true);
    });
  });

  describe('unknown tool', () => {
    it('surfaces an unknown tool name as an error result', async () => {
      process.env.SCIX_API_TOKEN = 'test-api-key';
      const { client } = await connectClient();
      const result = await client.callTool({ name: 'does_not_exist', arguments: {} });
      expect(result.isError).toBe(true);
      expect(callText(result as { content: Array<{ text?: string }> })).toMatch(/not found/i);
    });
  });

  describe('API error surfacing', () => {
    it('surfaces a mapped API error as isError with the Error: prefix', async () => {
      process.env.SCIX_API_TOKEN = 'test-api-key';
      setupMockFetch({ status: 401, statusText: 'Unauthorized', body: {} });
      const { client } = await connectClient();
      const result = await client.callTool({
        name: 'get_paper',
        arguments: { bibcode: '2024ApJ...123..456A' },
      });
      expect(result.isError).toBe(true);
      const text = callText(result as { content: Array<{ text?: string }> });
      expect(text).toContain('Error:');
      expect(text).toContain('Authentication failed');
    });
  });

  describe('missing SCIX_API_TOKEN', () => {
    it('does not throw at server construction when the token is unset', () => {
      delete process.env.SCIX_API_TOKEN;
      expect(() => createServer()).not.toThrow();
    });

    it('surfaces a missing token as a graceful tool error, not a crash', async () => {
      delete process.env.SCIX_API_TOKEN;
      const { client } = await connectClient();
      const result = await client.callTool({
        name: 'search',
        arguments: { query: 'black holes' },
      });
      expect(result.isError).toBe(true);
      expect(callText(result as { content: Array<{ text?: string }> })).toContain('SCIX_API_TOKEN');
    });

    it('runs the local search_docs tool without a token', async () => {
      delete process.env.SCIX_API_TOKEN;
      const { client } = await connectClient();
      const result = await client.callTool({
        name: 'search_docs',
        arguments: { query: 'author search', limit: 3 },
      });
      expect(result.isError).toBeFalsy();
      expect(callText(result as { content: Array<{ text?: string }> })).toContain(
        'SciX Documentation Search Results'
      );
    });
  });

  describe('export custom_format refinement', () => {
    it('rejects format=custom without custom_format through validation', async () => {
      process.env.SCIX_API_TOKEN = 'test-api-key';
      const { client } = await connectClient();
      const result = await client.callTool({
        name: 'export',
        arguments: { bibcodes: ['2024ApJ...123..456A'], format: 'custom' },
      });
      expect(result.isError).toBe(true);
      expect(callText(result as { content: Array<{ text?: string }> })).toContain('custom_format');
    });
  });

  describe('prompts', () => {
    it('lists all five prompts with descriptions', async () => {
      const { client } = await connectClient();
      const { prompts } = await client.listPrompts();
      const names = prompts.map((p) => p.name).sort();
      expect(names).toEqual([...EXPECTED_PROMPT_NAMES].sort());
      for (const prompt of prompts) {
        expect(typeof prompt.description).toBe('string');
        expect((prompt.description ?? '').length).toBeGreaterThan(0);
      }
    });

    it('serves prompt bodies verbatim through prompts/get', async () => {
      const { client } = await connectClient();
      const search = await client.getPrompt({ name: 'search-workflow' });
      const text = search.messages.map((m) => (m.content as { text?: string }).text ?? '').join('');
      expect(text).toContain('# SciX Literature Search Guide');
      expect(text).toContain('read_count desc');

      const exportPrompt = await client.getPrompt({ name: 'export-bibliography' });
      const exportText = exportPrompt.messages
        .map((m) => (m.content as { text?: string }).text ?? '')
        .join('');
      expect(exportText).toContain('# SciX Bibliography Export Guide');
    });

    it('serves every prompt byte-identical to its prompts/<id>.md file', async () => {
      const { client } = await connectClient();
      for (const name of EXPECTED_PROMPT_NAMES) {
        const prompt = await client.getPrompt({ name });
        const served = prompt.messages
          .map((m) => (m.content as { text?: string }).text ?? '')
          .join('');
        const onDisk = await readFile(path.join(promptsDir, `${name}.md`), 'utf-8');
        expect(served, name).toBe(onDisk);
      }
    });
  });

  describe('usage-guide resource', () => {
    it('lists the scix://usage-guide resource', async () => {
      const { client } = await connectClient();
      const { resources } = await client.listResources();
      const guide = resources.find((r) => r.uri === 'scix://usage-guide');
      expect(guide).toBeDefined();
      expect(guide?.mimeType).toBe('text/markdown');
    });

    it('serves the usage guide byte-identical to USAGE_GUIDE.md', async () => {
      const { client } = await connectClient();
      const result = await client.readResource({ uri: 'scix://usage-guide' });
      const served = (result.contents[0] as { text?: string }).text ?? '';
      const onDisk = await readFile(usageGuidePath, 'utf-8');
      expect(served).toBe(onDisk);
    });
  });
});
