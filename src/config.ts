import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SERVER_NAME = 'scix-mcp';

// Carried into the outbound User-Agent so ADS access logs can separate the
// hosted deployment from individual stdio users.
export type TransportKind = 'stdio' | 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// build/config.js sits inside build/, so ../package.json resolves to the
// package root both in the built tree and after npm install.
export function readServerVersion(): string {
  const pkgPath = path.join(__dirname, '..', 'package.json');
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read version from ${pkgPath}: ${message}`);
  }
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'version' in parsed &&
    typeof parsed.version === 'string'
  ) {
    return parsed.version;
  }
  throw new Error(`Could not read version from ${pkgPath}`);
}

export function buildUserAgent(transport: TransportKind): string {
  if (!cachedVersion) {
    cachedVersion = readServerVersion();
  }
  return `${SERVER_NAME}/${cachedVersion} (transport=${transport})`;
}

// Memoized so the HTTP transport, which builds a client per request, does not
// re-read package.json on every call.
let cachedVersion: string | undefined;

// Blank/unset SCIX_API_BASE falls back to the production API rather than
// throwing from `new URL(...)` on an empty string.
const configuredBase = process.env.SCIX_API_BASE?.trim();
export const SCIX_API_BASE =
  configuredBase && configuredBase.length > 0
    ? configuredBase
    : 'https://api.adsabs.harvard.edu/v1';

export const DEFAULT_FIELDS = [
  'bibcode',
  'title',
  'author',
  'year',
  'pubdate',
  'abstract',
  'citation_count',
  'read_count',
  'doi',
  'pub',
  'volume',
  'page',
  'keyword',
  'aff',
  'identifier'
];

export const RATE_LIMIT = {
  REQUESTS_PER_DAY: 5000,
  HEADERS: {
    LIMIT: 'X-RateLimit-Limit',
    REMAINING: 'X-RateLimit-Remaining',
    RESET: 'X-RateLimit-Reset'
  }
};

export const REQUEST_TIMEOUT = 30000;

// Mirrors getAPIKey's non-empty/trim check without throwing, so callers (e.g.
// health_check) can gate on presence instead of catching.
export function isAPIKeyConfigured(): boolean {
  const key = process.env.SCIX_API_TOKEN;
  return typeof key === 'string' && key.trim() !== '';
}

export function getAPIKey(): string {
  const key = process.env.SCIX_API_TOKEN;

  if (!key || key.trim() === '') {
    throw new Error(
      'SCIX_API_TOKEN environment variable is not set. ' +
      'Get your API key from https://scixplorer.org/user/settings/token'
    );
  }

  return key.trim();
}

export const MAX_BIBCODES = 2000;

export const MAX_ROWS = 100;
