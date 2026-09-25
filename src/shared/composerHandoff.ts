/**
 * A message typed somewhere other than the chat composer — today the welcome
 * screen — that the composer should send as soon as it mounts for that scope.
 *
 * One-shot and in memory only: a reload must not resend it. Scopes match the
 * composer's draft scopes (`project:<projectId>` for a chat with no session).
 */
const pendingSubmits = new Map<string, string>();

export function setPendingComposerSubmit(scope: string, text: string): void {
  pendingSubmits.set(scope, text);
}

/** Returns and clears the pending text for a scope, or null when there is none. */
export function takePendingComposerSubmit(scope: string): string | null {
  const text = pendingSubmits.get(scope) ?? null;
  pendingSubmits.delete(scope);
  return text;
}
