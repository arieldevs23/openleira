import { connectedClients, WS_OPEN_STATE } from '@/modules/websocket/index.js';
import type {
  NormalizedMessage,
  OfficeAnalysis,
  OfficeAnalysisEvent,
  OfficeLogEntry,
  OfficeLogEvent,
  OfficeUpdateChange,
  OfficeUpdateEvent,
} from '@/shared/types.js';

/** Longest text a single log line carries; the full transcript stays in the session. */
const MAX_LOG_TEXT_LENGTH = 2000;

function broadcast(payload: string): void {
  connectedClients.forEach((client) => {
    if (client.readyState === WS_OPEN_STATE) {
      client.send(payload);
    }
  });
}

/**
 * Announces one changed office row on the shared chat websocket. Every
 * mutation in the office module goes through here, which is what lets the
 * Office page stay live without polling.
 */
export function broadcastOfficeUpdate(officeId: string, change: OfficeUpdateChange): void {
  const event: OfficeUpdateEvent = {
    kind: 'office:update',
    officeId,
    change,
    timestamp: new Date().toISOString(),
  };
  broadcast(JSON.stringify(event));
}

/** Streams one transcript line of a running office session to every client. */
/** Sends an `office:analysis` frame: an app analysis started, made progress, finished, failed or was dismissed. */
export function broadcastOfficeAnalysis(analysis: OfficeAnalysis, removed = false): void {
  broadcast(JSON.stringify({ kind: 'office:analysis', analysis, ...(removed ? { removed } : {}) } satisfies OfficeAnalysisEvent));
}

export function broadcastOfficeLog(event: Omit<OfficeLogEvent, 'kind'>): void {
  broadcast(JSON.stringify({ kind: 'office:log', ...event } satisfies OfficeLogEvent));
}

const clip = (text: string): string => (
  text.length > MAX_LOG_TEXT_LENGTH ? `${text.slice(0, MAX_LOG_TEXT_LENGTH)}…` : text
);

const summarizeToolInput = (input: unknown): string => {
  if (!input || typeof input !== 'object') {
    return typeof input === 'string' ? input : '';
  }
  const record = input as Record<string, unknown>;
  for (const key of ['command', 'file_path', 'path', 'pattern', 'url', 'query', 'description', 'prompt']) {
    if (typeof record[key] === 'string' && record[key]) {
      return String(record[key]);
    }
  }
  return '';
};

/**
 * Reduces a provider's normalized live event to a compact log line, or null
 * for events the office log does not show (stream deltas, statuses, results
 * of successful tools). The id is kept so clients can merge live lines with
 * the history they fetched over REST.
 */
export function toOfficeLogEntry(event: NormalizedMessage): OfficeLogEntry | null {
  const timestamp = event.timestamp || new Date().toISOString();
  switch (event.kind) {
    case 'text':
      if (event.role !== 'assistant' || typeof event.content !== 'string' || !event.content.trim()) {
        return null;
      }
      return { id: event.id, type: 'text', text: clip(event.content.trim()), timestamp };
    case 'tool_use':
      return {
        id: event.id,
        type: 'tool',
        toolName: event.toolName ?? 'tool',
        text: clip(summarizeToolInput(event.toolInput)),
        timestamp,
      };
    case 'tool_result':
      if (!event.toolResult?.isError) {
        return null;
      }
      return { id: event.id, type: 'error', text: clip(String(event.toolResult.content ?? '')), timestamp };
    case 'error':
      return { id: event.id, type: 'error', text: clip(String(event.content ?? 'error')), timestamp };
    case 'complete':
      return { id: event.id, type: 'done', text: event.aborted ? 'aborted' : '', timestamp };
    default:
      return null;
  }
}

/** Tool names that write files across providers (Claude, Codex's file changes, Cursor, OpenCode). */
const FILE_WRITING_TOOL_PATTERN = /(write|edit|patch|filechange|create_file|str_replace)/i;

const readToolInput = (input: unknown): Record<string, unknown> | null => {
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input) as unknown;
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
    } catch {
      return null;
    }
  }
  return input && typeof input === 'object' ? input as Record<string, unknown> : null;
};

const pathFields = (record: Record<string, unknown>): string[] => ['file_path', 'filePath', 'notebook_path', 'path']
  .map((field) => record[field])
  .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

/**
 * The files a live event says the agent wrote or edited, relative to the
 * project folder when they are inside it. Used by the orchestrator to show
 * where a task left its results.
 */
export function extractChangedFiles(event: NormalizedMessage, projectPath: string): string[] {
  if (event.kind !== 'tool_use' || !FILE_WRITING_TOOL_PATTERN.test(event.toolName ?? '')) {
    return [];
  }
  const input = readToolInput(event.toolInput);
  if (!input) {
    return [];
  }
  const paths = pathFields(input);
  if (Array.isArray(input.changes)) {
    for (const change of input.changes) {
      const record = readToolInput(change);
      if (record) {
        paths.push(...pathFields(record));
      }
    }
  }
  const root = projectPath.replace(/[\\/]+$/, '');
  return [...new Set(paths.map((filePath) => {
    const normalized = filePath.trim();
    return normalized.startsWith(`${root}/`) || normalized.startsWith(`${root}\\`) ? normalized.slice(root.length + 1) : normalized;
  }))];
}
