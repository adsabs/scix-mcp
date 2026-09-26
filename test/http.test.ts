import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import {
  startMockAdsServer,
  type MockAdsServer,
  type RecordedRequest
} from './helpers/mock-ads-server.js';

const PROTOCOL_VERSION = '2025-06-18';

const INITIALIZE = {
  jsonrpc: '2.0' as const,
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: 'test-client', version: '0.0.0' }
  }
};

let server: Server;
let baseUrl: string;
let mockAds: MockAdsServer;
const originalApiBase = process.env.SCIX_API_BASE;
const originalToken = process.env.SCIX_API_TOKEN;

async function post(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...headers
    },
    body: JSON.stringify(body)
  });
}

function authed(token = 'caller-token'): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

beforeAll(async () => {
  mockAds = await startMockAdsServer();
  process.env.SCIX_API_BASE = mockAds.url;
  delete process.env.SCIX_API_TOKEN;

  // Imported after the env is set: config.ts resolves SCIX_API_BASE at module
  // load, so a static import here would pin the production base URL.
  const { startHttpServer } = await import('../src/http.js');

  server = startHttpServer(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await mockAds.close();
  if (originalApiBase === undefined) {
    delete process.env.SCIX_API_BASE;
  } else {
    process.env.SCIX_API_BASE = originalApiBase;
  }
  if (originalToken !== undefined) {
    process.env.SCIX_API_TOKEN = originalToken;
  }
});

afterEach(() => {
  mockAds.reset();
});

describe('HTTP transport', () => {
  it('serves an unauthenticated health endpoint', async () => {
    const response = await fetch(`${baseUrl}/healthz`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ok', server: 'scix-mcp' });
  });

  it('rejects an MCP request with no Authorization header', async () => {
    const response = await post(INITIALIZE);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.message).toContain('Authorization');
  });

  it('rejects a malformed Authorization header', async () => {
    const response = await post(INITIALIZE, { Authorization: 'Basic abc' });

    expect(response.status).toBe(401);
  });

  it('rejects a Bearer header with an empty token', async () => {
    const response = await post(INITIALIZE, { Authorization: 'Bearer    ' });

    expect(response.status).toBe(401);
  });

  it('returns 400 on a malformed JSON body', async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...authed()
      },
      body: '{not json'
    });

    expect(response.status).toBe(400);
  });

  it('rejects GET and DELETE on the MCP path', async () => {
    const get = await fetch(`${baseUrl}/mcp`, { headers: authed() });
    const del = await fetch(`${baseUrl}/mcp`, { method: 'DELETE', headers: authed() });

    expect(get.status).toBe(405);
    expect(get.headers.get('allow')).toContain('POST');
    expect(del.status).toBe(405);
  });

  it('answers CORS preflight for browser clients', async () => {
    const response = await fetch(`${baseUrl}/mcp`, { method: 'OPTIONS' });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('access-control-allow-headers')).toContain('authorization');
  });

  // Regression: this target is accepted by Node but rejected by the WHATWG URL
  // parser. The parse ran before the try/catch, so one unauthenticated request
  // rejected the listener's promise and exited the whole process.
  it('survives a request target the URL parser rejects', async () => {
    const raw = await new Promise<string>((resolve, reject) => {
      let data = '';
      const socket = net.connect(
        Number((server.address() as AddressInfo).port),
        '127.0.0.1',
        () => socket.write('GET //[/ HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n')
      );
      socket.setTimeout(5000, () => reject(new Error('timed out')));
      socket.on('data', (chunk) => {
        data += chunk.toString();
      });
      socket.on('close', () => resolve(data));
      socket.on('error', reject);
    });

    expect(raw).toContain('400');

    // The point of the test: the process is still serving afterwards.
    const after = await fetch(`${baseUrl}/healthz`);
    expect(after.status).toBe(200);
  });

  it('404s an unknown path', async () => {
    const response = await fetch(`${baseUrl}/`);

    expect(response.status).toBe(404);
  });

  it('completes an initialize handshake and returns no session id', async () => {
    const response = await post(INITIALIZE, authed());

    expect(response.status).toBe(200);
    expect(response.headers.get('mcp-session-id')).toBeNull();
    const body = await response.json();
    expect(body.result.serverInfo.name).toBe('scix-mcp');
  });

  it('lists tools without a prior session', async () => {
    const response = await post(
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      authed()
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    const names = body.result.tools.map((tool: { name: string }) => tool.name);
    expect(names).toContain('search');
    expect(names).toContain('health_check');
  });

  // destructiveHint defaults to true in the MCP spec, so a `false` on a writing
  // tool is an affirmative safety claim that suppresses host approval prompts.
  // Only genuinely additive writes may make it.
  it('advertises every state-removing tool as destructive', async () => {
    const ADDITIVE_ONLY = ['create_library', 'add_documents_by_query'];

    const response = await post(
      { jsonrpc: '2.0', id: 8, method: 'tools/list', params: {} },
      authed()
    );
    const body = await response.json();

    type ToolEntry = {
      name: string;
      annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
    };
    const tools: ToolEntry[] = body.result.tools;
    expect(tools.length).toBeGreaterThan(0);

    const writers = tools.filter((tool) => tool.annotations?.readOnlyHint === false);
    const claimingSafe = writers
      .filter((tool) => tool.annotations?.destructiveHint === false)
      .map((tool) => tool.name)
      .sort();

    expect(claimingSafe).toEqual(ADDITIVE_ONLY.slice().sort());

    // Read-only tools must not also claim to write.
    for (const tool of tools) {
      if (tool.annotations?.readOnlyHint === true) {
        expect(tool.annotations.destructiveHint).toBe(false);
      }
    }
  });

  it('forwards the caller token to the SciX API and identifies itself', async () => {
    const response = await post(
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'search', arguments: { query: 'star' } }
      },
      authed('per-caller-token')
    );

    expect(response.status).toBe(200);
    const upstream = mockAds.requests.at(-1);
    expect(upstream?.headers.authorization).toBe('Bearer per-caller-token');
    expect(upstream?.headers['user-agent']).toMatch(/^scix-mcp\/\S+ \(transport=http\)$/);
  });

  // The pod has no SCIX_API_TOKEN (see beforeAll), so a truthful report here
  // can only come from the caller's header being threaded through.
  it('reports the header token as configured in health_check', async () => {
    const response = await post(
      {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'health_check',
          arguments: { response_format: 'json' }
        }
      },
      authed('health-probe-token')
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    const report = JSON.parse(body.result.content[0].text);
    expect(report.token_configured).toBe(true);
    expect(report.probe.state).toBe('ok');
    expect(JSON.stringify(report)).not.toContain('health-probe-token');
  });

  it('keeps tokens isolated across concurrent in-flight requests', async () => {
    // Correlated by the query string rather than array order: concurrent
    // requests can reach the mock in either order.
    const call = (token: string, query: string) =>
      post(
        {
          jsonrpc: '2.0',
          id: 6,
          method: 'tools/call',
          params: { name: 'search', arguments: { query } }
        },
        authed(token)
      );

    await Promise.all([call('concurrent-a', 'alpha'), call('concurrent-b', 'beta')]);

    const pairs = mockAds.requests.map((request: RecordedRequest) => [
      request.query?.includes('alpha') ? 'alpha' : 'beta',
      request.headers.authorization
    ]);

    expect(pairs).toHaveLength(2);
    expect(pairs).toContainEqual(['alpha', 'Bearer concurrent-a']);
    expect(pairs).toContainEqual(['beta', 'Bearer concurrent-b']);
  });

  // Two regressions in one disconnect: handleRequest() never settles once the
  // socket is gone (so the handler hung and lost its log line), and the
  // in-flight SciX call kept running against the caller's rate limit.
  it('cancels the upstream call and logs 499 when the caller disconnects', async () => {
    mockAds.setDelay(5000);
    const written: string[] = [];
    const writeSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: unknown) => {
        written.push(String(chunk));
        return true;
      });

    const abort = new AbortController();
    const pending = fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...authed()
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: { name: 'search', arguments: { query: 'slow' } }
      }),
      signal: abort.signal
    }).catch(() => undefined);

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(mockAds.requests).toHaveLength(1);
    abort.abort();
    await pending;

    // Both must happen well inside the mock's 5s delay and the 30s upstream
    // timeout: the log line proves the handler settled, the aborted upstream
    // socket proves the SciX call was actually cancelled.
    await vi.waitFor(
      () => {
        const entry = written.find((line) => line.includes('"status":499'));
        expect(entry).toBeDefined();
        expect(entry).toContain('"rpc_method":"tools/call"');
        expect(mockAds.aborted).toHaveLength(1);
        expect(mockAds.aborted[0].pathname).toBe('/search/query');
      },
      { timeout: 3000 }
    );

    writeSpy.mockRestore();
  });

  it('scopes tokens per request rather than reusing the first caller', async () => {
    const call = (token: string) =>
      post(
        {
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: { name: 'search', arguments: { query: 'star' } }
        },
        authed(token)
      );

    await call('token-a');
    await call('token-b');

    const seen = mockAds.requests.map((request: RecordedRequest) => request.headers.authorization);
    expect(seen).toEqual(['Bearer token-a', 'Bearer token-b']);
  });
});
