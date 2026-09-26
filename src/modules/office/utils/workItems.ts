import type { OfficeCase } from '@/shared/types';

/** Where a message from the chat dock goes. */
export type WorkTarget =
  /** New work for the orchestrator, which plans it across the teams. */
  | { kind: 'coordinator' }
  /** New work straight to one team, with no plan, audit or summary. */
  | { kind: 'team'; divisionId: string }
  /** A note or an answer to work that is already running. */
  | { kind: 'note'; caseId: string };

const LIST_MARKER = /^\s*(?:[-*•]|\d+[.)])\s+/;

/** The most items one list may carry; the server refuses more. */
export const MAX_WORK_ITEMS = 20;

/**
 * Splits a message into work items. A message with two or more list lines
 * ("- …", "* …", "1. …") is a work list: each list line starts an item and
 * the lines under it belong to it; text before the first list line is shared
 * context added to every item. Anything else is one item.
 */
export function parseWorkItems(text: string): { items: string[]; isList: boolean } {
  const trimmed = text.trim();
  if (!trimmed) {
    return { items: [], isList: false };
  }
  const lines = trimmed.split('\n');
  if (lines.filter((line) => LIST_MARKER.test(line)).length < 2) {
    return { items: [trimmed], isList: false };
  }

  const intro: string[] = [];
  const items: string[][] = [];
  for (const line of lines) {
    if (LIST_MARKER.test(line)) {
      items.push([line.replace(LIST_MARKER, '').trim()]);
    } else if (items.length === 0) {
      intro.push(line);
    } else {
      items[items.length - 1].push(line);
    }
  }
  const context = intro.join('\n').trim();
  return {
    items: items
      .map((item) => item.join('\n').trim())
      .filter(Boolean)
      .map((item) => (context ? `${item}\n\n${context}` : item)),
    isList: true,
  };
}

/** Work that is still going: running, waiting on the user, or queued behind an earlier item of its list. */
export const isOpenWork = (caseItem: OfficeCase): boolean => (
  caseItem.status === 'running'
  || caseItem.status === 'waiting_user'
  || (caseItem.status === 'draft' && Boolean(caseItem.followsCaseId))
);
