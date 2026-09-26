import { useTranslation } from 'react-i18next';
import { ChevronDownIcon, ChevronUpIcon, PencilIcon, XIcon, ZapIcon } from 'lucide-react';

import type { QueuedDraft } from '@/shared/types';

const PREVIEW_LENGTH = 80;

type QueuedMessageListProps = {
  queuedDrafts: QueuedDraft[];
  /** Whether a turn is running, which turns "send now" into "stop and send". */
  isLoading: boolean;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onSendNow: (id: string) => void;
};

const toPreview = (content: string) => {
  const normalized = content.replace(/\s+/g, ' ').trim();
  return normalized.length > PREVIEW_LENGTH ? `${normalized.slice(0, PREVIEW_LENGTH - 1)}…` : normalized;
};

const ACTION_BUTTON_CLASS =
  'rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30';

/**
 * Rendered by chat's ChatComposer to show the messages queued for a busy
 * session, in send order, with per-entry reorder, edit, delete and
 * stop-and-send actions before the dispatcher sends them.
 */
export default function QueuedMessageList({
  queuedDrafts,
  isLoading,
  onEdit,
  onDelete,
  onMove,
  onSendNow,
}: QueuedMessageListProps) {
  const { t } = useTranslation('chat');

  if (queuedDrafts.length === 0) {
    return null;
  }

  const sendNowLabel = isLoading
    ? t('input.queue.interruptSend', { defaultValue: 'Stop current turn & send this now' })
    : t('input.queue.sendNow', { defaultValue: 'Send this now' });

  return (
    <div className="settings-content-enter glass-surface mx-auto mb-2 max-w-[54.25rem] rounded-xl px-2 py-1.5">
      <div className="flex items-center gap-1.5 px-1 pb-1 text-[11px] font-medium uppercase tracking-wide text-primary/70">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden />
        <span>{t('input.queue.count', { count: queuedDrafts.length, defaultValue: '{{count}} queued' })}</span>
        <span className="truncate normal-case text-muted-foreground">
          · {t('input.queue.willSendInOrder', { defaultValue: 'Sends in order as each turn finishes' })}
        </span>
      </div>

      <ol className="flex flex-col gap-0.5">
        {queuedDrafts.map((draft, index) => {
          const attachmentCount = draft.uploadedAttachments?.length ?? draft.attachments.length;
          return (
            <li
              key={draft.id}
              className="group flex items-center gap-2 rounded-lg px-1 py-1 transition-colors hover:bg-foreground/[0.04]"
            >
              <span className="w-4 shrink-0 text-center text-[11px] tabular-nums text-muted-foreground">
                {index + 1}
              </span>
              <p className="min-w-0 flex-1 truncate text-sm text-foreground/90" title={draft.content}>
                {toPreview(draft.content)}
                {attachmentCount > 0 && (
                  <span className="ml-1.5 text-xs text-muted-foreground">+{attachmentCount}</span>
                )}
              </p>

              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={() => onMove(draft.id, -1)}
                  disabled={index === 0}
                  aria-label={t('input.queue.moveUp', { defaultValue: 'Move up' })}
                  title={t('input.queue.moveUp', { defaultValue: 'Move up' })}
                  className={ACTION_BUTTON_CLASS}
                >
                  <ChevronUpIcon className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onMove(draft.id, 1)}
                  disabled={index === queuedDrafts.length - 1}
                  aria-label={t('input.queue.moveDown', { defaultValue: 'Move down' })}
                  title={t('input.queue.moveDown', { defaultValue: 'Move down' })}
                  className={ACTION_BUTTON_CLASS}
                >
                  <ChevronDownIcon className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onEdit(draft.id)}
                  aria-label={t('input.queue.edit', { defaultValue: 'Edit queued message' })}
                  title={t('input.queue.edit', { defaultValue: 'Edit queued message' })}
                  className={ACTION_BUTTON_CLASS}
                >
                  <PencilIcon className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onSendNow(draft.id)}
                  aria-label={sendNowLabel}
                  title={sendNowLabel}
                  className="rounded-md p-1 text-warn transition-colors hover:bg-warn/10 hover:text-warn"
                >
                  <ZapIcon className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(draft.id)}
                  aria-label={t('input.queue.delete', { defaultValue: 'Delete queued message' })}
                  title={t('input.queue.delete', { defaultValue: 'Delete queued message' })}
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
