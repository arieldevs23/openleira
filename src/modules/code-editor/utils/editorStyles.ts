// Every colour here is a design token from src/index.css, so the editor chrome
// follows the active theme without branching on it.
export const getEditorLoadingStyles = () => {
  return `
    .code-editor-loading {
      background-color: var(--surface) !important;
    }

    .code-editor-loading:hover {
      background-color: var(--surface) !important;
    }
  `;
};

export const getEditorStyles = () => {
  return `
    .cm-deletedChunk {
      background-color: color-mix(in srgb, var(--err) 14%, transparent) !important;
      border-left: 3px solid var(--err) !important;
      padding-left: 4px !important;
    }

    .cm-insertedChunk {
      background-color: color-mix(in srgb, var(--ok) 14%, transparent) !important;
      border-left: 3px solid var(--ok) !important;
      padding-left: 4px !important;
    }

    .cm-editor.cm-merge-b .cm-changedText {
      background: color-mix(in srgb, var(--ok) 32%, transparent) !important;
      padding-top: 2px !important;
      padding-bottom: 2px !important;
      margin-top: -2px !important;
      margin-bottom: -2px !important;
    }

    .cm-editor .cm-deletedChunk .cm-changedText {
      background: color-mix(in srgb, var(--err) 32%, transparent) !important;
      padding-top: 2px !important;
      padding-bottom: 2px !important;
      margin-top: -2px !important;
      margin-bottom: -2px !important;
    }

    .cm-gutter.cm-gutter-minimap {
      background-color: var(--surface-2);
    }

    .cm-editor-toolbar-panel {
      padding: 4px 10px;
      background-color: var(--surface);
      border-bottom: 1px solid var(--border);
      color: var(--text-dim);
      font-family: var(--font-sans);
      font-size: 12px;
    }

    .cm-diff-nav-btn,
    .cm-toolbar-btn {
      padding: 3px;
      background: transparent;
      border: none;
      cursor: pointer;
      border-radius: var(--radius-s);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: inherit;
      transition: background-color var(--dur-color) var(--ease);
    }

    .cm-diff-nav-btn:hover,
    .cm-toolbar-btn:hover {
      background-color: var(--accent-dim);
    }

    .cm-diff-nav-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `;
};
