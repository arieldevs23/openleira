import { ListChecks, Send } from 'lucide-react';
import { forwardRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { MAX_WORK_ITEMS, parseWorkItems, type WorkTarget } from '@/modules/office/utils/workItems';
import type { OfficeCase, OfficeDivision } from '@/shared/types';
import { Button } from '@/shared/ui';

type CoordinatorComposerProps = {
  target: WorkTarget;
  onTargetChange: (target: WorkTarget) => void;
  /** The orchestrator; it gets new work unless a team is picked. */
  coordinator: OfficeDivision | null;
  /** Teams work can go to directly. */
  teams: OfficeDivision[];
  /** Running work a note can go to (full tasks only: a team-only item has no orchestrator to read notes). */
  noteTargets: OfficeCase[];
  onSubmitWork: (items: string[], divisionId: string | null) => Promise<void>;
  onSendNote: (caseId: string, text: string) => Promise<void>;
};

const encodeTarget = (target: WorkTarget): string => (
  target.kind === 'coordinator' ? 'coordinator' : target.kind === 'team' ? `team:${target.divisionId}` : `note:${target.caseId}`
);

const decodeTarget = (value: string): WorkTarget => {
  if (value.startsWith('team:')) return { kind: 'team', divisionId: value.slice(5) };
  if (value.startsWith('note:')) return { kind: 'note', caseId: value.slice(5) };
  return { kind: 'coordinator' };
};

/**
 * The message box of the workspace chat dock. It hands out new work (one
 * prompt, or a list with one item per line) to the orchestrator or straight to
 * one team, or sends a note/answer to work that is already running. Ctrl/Cmd +
 * Enter sends. The canvas menus pick the target and focus it.
 */
const CoordinatorComposer = forwardRef<HTMLTextAreaElement, CoordinatorComposerProps>(function CoordinatorComposer(
  { target, onTargetChange, coordinator, teams, noteTargets, onSubmitWork, onSendNote },
  ref,
) {
  const { t } = useTranslation('office');
  // The message being written.
  const [text, setText] = useState('');
  // Whether a detected list goes out as separate items (on by default).
  const [splitList, setSplitList] = useState(true);
  // Send in flight.
  const [isSending, setIsSending] = useState(false);
  // Why the last send failed.
  const [error, setError] = useState<string | null>(null);

  const isNote = target.kind === 'note';
  const parsed = parseWorkItems(text);
  const sendsList = !isNote && parsed.isList && splitList;
  const tooMany = sendsList && parsed.items.length > MAX_WORK_ITEMS;
  const noteCase = isNote ? noteTargets.find((caseItem) => caseItem.id === target.caseId) ?? null : null;

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    const message = text.trim();
    if (!message || isSending || tooMany) {
      return;
    }
    setIsSending(true);
    setError(null);
    try {
      if (target.kind === 'note') {
        await onSendNote(target.caseId, message);
      } else {
        await onSubmitWork(sendsList ? parsed.items : [message], target.kind === 'team' ? target.divisionId : null);
      }
      setText('');
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : String(sendError));
    } finally {
      setIsSending(false);
    }
  };

  const placeholder = isNote
    ? noteCase?.waitingReason === 'question' ? t('question.placeholder') : t('work.notePlaceholder')
    : target.kind === 'team'
      ? t('work.teamPlaceholder')
      : t('work.placeholder');

  return (
    <form onSubmit={(event) => void send(event)} className="space-y-1" data-testid="office-composer">
      {error && <p className="text-[11px] text-err">{error}</p>}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <label className="flex min-w-0 items-center gap-1 text-muted-foreground">
          <span className="shrink-0">{t('work.to')}</span>
          <select
            value={encodeTarget(target)}
            onChange={(event) => onTargetChange(decodeTarget(event.target.value))}
            className="h-6 min-w-0 max-w-64 truncate rounded border border-input bg-background px-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            aria-label={t('work.target')}
            data-testid="office-work-target"
          >
            <option value="coordinator">{coordinator?.agent.name || coordinator?.name || t('case.coordinator')} · {t('work.planned')}</option>
            {teams.length > 0 && (
              <optgroup label={t('work.directGroup')}>
                {teams.map((team) => (
                  <option key={team.id} value={`team:${team.id}`}>{team.agent.name || team.name} · {team.name}</option>
                ))}
              </optgroup>
            )}
            {noteTargets.length > 0 && (
              <optgroup label={t('work.noteGroup')}>
                {noteTargets.map((caseItem) => (
                  <option key={caseItem.id} value={`note:${caseItem.id}`}>
                    {caseItem.waitingReason === 'question' ? `${t('work.answer')}: ` : ''}{caseItem.title}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        {!isNote && parsed.isList && (
          <label className="flex items-center gap-1 text-muted-foreground" data-testid="office-work-split">
            <input type="checkbox" checked={splitList} onChange={(event) => setSplitList(event.target.checked)} className="h-3 w-3" />
            <ListChecks className="h-3 w-3" />
            {t('work.splitList', { count: parsed.items.length })}
          </label>
        )}
      </div>
      {tooMany && <p className="text-[11px] text-warn">{t('work.tooMany', { max: MAX_WORK_ITEMS })}</p>}
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
          placeholder={placeholder}
          aria-label={t('work.message')}
          className="max-h-40 min-h-10 flex-1 resize-y rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <Button
          type="submit"
          size="icon"
          className="h-9 w-9"
          disabled={!text.trim() || isSending || tooMany}
          aria-label={sendsList ? t('work.sendList', { count: parsed.items.length }) : t('case.send')}
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </form>
  );
});

export default CoordinatorComposer;
