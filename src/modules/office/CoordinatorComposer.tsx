import { Send } from 'lucide-react';
import { forwardRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/ui';

type CoordinatorComposerProps = {
  /** Answering a question: the placeholder says so. */
  isAnswering: boolean;
  onSend: (text: string) => Promise<void>;
};

/**
 * The message box to the coordinator, pinned to the bottom of the workspace
 * page's right panel so it stays in reach while the panel scrolls. Ctrl/Cmd +
 * Enter sends. The canvas menu's "message the coordinator" focuses it.
 */
const CoordinatorComposer = forwardRef<HTMLTextAreaElement, CoordinatorComposerProps>(function CoordinatorComposer(
  { isAnswering, onSend },
  ref,
) {
  const { t } = useTranslation('office');
  // The message being written.
  const [text, setText] = useState('');
  // Send in flight.
  const [isSending, setIsSending] = useState(false);
  // Why the last send failed.
  const [error, setError] = useState<string | null>(null);

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    const message = text.trim();
    if (!message || isSending) {
      return;
    }
    setIsSending(true);
    setError(null);
    try {
      await onSend(message);
      setText('');
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : String(sendError));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <form onSubmit={(event) => void send(event)} className="space-y-1" data-testid="office-composer">
      {error && <p className="text-[11px] text-red-600 dark:text-red-300">{error}</p>}
      <div className="flex items-end gap-1.5">
        <textarea
          ref={ref}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void send();
            }
          }}
          rows={2}
          placeholder={isAnswering ? t('question.placeholder') : t('case.notePlaceholder')}
          aria-label={t('case.notePlaceholder')}
          className="max-h-40 min-h-10 flex-1 resize-y rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <Button type="submit" size="icon" className="h-9 w-9" disabled={!text.trim() || isSending} aria-label={t('case.send')}>
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </form>
  );
});

export default CoordinatorComposer;
