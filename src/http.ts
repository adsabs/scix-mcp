#!/usr/bin/env node

import {
  createServer as createNodeServer,
  IncomingMessage,
  Server,
  ServerResponse
} from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './index.js';
import { isDirectRun } from './is-direct-run.js';
import { SERVER_NAME, readServerVersion } from './config.js';

const MCP_PATH = '/mcp';
const HEALTH_PATH = '/healthz';
const DEFAULT_PORT = 8000;
const DEFAULT_HOST = '0.0.0.0';

const CLIENT_CLOSED_REQUEST = 499;

// Must exceed the ads-demo ingress-nginx upstream idle timeout (60s), or Node
// can close a socket nginx still considers reusable, surfacing as a 502
// (nginx won't retry the non-idempotent POST).
const KEEP_ALIVE_TIMEOUT_MS = 65_000;
const HEADERS_TIMEOUT_MS = 66_000;

// Generous for the largest tool input (2000 bibcodes); these are JSON-RPC
// envelopes, not uploads.
const MAX_BODY_BYTES = 4 * 1024 * 1024;

// Any origin is safe here: auth is a bearer header, never a cookie, so there
// is no ambient credential for a hostile page to ride on.
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization, mcp-protocol-version',
  'Access-Control-Max-Age': '86400'
};

class BodyTooLargeError extends Error {}

interface RequestLog {
  method: string;
  path: string;
  status: number;
  duration_ms: number;
  rpc_method?: string;
  request_id?: string;
}

function logRequest(entry: RequestLog): void {
  process.stdout.write(`${JSON.stringify({ ...entry, server: SERVER_NAME })}\n`);
}

function extractBearerToken(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization;
  if (!header) {
    return undefined;
  }
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  return token ? token : undefined;
}

// Node accepts request targets the WHATWG parser rejects ("GET //[/"), and this
// runs before any auth or routing, so an unguarded parse is an unauthenticated
// kill switch for the process.
function parsePath(rawUrl: string | undefined): string | undefined {
  try {
    return new URL(rawUrl ?? '/', 'http://localhost').pathname;
  } catch {
    return undefined;
  }
}

function rpcMethodOf(body: unknown): string | undefined {
  if (body && typeof body === 'object' && 'method' in body) {
    const method = (body as { method: unknown }).method;
    return typeof method === 'string' ? method : undefined;
  }
  return undefined;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new BodyTooLargeError(`Request body exceeds ${MAX_BODY_BYTES} bytes`);
    }
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  return raw ? JSON.parse(raw) : undefined;
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', ...CORS_HEADERS });
  res.end(JSON.stringify(payload));
}

function sendRpcError(res: ServerResponse, status: number, code: number, message: string): void {
  sendJson(res, status, { jsonrpc: '2.0', error: { code, message }, id: null });
}

// Rejecting a request without reading its body leaves Node draining whatever the
// client keeps sending, which bypasses MAX_BODY_BYTES entirely — an unauthorized
// caller can make us ingest and discard gigabytes. Answer, then hang up.
function rejectAndClose(res: ServerResponse, status: number, code: number, message: string): void {
  res.setHeader('Connection', 'close');
  res.writeHead(status, { 'Content-Type': 'application/json', ...CORS_HEADERS });
  // Destroyed only once the response has flushed, or the client loses it.
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }), () => {
    res.socket?.destroy();
  });
}

