import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { OfficeDivision, OfficeMessage } from '@/shared/types';
import { cn } from '@/shared/utils';

type MessagesPanelProps = {
  division: OfficeDivision;
  divisions: OfficeDivision[];
  messages: OfficeMessage[];
};

const KIND_CLASSES: Record<OfficeMessage['kind'], string> = {
  assign: 'bg-primary/10 text-primary',
  result: 'bg-ok/10 text-ok',
  question: 'bg-navy/10 text-navy',
  audit_pass: 'bg-ok/10 text-ok',
  audit_fail: 'bg-err/10 text-err',
  note: 'bg-muted text-muted-foreground',
};

/** The readable body of a message-bus payload, whatever its kind. */
function describePayload(message: OfficeMessage): string {
  const payload = message.payload;
  const parts = [
    typeof payload.ref === 'string' && typeof payload.title === 'string' ? `${payload.ref} · ${payload.title}` : '',
    typeof payload.instruction === 'string' ? payload.instruction : '',
    typeof payload.summary === 'string' ? payload.summary : '',
    typeof payload.notes === 'string' ? payload.notes : '',
    Array.isArray(payload.fixes) ? payload.fixes.map((fix) => `- ${String(fix)}`).join('\n') : '',
    typeof payload.error === 'string' ? payload.error : '',
    typeof payload.text === 'string' ? payload.text : '',
  ];
  return parts.filter(Boolean).join('\n\n');
}

/** Right panel of the office page: the message bus between the coordinator (and audit) and one division. */
export default function MessagesPanel({ division, divisions, messages }: MessagesPanelProps) {
  const { t } = useTranslation('office');
  const byId = new Map(divisions.map((entry) => [entry.id, entry]));
  const nameOf = (divisionId: string | null) => (divisionId ? byId.get(divisionId)?.name ?? '?' : t('case.you'));
  const related = messages.filter((message) => message.fromDivisionId === division.id || message.toDivisionId === division.id);

  return (
    <div className="flex flex-col gap-3">
      <header>
        <h2 className="text-base font-semibold text-foreground">{t('messages.title', { name: division.name })}</h2>
        <p className="text-xs text-muted-foreground">{t('messages.subtitle')}</p>
      </header>
      {related.length === 0 && <p className="text-xs text-muted-foreground">{t('messages.empty')}</p>}
      <ol className="space-y-2">
        {related.map((message) => (
          <li key={message.id} className="rounded-[10px] border border-border bg-card/60 p-2.5 text-xs">
            <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted-foreground">
              <span className={cn('rounded px-1.5 py-0.5 font-medium', KIND_CLASSES[message.kind])}>
                {t(`kinds.${message.kind}`)}
              </span>
              <span className="inline-flex items-center gap-1">
                {nameOf(message.fromDivisionId)}
                <ArrowRight className="h-3 w-3" />
                {nameOf(message.toDivisionId)}
              </span>
              <span className="ml-auto">{new Date(message.createdAt).toLocaleTimeString()}</span>
            </div>
            <p className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-foreground">{describePayload(message)}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
