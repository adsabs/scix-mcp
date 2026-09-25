import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  StdioClientTransport,
  getDefaultEnvironment
} from '@modelcontextprotocol/sdk/client/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { startMockAdsServer, type MockAdsServer } from '../helpers/mock-ads-server.js';

// Connects a real MCP client to the *built* server over stdio: guards the
// drift bug class where the runtime tool list diverges from source, invisible
// to unit tests that call handlers directly. See backlog issue 12 (Layer 1).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const serverEntry = path.join(repoRoot, 'build', 'index.js');

// Kept as a literal so any addition/removal in src/index.ts fails loudly.
const EXPECTED_TOOLS = [
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
  'health_check'
].sort();

const EXPECTED_PROMPTS = [
  'search-workflow',
  'library-management',
  'citation-analysis',
  'export-bibliography',
  'best-practices'
].sort();

const USAGE_GUIDE_URI = 'scix://usage-guide';

interface ToolCase {
  name: string;
  args: Record<string, unknown>;
  marker: string;
}

const TOOL_CASES: ToolCase[] = [
  { name: 'search', args: { query: 'star' }, marker: 'Smoke Test Paper Alpha' },
  { name: 'get_paper', args: { bibcode: '2024SmokeT..42A' }, marker: '# Smoke Test Paper Alpha' },
  { name: 'get_metrics', args: { bibcodes: ['2024SmokeT..42A'] }, marker: 'Citation Metrics' },
  { name: 'get_citations', args: { bibcode: '2024SmokeT..42A' }, marker: 'Papers citing 2024SmokeT..42A' },
  { name: 'get_references', args: { bibcode: '2024SmokeT..42A' }, marker: 'Papers referenced by 2024SmokeT..42A' },
  { name: 'export', args: { bibcodes: ['2024SmokeT..42A'], format: 'bibtex' }, marker: '@ARTICLE{smoke2024' },
  { name: 'get_libraries', args: {}, marker: 'Smoke Library' },
  { name: 'get_library', args: { library_id: 'smokeLibId' }, marker: 'Smoke Library Detail' },
  { name: 'create_library', args: { name: 'My Library' }, marker: 'Created Smoke Library' },
  { name: 'delete_library', args: { library_id: 'smokeLibId' }, marker: 'deleted successfully' },
  { name: 'edit_library', args: { library_id: 'smokeLibId', name: 'Renamed' }, marker: 'Edited Smoke Library' },
  { name: 'manage_documents', args: { library_id: 'smokeLibId', bibcodes: ['2024SmokeT..42A'], action: 'add' }, marker: 'added to library successfully' },
  { name: 'add_documents_by_query', args: { library_id: 'smokeLibId', query: 'star' }, marker: 'Documents added to library from query' },
  { name: 'library_operation', args: { library_id: 'smokeLibId', operation: 'union', source_library_ids: ['otherLibId'] }, marker: 'completed successfully' },
  { name: 'get_permissions', args: { library_id: 'smokeLibId' }, marker: 'Library Permissions' },
  { name: 'update_permissions', args: { library_id: 'smokeLibId', email: 'collab@example.com', permission: 'read' }, marker: 'Permissions updated successfully' },
  { name: 'transfer_library', args: { library_id: 'smokeLibId', email: 'newowner@example.com' }, marker: 'transferred successfully' },
  { name: 'get_annotation', args: { library_id: 'smokeLibId', bibcode: '2024SmokeT..42A' }, marker: 'Smoke annotation body' },
  { name: 'manage_annotation', args: { library_id: 'smokeLibId', bibcode: '2024SmokeT..42A', content: 'a note' }, marker: 'Annotation saved successfully' },
  { name: 'delete_annotation', args: { library_id: 'smokeLibId', bibcode: '2024SmokeT..42A' }, marker: 'Annotation deleted successfully' },
  { name: 'search_docs', args: { query: 'search syntax' }, marker: 'Documentation Search Results' },
  { name: 'health_check', args: {}, marker: 'Auth probe:** ok' }
];

function firstText(result: CallToolResult): string {
  const [content] = result.content;
  if (!content || content.type !== 'text') {
    throw new Error('Expected the first content block to be text');
  }
  return content.text;
}

describe('MCP protocol smoke suite (stdio against build/index.js)', () => {
  let mock: MockAdsServer;
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    mock = await startMockAdsServer();

    transport = new StdioClientTransport({
      command: process.execPath,
      args: [serverEntry],
      cwd: repoRoot,
      env: {
        ...getDefaultEnvironment(),
        SCIX_API_TOKEN: 'test',
        SCIX_API_BASE: mock.url
      }
    });

    client = new Client({ name: 'smoke-suite', version: '0.0.0' });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client?.close();
    await transport?.close();
    await mock?.close();
  });

  it('lists exactly the expected tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(EXPECTED_TOOLS);
  });

  it('lists exactly the expected prompts', async () => {
    const { prompts } = await client.listPrompts();
    const names = prompts.map((p) => p.name).sort();
    expect(names).toEqual(EXPECTED_PROMPTS);
  });

  it('exposes the usage-guide resource', async () => {
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri);
    expect(uris).toContain(USAGE_GUIDE_URI);
  });

  it('resolves a prompt to non-empty text in the built layout', async () => {
    const prompt = await client.getPrompt({ name: 'search-workflow' });
    const [message] = prompt.messages;
    expect(message.content.type).toBe('text');
    const text = message.content.type === 'text' ? message.content.text : '';
    expect(text.trim().length).toBeGreaterThan(0);
  });

  it('reads the usage-guide resource to non-empty text', async () => {
    const resource = await client.readResource({ uri: USAGE_GUIDE_URI });
    const [content] = resource.contents;
    const text = typeof content?.text === 'string' ? content.text : '';
    expect(text.trim().length).toBeGreaterThan(0);
  });

  it.each(TOOL_CASES)('calls $name and returns its expected marker', async ({ name, args, marker }) => {
    const result = (await client.callTool({ name, arguments: args })) as CallToolResult;
    expect(result.isError ?? false).toBe(false);
    expect(firstText(result)).toContain(marker);
  });

  it('covers every registered tool with a call case', async () => {
    const covered = TOOL_CASES.map((c) => c.name).sort();
    expect(covered).toEqual(EXPECTED_TOOLS);
  });
});
