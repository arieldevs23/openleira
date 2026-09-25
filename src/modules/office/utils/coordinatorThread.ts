import type { OfficeMessage } from '@/shared/types';

/**
 * The conversation between the user and the coordinator in one case: the
 * user's notes, the coordinator's replies and questions, and its final
 * report. Failure reports from teams travel as notes too but are not part of
 * it. Used by the coordinator chat dock and the case panel (for the open
 * question).
 */
export function coordinatorThread(messages: OfficeMessage[], coordinatorId: string | null | undefined): OfficeMessage[] {
  return messages.filter((message) => (
    (message.kind === 'note' || message.kind === 'question')
    && message.payload.type !== 'task_failed'
    && (message.fromDivisionId === null || (message.fromDivisionId === coordinatorId && message.toDivisionId === null))
  ));
}
