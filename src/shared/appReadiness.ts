import { useSyncExternalStore } from 'react';

/**
 * Whether the workspace has finished its first projects load. The auth splash
 * holds until this flips, so the app it reveals is already laid out instead of
 * showing a second "loading workspace" screen right after the splash.
 *
 * Set once per page load and never cleared; a later refresh has its own UI.
 */
let workspaceReady = false;
const listeners = new Set<() => void>();

export function markWorkspaceReady(): void {
  if (workspaceReady) {
    return;
  }
  workspaceReady = true;
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Used by the auth module's ProtectedRoute to keep the splash up until the workspace has loaded. */
export function useWorkspaceReady(): boolean {
  return useSyncExternalStore(subscribe, () => workspaceReady, () => workspaceReady);
}
