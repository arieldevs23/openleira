import { connectedClients, WS_OPEN_STATE } from '@/modules/websocket/index.js';
import type {
  NormalizedMessage,
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
