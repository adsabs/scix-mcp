import { SciXAPIClient, SciXAPIError } from '../client.js';
import { SCIX_API_BASE, REQUEST_TIMEOUT } from '../config.js';
import {
  HealthCheckInput,
  HealthProbeResult,
  HealthReport,
  ResponseFormat
} from '../types.js';
import { formatHealthCheckMarkdown } from '../formatters.js';

export interface HealthCheckContext {
  serverName: string;
  serverVersion: string;
  toolNames: string[];
  // From the environment (stdio) or the caller's Authorization header (HTTP).
  tokenConfigured: boolean;
  createClient: () => SciXAPIClient;
}

function classifyProbeError(error: unknown): HealthProbeResult {
  if (error instanceof SciXAPIError) {
    if (error.status === 401) {
      return { state: 'unauthorized', message: error.message };
    }
    if (error.status === 429) {
      return { state: 'rate_limited', message: error.message };
    }
    return { state: 'unreachable', message: error.message };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { state: 'unreachable', message };
}

async function runProbe(context: HealthCheckContext): Promise<HealthProbeResult> {
  if (!context.tokenConfigured) {
    return {
      state: 'skipped',
      message: 'No SciX API token is available; skipped the authenticated probe.'
    };
  }
  // A hung API surfaces as `unreachable` after the client's REQUEST_TIMEOUT.
  try {
    const client = context.createClient();
    await client.get('search/query', { q: '*:*', rows: 1, fl: 'id' });
    return { state: 'ok' };
  } catch (error) {
    return classifyProbeError(error);
  }
}

export async function healthCheck(
  context: HealthCheckContext,
  input: HealthCheckInput
): Promise<string> {
  const probe = await runProbe(context);
  const report: HealthReport = {
    server: { name: context.serverName, version: context.serverVersion },
    api_base: SCIX_API_BASE,
    token_configured: context.tokenConfigured,
    probe,
    tools: [...context.toolNames].sort()
  };

  if (input.response_format === ResponseFormat.JSON) {
    return JSON.stringify(report, null, 2);
  }

  return formatHealthCheckMarkdown(report, REQUEST_TIMEOUT);
}
