import { sessionsService } from '@/modules/providers/index.js';
import { chatRunRegistry, runDetachedChatTurn } from '@/modules/websocket/index.js';
import type { ProviderRuntimeGateway } from '@/modules/websocket/index.js';
import type { LLMProvider, NormalizedMessage, OfficePermissionMode } from '@/shared/types.js';

/**
 * Claude Code's built-in tools an office agent can be limited to. When an
 * agent has an allow-list, every tool here that is not on it is passed as
 * `disallowedTools`, which removes it from the model's toolbox entirely (the
 * SDK's `allowedTools` only auto-approves; it does not restrict).
 */
const CLAUDE_OFFICE_TOOLS = [
  'Read',
  'Glob',
  'Grep',
  'Edit',
  'Write',
  'MultiEdit',
  'NotebookEdit',
  'Bash',
  'WebFetch',
  'WebSearch',
  'TodoWrite',
  'Task',
  'Skill',
];

/** One turn an office agent should take. */
export type AgentTurnRequest = {
  /** App session to continue, or null to open a new one in the project. */
  sessionId: string | null;
  /** Name the new session gets in the sidebar. */
  sessionTitle: string;
  projectPath: string;
  provider: LLMProvider;
  model: string;
  prompt: string;
  permissionMode: OfficePermissionMode;
  /** Empty means every tool. */
  allowedTools: string[];
  userId: string | number | null;
  /** Called as soon as the session id is known, before the turn runs. */
  onSessionReady?: (sessionId: string) => void;
  /**
   * Checked right before the turn is dispatched. A case cancelled while its
   * session was being created must not start a run nobody will read.
   */
  isCancelled?: () => boolean;
  /** Receives every live event of the turn. */
  onEvent?: (event: NormalizedMessage) => void;
};

/** What a turn produced. `text` is empty when the agent said nothing. */
export type AgentTurnResult = {
  sessionId: string;
  /** Every assistant text block of the turn, joined. */
  text: string;
  /** The last assistant text block; where a final JSON answer usually sits. */
  lastText: string;
  /**
   * True when the session crashed: it never started, threw, or ended with a
   * non-zero exit code. An `error` event alone does not fail a turn, because
   * some runtimes report harmless stderr output that way.
   */
  failed: boolean;
  /** The last error the provider reported, if any. */
  error: string | null;
  aborted: boolean;
};

/** Runner surface the orchestrator depends on; tests substitute their own. */
export type OfficeAgentRunner = {
  runTurn(request: AgentTurnRequest): Promise<AgentTurnResult>;
  abort(provider: LLMProvider, sessionId: string): Promise<void>;
};

/**
 * Builds the provider options for an office turn, in the same shape the chat
 * composer sends, so the runtimes treat it exactly like a user's turn.
 */
function buildTurnOptions(request: AgentTurnRequest): Record<string, unknown> {
  // Tool limits map onto Claude Code's tool names; other providers have their
  // own toolboxes and run unrestricted apart from their permission mode.
  const restrictTools = request.provider === 'claude' && request.allowedTools.length > 0;
  const { allowedTools } = request;
  return {
    model: request.model,
    permissionMode: request.permissionMode,
    toolsSettings: {
      allowedTools,
      disallowedTools: restrictTools
        ? CLAUDE_OFFICE_TOOLS.filter((tool) => !allowedTools.includes(tool))
        : [],
      skipPermissions: request.permissionMode === 'bypassPermissions',
    },
    sessionSummary: request.sessionTitle,
  };
}

/**
 * Creates the runner that executes office turns through the app's own session
 * machinery: every turn is a normal app session (visible in the sidebar and
 * openable in chat) run by `runDetachedChatTurn`, so permissions, model
 * bookkeeping, provider-id mapping and notifications behave as in chat.
 *
 * A turn resolves at its terminal `complete` event rather than when the
 * runtime promise settles, because a runtime can keep its process open for
 * background work long after the turn itself has answered.
 */
export function createOfficeAgentRunner(dependencies: { runtime: ProviderRuntimeGateway }): OfficeAgentRunner {
  return {
    runTurn(request) {
      let sessionId = request.sessionId;
      if (!sessionId) {
        const created = sessionsService.createAppSession(request.provider, request.projectPath, request.sessionTitle);
        sessionId = created.sessionId;
        // createAppSession keeps only the first words; the office name is more useful whole.
        sessionsService.renameSessionById(sessionId, request.sessionTitle);
      }
      request.onSessionReady?.(sessionId);

      const turnSessionId = sessionId;
      if (request.isCancelled?.()) {
        return Promise.resolve({ sessionId, text: '', lastText: '', failed: false, error: null, aborted: true });
      }

      const texts: string[] = [];
      let deltaText = '';
      let error: string | null = null;
      let failed = false;
      let aborted = false;

      return new Promise<AgentTurnResult>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) {
            return;
          }
          settled = true;
          const lastText = texts.length > 0 ? texts[texts.length - 1] : deltaText;
          const text = texts.length > 0 ? texts.join('\n\n') : deltaText;
          resolve({ sessionId: turnSessionId, text: text.trim(), lastText: lastText.trim(), failed, error, aborted });
        };

        const onEvent = (event: NormalizedMessage) => {
          try {
            request.onEvent?.(event);
          } catch (listenerError) {
            console.error('[Office] Turn event listener failed', listenerError);
          }

          if (event.kind === 'text' && event.role === 'assistant' && typeof event.content === 'string') {
            texts.push(event.content);
            deltaText = '';
          } else if (event.kind === 'stream_delta' && typeof event.content === 'string') {
            deltaText += event.content;
          } else if (event.kind === 'error') {
            error = typeof event.content === 'string' && event.content ? event.content : 'The provider reported an error.';
          } else if (event.kind === 'complete') {
            aborted = Boolean(event.aborted);
            if (!aborted && event.exitCode !== 0) {
              failed = true;
              error = error ?? `The provider session ended with exit code ${String(event.exitCode ?? 'unknown')}.`;
            }
            finish();
          }
        };

        void runDetachedChatTurn(
          {
            sessionId: turnSessionId,
            userId: request.userId,
            content: request.prompt,
            options: buildTurnOptions(request),
            onEvent,
          },
          { runtime: dependencies.runtime },
        ).then((result) => {
          if (!result.started) {
            failed = true;
            error = result.error ?? 'The session could not be started.';
          } else if (result.error) {
            // The runtime threw after starting: that is a crash, not a warning.
            failed = true;
            error = error ?? result.error;
          }
          // The registry emits a synthetic `complete` when a runtime returns
          // without one, so this is only a safety net.
          finish();
        }).catch((runError: unknown) => {
          failed = true;
          error = runError instanceof Error ? runError.message : String(runError);
          finish();
        });
      });
    },

    async abort(provider, sessionId) {
      // Same shape as the chat gateway's abort: stop the provider run, then
      // emit the terminal `complete` on its behalf.
      const run = chatRunRegistry.getRun(sessionId);
      if (!run || run.status !== 'running') {
        return;
      }
      let success = false;
      try {
        success = await dependencies.runtime.abort(provider, sessionId);
      } catch (abortError) {
        console.error('[Office] Failed to abort session', { sessionId, error: abortError });
      }
      chatRunRegistry.completeRun(sessionId, { exitCode: success ? 0 : 1, aborted: true });
    },
  };
}