// Stateless: a fresh server and transport per POST, so any replica can answer
// any request without shared or ingress-pinned session state.
async function dispatchRpc(
  req: IncomingMessage,
  res: ServerResponse,
  token: string,
  body: unknown
): Promise<void> {
  // Aborted on caller disconnect so an abandoned query doesn't keep running
  // against the caller's rate limit.
  const cancelUpstream = new AbortController();

  const server = createServer({
    apiToken: token,
    transport: 'http',
    signal: cancelUpstream.signal
  });
  const transport = new StreamableHTTPServerTransport({
    // Plain JSON, not SSE: every tool call here is single-shot, and JSON
    // survives proxy buffering.
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });

  res.on('close', () => {
    if (!res.writableEnded) {
      cancelUpstream.abort();
    }
    void transport.close();
    void server.close();
  });

  for (const [name, value] of Object.entries(CORS_HEADERS)) {
    res.setHeader(name, value);
  }

  await server.connect(transport);

  // transport.handleRequest() never settles once the socket is gone; race it
  // against close so this handler doesn't hang forever and lose the log line.
  const clientGone = new Promise<void>((resolve) => res.once('close', () => resolve()));
  const handled = transport.handleRequest(req, res, body).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${JSON.stringify({ level: 'error', path: MCP_PATH, message })}\n`);
  });

  await Promise.race([handled, clientGone]);
}

async function handleMcpPost(
  req: IncomingMessage,
  res: ServerResponse
): Promise<string | undefined> {
  const token = extractBearerToken(req);
  if (!token) {
    rejectAndClose(
      res,
      401,
      -32001,
      'Missing or malformed Authorization header. Send "Authorization: Bearer <SciX API token>". ' +
        'Get a token from https://scixplorer.org/user/settings/token'
    );
    return undefined;
  }

  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    const tooLarge = error instanceof BodyTooLargeError;
    rejectAndClose(
      res,
      tooLarge ? 413 : 400,
      tooLarge ? -32600 : -32700,
      tooLarge ? 'Request body too large' : 'Request body is not valid JSON'
    );
    return undefined;
  }

  await dispatchRpc(req, res, token, body);
  return rpcMethodOf(body);
}

export function createRequestListener() {
  const version = readServerVersion();

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const startedAt = Date.now();
    const requestId = req.headers['x-request-id'];
    const path = parsePath(req.url);
    let rpcMethod: string | undefined;

    if (path === undefined) {
      sendJson(res, 400, { error: 'Malformed request target' });
      logRequest({
        method: req.method ?? 'UNKNOWN',
        path: 'malformed',
        status: res.statusCode,
        duration_ms: Date.now() - startedAt,
        request_id: typeof requestId === 'string' ? requestId : undefined
      });
      return;
    }

    try {
      if (req.method === 'OPTIONS' && path === MCP_PATH) {
        res.writeHead(204, CORS_HEADERS);
        res.end();
      } else if (req.method === 'GET' && path === HEALTH_PATH) {
        sendJson(res, 200, { status: 'ok', server: SERVER_NAME, version });
      } else if (req.method === 'POST' && path === MCP_PATH) {
        rpcMethod = await handleMcpPost(req, res);
      } else if (path === MCP_PATH) {
        // Stateless: no SSE stream to open, no session to delete.
        res.setHeader('Allow', 'POST, OPTIONS');
        rejectAndClose(res, 405, -32000, `${req.method} is not supported on ${MCP_PATH}`);
      } else {
        sendJson(res, 404, { error: 'Not found' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${JSON.stringify({ level: 'error', path, message })}\n`);
      if (!res.headersSent) {
        sendRpcError(res, 500, -32603, 'Internal server error');
      } else {
        res.end();
      }
    }

    logRequest({
      method: req.method ?? 'UNKNOWN',
      path,
      // nginx's convention for a caller that closed before a response was sent.
      status: res.writableEnded ? res.statusCode : CLIENT_CLOSED_REQUEST,
      duration_ms: Date.now() - startedAt,
      rpc_method: rpcMethod,
      request_id: typeof requestId === 'string' ? requestId : undefined
    });
  }

  // node:http ignores the promise a listener returns, so any rejection escaping
  // handle() would reach the unhandledRejection default and exit the process.
  return function requestListener(req: IncomingMessage, res: ServerResponse): void {
    void handle(req, res).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${JSON.stringify({ level: 'error', path: 'unhandled', message })}\n`);
      if (!res.headersSent) {
        sendRpcError(res, 500, -32603, 'Internal server error');
      } else if (!res.writableEnded) {
        res.end();
      }
    });
  };
}

export function startHttpServer(port = DEFAULT_PORT, host = DEFAULT_HOST): Server {
  const server = createNodeServer(createRequestListener());
  server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
  server.headersTimeout = HEADERS_TIMEOUT_MS;
  server.listen(port, host);
  return server;
}

function readPort(): number {
  const raw = process.env.PORT?.trim();
  if (!raw) {
    return DEFAULT_PORT;
  }
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${raw}`);
  }
  return port;
}

function main(): void {
  const port = readPort();
  const host = process.env.HOST?.trim() || DEFAULT_HOST;
  const server = startHttpServer(port, host);

  server.on('listening', () => {
    console.error(`SciX MCP Server listening on http://${host}:${port}${MCP_PATH}`);
  });

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      server.close(() => process.exit(0));
    });
  }
}

if (isDirectRun(import.meta.url)) {
  main();
}
