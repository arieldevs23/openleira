import assert from 'node:assert/strict';

import { renderHook } from '@testing-library/react';
import { test } from 'vitest';

import { useChatRealtimeHandlers } from '@/modules/chat/hooks/useChatRealtimeHandlers';
import type { ServerEvent, ProjectSession } from '@/shared/types';
import type { SessionStore } from '@/modules/chat/hooks/useSessionStore';

/**
 * Kantor AI broadcasts `office:update` and `office:log` on the same socket as
 * chat. They carry no `sessionId`, and the chat handler files a frame without
 * one under the session on screen — so an office frame must be dropped before
 * it reaches the transcript store.
 */
test('office frames never land in the open chat transcript', () => {
  let listener: ((event: ServerEvent) => void) | null = null;
  const appended: unknown[] = [];

  renderHook(() => useChatRealtimeHandlers({
    isActive: true,
    subscribe: (fn) => {
      listener = fn;
      return () => { listener = null; };
    },
    provider: 'claude',
    selectedSession: { id: 'viewed-session' } as ProjectSession,
    currentSessionId: 'viewed-session',
    setTokenBudget: () => {},
    pendingPermissionRequests: [],
    setPendingPermissionRequests: () => {},
    streamTimerRef: { current: null },
    accumulatedStreamRef: { current: '' },
    lastSeqRef: { current: new Map() },
    statusCheckSentAtRef: { current: new Map() },
    requestLatestMessages: async () => {},
    sessionStore: { appendRealtime: (...args: unknown[]) => appended.push(args) } as unknown as SessionStore,
  }));

  // Read through a closure: TypeScript cannot see the hook assign `listener`.
  const dispatch = (event: ServerEvent) => listener?.(event);
  dispatch({ kind: 'office:update', officeId: 'office-1', change: { entity: 'case', id: 'c1', case: null } } as ServerEvent);
  dispatch({ kind: 'office:log', officeId: 'office-1', logSessionId: 'task-session', entry: { id: 'x', type: 'text', text: 'hi' } } as ServerEvent);

  assert.deepEqual(appended, []);
});
