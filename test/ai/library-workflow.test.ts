import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMockAdsServer, type MockAdsServer } from '../helpers/mock-ads-server.js';
import { isAgentHarnessEnabled, runAgent, type AgentRun } from './helpers/run-agent.js';

const SMOKE_BIBCODE = '2024SmokeT..42A';
const FIRST_CREATED_ID = 'createdLibId1';
const MUTATING_TOOLS = [
  'create_library',
  'delete_library',
  'edit_library',
  'manage_documents',
  'add_documents_by_query',
  'library_operation',
  'update_permissions',
  'transfer_library',
  'manage_annotation',
  'delete_annotation'
];

function report(label: string, run: AgentRun): void {
  const calls = run.toolNames.length > 0 ? run.toolNames.join(' → ') : '(none)';
  console.log(`[${label}] ${run.turns} turns, $${run.costUsd.toFixed(4)}: ${calls}`);
}

describe.skipIf(!isAgentHarnessEnabled())('SciX MCP agent evals', () => {
  let mock: MockAdsServer;

  beforeAll(async () => {
    mock = await startMockAdsServer();
  });

  afterAll(async () => {
    await mock?.close();
  });

  it('puts the requested papers in the library it creates', async () => {
    mock.reset();

    const run = await runAgent({
      apiBase: mock.url,
      prompt:
        `Using the SciX tools, create a new private library named "Committee Demo" ` +
        `that contains the paper with bibcode ${SMOKE_BIBCODE}. ` +
        `Then tell me the library id and how many papers are in it.`
    });

    report('create-with-papers', run);

    expect(run.isError).toBe(false);
    expect(run.failedToolCalls).toEqual([]);
    expect(run.toolNames).toContain('create_library');

    const creates = mock.requests.filter(
      (request) => request.method === 'POST' && request.pathname === '/biblib/libraries'
    );
    expect(creates).toHaveLength(1);
    expect(mock.libraryDocuments(FIRST_CREATED_ID)).toEqual([SMOKE_BIBCODE]);
    expect(run.finalText).not.toMatch(/\b0 papers\b/i);
  });

  it('answers a read-only library question without mutating anything', async () => {
    mock.reset();

    const run = await runAgent({
      apiBase: mock.url,
      prompt:
        'Using the SciX tools, tell me which papers are already in my ' +
        '"Smoke Library Detail" library. Do not change anything.'
    });

    report('read-only', run);

    expect(run.isError).toBe(false);
    for (const tool of MUTATING_TOOLS) {
      expect(run.toolNames).not.toContain(tool);
    }
    expect(run.toolNames.some((name) => name === 'get_library' || name === 'get_libraries')).toBe(
      true
    );
    expect(run.finalText).toContain(SMOKE_BIBCODE);
  });

  it('reaches for get_metrics rather than search for a citation-count question', async () => {
    mock.reset();

    const run = await runAgent({
      apiBase: mock.url,
      prompt:
        `Using the SciX tools, what is the h-index and total citation count for ` +
        `the paper ${SMOKE_BIBCODE}?`
    });

    report('metrics-routing', run);

    expect(run.isError).toBe(false);
    expect(run.toolNames).toContain('get_metrics');
    expect(run.finalText).toMatch(/\b7\b/);
  });

  it('writes a note and reads back the content it just wrote', async () => {
    mock.reset();

    const run = await runAgent({
      apiBase: mock.url,
      prompt:
        `Using the SciX tools, attach the note "Key result for the committee" to ` +
        `paper ${SMOKE_BIBCODE} in library smokeLibId, then read the note back ` +
        `and tell me exactly what it says.`
    });

    report('annotation-round-trip', run);

    expect(run.isError).toBe(false);
    expect(run.failedToolCalls).toEqual([]);
    expect(run.toolNames).toContain('manage_annotation');
    expect(mock.noteContent('smokeLibId', SMOKE_BIBCODE)).toBe(
      'Key result for the committee'
    );
    expect(run.finalText).toContain('Key result for the committee');
  });

  it('adds query results to an existing library without creating a new one', async () => {
    mock.reset();

    const run = await runAgent({
      apiBase: mock.url,
      prompt:
        'Using the SciX tools, find papers matching the query "star" and add them ' +
        'to my existing library with id smokeLibId. Do not create a new library.'
    });

    report('add-to-existing', run);

    expect(run.isError).toBe(false);
    expect(run.toolNames).not.toContain('create_library');
    expect(
      run.toolNames.some((name) => name === 'add_documents_by_query' || name === 'manage_documents')
    ).toBe(true);
  });
});
