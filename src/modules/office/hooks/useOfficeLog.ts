import { useEffect, useState } from 'react';

import { api } from '@/shared/api';
import { useWebSocket } from '@/shared/context/WebSocketContext';
import type { OfficeLogEntry, OfficeLogEvent } from '@/shared/types';

/** How much of a finished session's history the panel shows. */
const HISTORY_LIMIT = 200;
const MAX_ENTRIES = 500;

type HistoryMessage = {
  id?: string;
  kind?: string;
  role?: string;
  content?: unknown;
  toolName?: string;
  toolInput?: unknown;
  toolResult?: { isError?: boolean; content?: unknown };
  timestamp?: string;
};

const summarizeToolInput = (input: unknown): string => {
  if (!input || typeof input !== 'object') {
    return typeof input === 'string' ? input : '';
  }
  const record = input as Record<string, unknown>;
  for (const key of ['command', 'file_path', 'path', 'pattern', 'url', 'query', 'description']) {
    if (typeof record[key] === 'string' && record[key]) {
      return String(record[key]);
    }
  }
  return '';
};

/**
 * Rebuilds log lines from persisted history with the same rules the server
 * applies to live events, so both halves of the log read alike.
 */
function toLogEntry(message: HistoryMessage, index: number): OfficeLogEntry | null {
  const id = message.id ?? `history-${index}`;
  const timestamp = message.timestamp ?? '';
  if (message.kind === 'text' && message.role === 'assistant' && typeof message.content === 'string' && message.content.trim()) {
    return { id, type: 'text', text: message.content.trim(), timestamp };
  }
  if (message.kind === 'tool_use') {
    return { id, type: 'tool', toolName: message.toolName ?? 'tool', text: summarizeToolInput(message.toolInput), timestamp };
  }
  if (message.kind === 'tool_result' && message.toolResult?.isError) {
    return { id, type: 'error', text: String(message.toolResult.content ?? ''), timestamp };
  }
  if (message.kind === 'error') {
    return { id, type: 'error', text: String(message.content ?? ''), timestamp };
  }
  return null;
}

/**
 * The transcript of one office session: what it wrote so far (REST history)
 * followed by lines streamed live over `office:log` while it runs.
 */
export function useOfficeLog(sessionId: string | null) {
  const { subscribe } = useWebSocket();
  // Transcript lines of the session in order; history first, live lines appended.
  const [entries, setEntries] = useState<OfficeLogEntry[]>([]);
  // True while the history request is in flight, to show a loading line instead of "empty".
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setEntries([]);
    if (!sessionId) {
      return undefined;
    }

    let cancelled = false;
    setIsLoading(true);
    void (async () => {
      try {
        const response = await api.providers.sessionMessages(sessionId, { limit: HISTORY_LIMIT, offset: 0 });
        const body = await response.json() as { success?: boolean; data?: { messages?: HistoryMessage[] } };
        const history = (body.data?.messages ?? [])
          .map(toLogEntry)
          .filter((entry): entry is OfficeLogEntry => entry !== null);
        if (!cancelled) {
          // Live lines that arrived during the request are kept after the history.
          setEntries((live) => [...history, ...live.filter((entry) => !history.some((item) => item.id === entry.id))]);
        }
      } catch (error) {
        console.error('[Office] Failed to load session history', error);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    const unsubscribe = subscribe((event) => {
      if (event.kind !== 'office:log') {
        return;
      }
      const logEvent = event as unknown as OfficeLogEvent;
      if (logEvent.logSessionId !== sessionId) {
        return;
      }
      setEntries((current) => (
        current.some((entry) => entry.id === logEvent.entry.id)
          ? current
          : [...current, logEvent.entry].slice(-MAX_ENTRIES)
      ));
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [sessionId, subscribe]);

  return { entries, isLoading };
}
