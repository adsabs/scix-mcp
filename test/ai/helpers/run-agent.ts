import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const serverEntry = path.join(repoRoot, 'build', 'index.js');

const SERVER_NAME = 'scix';
const TOOL_PREFIX = `mcp__${SERVER_NAME}__`;

const BLOCKED_TOOLS = [
  'Bash',
  'Edit',
  'Write',
  'NotebookEdit',
  'Task',
  'WebFetch',
  'WebSearch'
];

export interface AgentToolCall {
  name: string;
  input: Record<string, unknown>;
}

export interface AgentRun {
  toolCalls: AgentToolCall[];
  toolNames: string[];
  finalText: string;
  isError: boolean;
  failedToolCalls: string[];
  costUsd: number;
  turns: number;
  transcript: string;
}

export interface RunAgentOptions {
  prompt: string;
  apiBase: string;
  model?: string;
  budgetUsd?: number;
  timeoutMs?: number;
}

interface StreamEvent {
  type?: string;
  subtype?: string;
  message?: { content?: unknown };
  result?: unknown;
  is_error?: boolean;
  total_cost_usd?: number;
  num_turns?: number;
}

export function isAgentHarnessEnabled(): boolean {
  return process.env.SCIX_AI_EVALS === '1';
}

async function writeMcpConfig(dir: string, apiBase: string): Promise<string> {
  const configPath = path.join(dir, 'mcp-config.json');
  const config = {
    mcpServers: {
      [SERVER_NAME]: {
        command: process.execPath,
        args: [serverEntry],
        env: {
          SCIX_API_TOKEN: 'ai-eval-token',
          SCIX_API_BASE: apiBase
        }
      }
    }
  };

  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
  return configPath;
}

function collectToolCalls(content: unknown, into: AgentToolCall[]): void {
  if (!Array.isArray(content)) {
    return;
  }

  for (const block of content) {
    const entry = block as { type?: string; name?: string; input?: unknown };
    if (entry.type !== 'tool_use' || typeof entry.name !== 'string') {
      continue;
    }
    if (!entry.name.startsWith(TOOL_PREFIX)) {
      continue;
    }
    into.push({
      name: entry.name.slice(TOOL_PREFIX.length),
      input: (entry.input ?? {}) as Record<string, unknown>
    });
  }
}

function collectToolFailures(content: unknown, into: string[]): void {
  if (!Array.isArray(content)) {
    return;
  }

  for (const block of content) {
    const entry = block as { type?: string; is_error?: boolean; tool_use_id?: string };
    if (entry.type === 'tool_result' && entry.is_error === true) {
      into.push(entry.tool_use_id ?? 'unknown');
    }
  }
}

export async function runAgent({
  prompt,
  apiBase,
  model = 'haiku',
  budgetUsd = 0.5,
  timeoutMs = 180_000
}: RunAgentOptions): Promise<AgentRun> {
  const workDir = await mkdtemp(path.join(tmpdir(), 'scix-ai-eval-'));
  const configPath = await writeMcpConfig(workDir, apiBase);

  const args = [
    '-p',
    prompt,
    '--model',
    model,
    '--output-format',
    'stream-json',
    '--verbose',
    '--mcp-config',
    configPath,
    '--strict-mcp-config',
    '--permission-mode',
    'bypassPermissions',
    '--disallowedTools',
    BLOCKED_TOOLS.join(','),
    '--disable-slash-commands',
    '--max-budget-usd',
    String(budgetUsd)
  ];

  const child = spawn('claude', args, {
    cwd: workDir,
    env: { ...process.env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => stdoutChunks.push(chunk));
  child.stderr.on('data', (chunk: string) => stderrChunks.push(chunk));

  const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  }).finally(() => clearTimeout(timer));

  const transcript = stdoutChunks.join('');
  const toolCalls: AgentToolCall[] = [];
  const failedToolCalls: string[] = [];
  let finalText = '';
  let isError = exitCode !== 0;
  let costUsd = 0;
  let turns = 0;

  for (const line of transcript.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }

    let event: StreamEvent;
    try {
      event = JSON.parse(trimmed) as StreamEvent;
    } catch {
      continue;
    }

    if (event.type === 'assistant') {
      collectToolCalls(event.message?.content, toolCalls);
      continue;
    }

    if (event.type === 'user') {
      collectToolFailures(event.message?.content, failedToolCalls);
      continue;
    }

    if (event.type === 'result') {
      finalText = typeof event.result === 'string' ? event.result : '';
      isError = isError || event.is_error === true || event.subtype !== 'success';
      costUsd = event.total_cost_usd ?? 0;
      turns = event.num_turns ?? 0;
    }
  }

  if (transcript.trim().length === 0) {
    throw new Error(
      `claude produced no output (exit ${exitCode}): ${stderrChunks.join('').slice(0, 2000)}`
    );
  }

  return {
    toolCalls,
    toolNames: toolCalls.map((call) => call.name),
    finalText,
    isError,
    failedToolCalls,
    costUsd,
    turns,
    transcript
  };
}
