import { describe, it, expect, afterEach } from 'vitest';
import { SciXAPIClient } from '../../src/client.js';
import { isAPIKeyConfigured } from '../../src/config.js';
import {
  setupMockFetch,
  restoreFetch,
  createNetworkErrorFetch
} from '../helpers/mockFetch.js';
import { healthCheck, HealthCheckContext } from '../../src/tools/health.js';
import { HealthReport, ResponseFormat } from '../../src/types.js';

function makeContext(overrides: Partial<HealthCheckContext> = {}): HealthCheckContext {
  return {
    serverName: 'scix-mcp',
    serverVersion: '9.9.9',
    toolNames: ['search', 'health_check'],
    tokenConfigured: isAPIKeyConfigured(),
    createClient: () => new SciXAPIClient(),
    ...overrides
  };
}

function parseReport(json: string): HealthReport {
  return JSON.parse(json) as HealthReport;
}

describe('health_check tool', () => {
  const originalToken = process.env.SCIX_API_TOKEN;

  afterEach(() => {
    restoreFetch();
    if (originalToken === undefined) {
      delete process.env.SCIX_API_TOKEN;
    } else {
      process.env.SCIX_API_TOKEN = originalToken;
    }
  });

  it('reports probe ok when the token is present and the API answers', async () => {
    process.env.SCIX_API_TOKEN = 'test-api-key';
    const mockFetch = setupMockFetch({
      body: { response: { numFound: 1, docs: [{ id: '1' }] } }
    });

    const report = parseReport(
      await healthCheck(makeContext(), { response_format: ResponseFormat.JSON })
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('search/query');
    expect(url).toContain('rows=1');
    expect(report.token_configured).toBe(true);
    expect(report.probe.state).toBe('ok');
    expect(report.server).toEqual({ name: 'scix-mcp', version: '9.9.9' });
    expect(report.tools).toEqual(['health_check', 'search']);
  });

  it('skips the probe and does not throw when the token is missing', async () => {
    delete process.env.SCIX_API_TOKEN;
    const mockFetch = setupMockFetch({ body: {} });

    const report = parseReport(
      await healthCheck(makeContext(), { response_format: ResponseFormat.JSON })
    );

    expect(mockFetch).not.toHaveBeenCalled();
    expect(report.token_configured).toBe(false);
    expect(report.probe.state).toBe('skipped');
  });

  // Diverges tokenConfigured from the env var so the report provably follows
  // the context field, as the HTTP transport does, not the process env.
  it('runs the probe on an injected token when the env var is absent', async () => {
    delete process.env.SCIX_API_TOKEN;
    const mockFetch = setupMockFetch({
      body: { response: { numFound: 1, docs: [{ id: '1' }] } }
    });

    const report = parseReport(
      await healthCheck(
        makeContext({
          tokenConfigured: true,
          createClient: () => new SciXAPIClient({ token: 'caller-token' })
        }),
        { response_format: ResponseFormat.JSON }
      )
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(report.token_configured).toBe(true);
    expect(report.probe.state).toBe('ok');
  });

  it('skips the probe when the context reports no token despite the env var', async () => {
    process.env.SCIX_API_TOKEN = 'ignored-by-context';
    const mockFetch = setupMockFetch({ body: {} });

    const report = parseReport(
      await healthCheck(makeContext({ tokenConfigured: false }), {
        response_format: ResponseFormat.JSON
      })
    );

    expect(mockFetch).not.toHaveBeenCalled();
    expect(report.token_configured).toBe(false);
    expect(report.probe.state).toBe('skipped');
  });

  it('classifies a 401 probe response as unauthorized with a message', async () => {
    process.env.SCIX_API_TOKEN = 'bad-token';
    setupMockFetch({ status: 401, statusText: 'Unauthorized', body: {} });

    const report = parseReport(
      await healthCheck(makeContext(), { response_format: ResponseFormat.JSON })
    );

    expect(report.probe.state).toBe('unauthorized');
    expect(report.probe.message).toContain('Authentication failed');
  });

  it('classifies a network failure as unreachable', async () => {
    process.env.SCIX_API_TOKEN = 'test-api-key';
    global.fetch = createNetworkErrorFetch() as unknown as typeof fetch;

    const report = parseReport(
      await healthCheck(makeContext(), { response_format: ResponseFormat.JSON })
    );

    expect(report.probe.state).toBe('unreachable');
    expect(report.probe.message).toContain('Network error');
  });

  it('renders markdown with identity, probe state, and tool list', async () => {
    process.env.SCIX_API_TOKEN = 'test-api-key';
    setupMockFetch({ body: { response: { numFound: 1, docs: [] } } });

    const result = await healthCheck(makeContext(), {
      response_format: ResponseFormat.MARKDOWN
    });

    expect(result).toContain('# SciX MCP Health Check');
    expect(result).toContain('scix-mcp v9.9.9');
    expect(result).toContain('https://api.adsabs.harvard.edu/v1');
    expect(result).toContain('**Auth probe:** ok');
    expect(result).toContain('`health_check`');
  });

  it('never leaks the token value in either output format', async () => {
    const secret = 'super-secret-token-value';
    process.env.SCIX_API_TOKEN = secret;
    setupMockFetch({ body: { response: { numFound: 1, docs: [] } } });

    const json = await healthCheck(makeContext(), {
      response_format: ResponseFormat.JSON
    });
    const markdown = await healthCheck(makeContext(), {
      response_format: ResponseFormat.MARKDOWN
    });

    expect(json).not.toContain(secret);
    expect(markdown).not.toContain(secret);
    expect(json.toLowerCase()).not.toContain('authorization');
  });
});
