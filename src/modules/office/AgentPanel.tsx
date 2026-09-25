import { Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import ChipMultiSelect from '@/modules/office/ChipMultiSelect';
import MarkdownPreview from '@/modules/office/MarkdownPreview';
import ModelSelect from '@/modules/office/ModelSelect';
import OfficeStatusBadge from '@/modules/office/OfficeStatusBadge';
import PanelSection from '@/modules/office/PanelSection';
import TranscriptView from '@/modules/office/TranscriptView';
import { Button } from '@/shared/ui';
import type {
  LLMProvider,
  OfficeActions,
  OfficeAgentSection,
  OfficeCase,
  OfficeDivision,
  OfficeInstalledSkill,
  OfficeModelGroup,
  OfficeTask,
} from '@/shared/types';
import { cn, officeTaskTone } from '@/shared/utils';

/** Claude Code tools an agent can be limited to; none selected means all of them. */
const TOOL_OPTIONS = [
  'Read', 'Glob', 'Grep', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Bash', 'WebFetch', 'WebSearch', 'TodoWrite', 'Task', 'Skill',
].map((tool) => ({ value: tool, label: tool }));

const inputClass = 'w-full rounded-md border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring';

type AgentPanelProps = {
  division: OfficeDivision;
  caseItem: OfficeCase | null;
  /** Tasks of the selected case (all divisions). */
  tasks: OfficeTask[];
  /** A task picked in the timeline, shown first in the transcript. */
  focusTaskId?: string;
  modelGroups: OfficeModelGroup[];
  skills: OfficeInstalledSkill[];
  actions: OfficeActions;
  onDeleted: () => void;
  onOpenSession: (sessionId: string) => void;
  /** The section a canvas menu entry asked for; it opens alone and scrolls into view. */
  focus?: OfficeAgentSection;
};

/** Sections open when the panel is opened by a plain click on the node. */
const DEFAULT_OPEN: OfficeAgentSection[] = ['agent', 'work'];

const isOpen = (section: OfficeAgentSection, focus: OfficeAgentSection | undefined) =>
  focus ? focus === section : DEFAULT_OPEN.includes(section);

/** Right panel of the office page for one division: its settings, its agent, and the live transcript of its work. */
export default function AgentPanel(props: AgentPanelProps) {
  const { division } = props;
  // Remounting the form on every server-side change of this division keeps it in sync after a save.
  const formKey = `${division.id}:${division.agent.updatedAt}:${division.name}:${division.color}:${division.description}:${props.focus ?? ''}`;
  const { t } = useTranslation('office');
  return (
    <div className="flex flex-col gap-3">
      <DivisionForm key={formKey} {...props} />
      <PanelSection
        key={`work:${division.id}:${props.focus ?? ''}`}
        title={t('agent.work')}
        defaultOpen={isOpen('work', props.focus)}
        focused={props.focus === 'work'}
        testId="office-agent-section-work"
      >
        {/* A new pick in the timeline starts the transcript on that task. */}
        <DivisionTranscript key={`${division.id}:${props.focusTaskId ?? ''}`} {...props} />
      </PanelSection>
    </div>
  );
}

function DivisionForm({ division, modelGroups, skills, actions, onDeleted, focus }: AgentPanelProps) {
  const { t } = useTranslation('office');
  const { agent } = division;
  const isProtected = division.isCoordinator || division.isAudit;
  // Editable copies of the division and agent fields, compared with the saved
  // values to know what changed; one button saves them all.
  // Division name.
  const [name, setName] = useState(division.name);
  // Division description.
  const [description, setDescription] = useState(division.description);
  // Division colour on the tree.
  const [color, setColor] = useState(division.color);
  // Agent name.
  const [agentName, setAgentName] = useState(agent.name);
  // Agent role instructions.
  const [rolePrompt, setRolePrompt] = useState(agent.rolePrompt);
  // Agent provider + model; null while none is picked.
  const [model, setModel] = useState<{ provider: LLMProvider; model: string } | null>(
    agent.provider && agent.model ? { provider: agent.provider, model: agent.model } : null,
  );
  // Tool allow-list; empty means all tools.
  const [allowedTools, setAllowedTools] = useState(agent.allowedTools);
  // Skill names the agent is told to use.
  const [agentSkills, setAgentSkills] = useState(agent.skills);
  // Whether the division takes work (for audit: whether results are audited).
  const [enabled, setEnabled] = useState(agent.enabled);
  // Save/delete in flight, which disables the buttons.
  const [isSaving, setIsSaving] = useState(false);
  // Second click needed to delete the division.
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Server validation error or success note shown under the buttons.
  const [feedback, setFeedback] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);
  // The role prompt shows rendered markdown until the user switches to editing it.
  const [isEditingRole, setIsEditingRole] = useState(focus === 'role' || !agent.rolePrompt.trim());

  const skillOptions = useMemo(
    () => skills.map((skill) => ({ value: skill.name, label: skill.name, description: skill.description })),
    [skills],
  );

  const divisionChanged = name !== division.name || description !== division.description || color !== division.color;
  const modelChanged = (model?.provider ?? null) !== agent.provider || (model?.model ?? null) !== agent.model;
  const agentChanged = agentName !== agent.name
    || rolePrompt !== agent.rolePrompt
    || modelChanged
    || enabled !== agent.enabled
    || allowedTools.join('|') !== agent.allowedTools.join('|')
    || agentSkills.join('|') !== agent.skills.join('|');

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setFeedback(null);
    try {
      if (divisionChanged) {
        await actions.updateDivision(division.id, { name, description, color });
      }
      if (agentChanged) {
        await actions.updateAgent(agent.id, {
          name: agentName,
          rolePrompt,
          ...(modelChanged ? (model ? { provider: model.provider, model: model.model } : { model: null }) : {}),
          allowedTools,
          skills: agentSkills,
          enabled,
        });
      }
      setFeedback({ tone: 'ok', text: t('agent.saved') });
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async () => {
    setIsSaving(true);
    try {
      await actions.deleteDivision(division.id);
      onDeleted();
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : String(error) });
      setIsSaving(false);
      setConfirmDelete(false);
    }
  };

  return (
    <form onSubmit={(event) => void save(event)} className="flex flex-col gap-3">
      <header className="flex items-center gap-2">
        <span aria-hidden className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">{division.name}</h2>
        {division.isCoordinator && <span className="text-[10px] text-muted-foreground">{t('division.coordinatorTag')}</span>}
        {division.isAudit && <span className="text-[10px] text-muted-foreground">{t('division.auditTag')}</span>}
      </header>

      <PanelSection title={t('agent.section')} summary={agentName} defaultOpen={isOpen('agent', focus)} focused={focus === 'agent'} testId="office-agent-section-agent">
        <label className="block space-y-1">
          <span className="text-[11px] text-muted-foreground">{t('agent.name')}</span>
          <input value={agentName} onChange={(event) => setAgentName(event.target.value)} maxLength={80} className={`${inputClass} h-8`} />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] text-muted-foreground">{t('division.name')}</span>
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} className={`${inputClass} h-8`} />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] text-muted-foreground">{t('division.description')}</span>
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} maxLength={500} className={`${inputClass} py-1.5`} />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">{t('division.color')}</span>
          <input type="color" value={color} onChange={(event) => setColor(event.target.value)} className="h-7 w-10 cursor-pointer rounded border border-input bg-background" aria-label={t('division.color')} />
          <span className="font-mono text-[11px] text-muted-foreground">{color}</span>
        </label>
        {!division.isCoordinator && (
          <label className="flex items-center gap-2 text-xs text-foreground">
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="h-3.5 w-3.5 accent-primary" />
            {division.isAudit ? t('agent.enabledAudit') : t('agent.enabled')}
          </label>
        )}
      </PanelSection>

      <PanelSection
        title={t('agent.model')}
        summary={model ? model.model : t('tree.noModel')}
        defaultOpen={isOpen('model', focus)}
        focused={focus === 'model'}
        testId="office-agent-section-model"
      >
        <ModelSelect value={model} groups={modelGroups} onChange={setModel} ariaLabel={t('agent.model')} />
      </PanelSection>

      <PanelSection
        title={t('agent.rolePrompt')}
        summary={rolePrompt.trim() ? t('agent.roleLines', { count: rolePrompt.trim().split('\n').length }) : t('agent.roleEmpty')}
        defaultOpen={isOpen('role', focus)}
        focused={focus === 'role'}
        testId="office-agent-section-role"
      >
        <div className="flex justify-end gap-1">
          <button
            type="button"
            onClick={() => setIsEditingRole(false)}
            aria-pressed={!isEditingRole}
            className={cn('rounded-md px-2 py-0.5 text-[11px]', !isEditingRole ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}
          >
            {t('agent.rolePreview')}
          </button>
          <button
            type="button"
            onClick={() => setIsEditingRole(true)}
            aria-pressed={isEditingRole}
            className={cn('rounded-md px-2 py-0.5 text-[11px]', isEditingRole ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}
          >
            {t('agent.roleEdit')}
          </button>
        </div>
        {isEditingRole ? (
          <textarea
            value={rolePrompt}
            onChange={(event) => setRolePrompt(event.target.value)}
            rows={10}
            aria-label={t('agent.rolePrompt')}
            className={`${inputClass} py-1.5 font-mono text-[12px] leading-relaxed`}
            placeholder={t('agent.rolePromptPlaceholder')}
          />
        ) : (
          <div className="max-h-72 overflow-y-auto rounded-md border border-border bg-card/50 px-2.5 py-1.5">
            {rolePrompt.trim() ? <MarkdownPreview markdown={rolePrompt} /> : <p className="text-xs text-muted-foreground">{t('agent.roleEmpty')}</p>}
          </div>
        )}
        <span className="block text-[10px] text-muted-foreground">{t('agent.rolePromptHint')}</span>
      </PanelSection>

      <PanelSection
        title={t('agent.tools')}
        summary={allowedTools.length === 0 ? t('agent.toolsAllShort') : String(allowedTools.length)}
        defaultOpen={isOpen('tools', focus)}
        focused={focus === 'tools'}
        testId="office-agent-section-tools"
      >
        <ChipMultiSelect options={TOOL_OPTIONS} value={allowedTools} onChange={setAllowedTools} emptyLabel="" ariaLabel={t('agent.tools')} />
        <span className="block text-[10px] text-muted-foreground">
          {allowedTools.length === 0 ? t('agent.toolsAll') : t('agent.toolsLimited')}
          {model && model.provider !== 'claude' ? ` ${t('agent.toolsClaudeOnly')}` : ''}
        </span>
      </PanelSection>

      <PanelSection
        title={t('agent.skills')}
        summary={String(agentSkills.length)}
        defaultOpen={isOpen('skills', focus)}
        focused={focus === 'skills'}
        testId="office-agent-section-skills"
      >
        <ChipMultiSelect options={skillOptions} value={agentSkills} onChange={setAgentSkills} emptyLabel={t('agent.noSkills')} ariaLabel={t('agent.skills')} />
      </PanelSection>

      {feedback && (
        <p className={feedback.tone === 'error' ? 'text-xs text-red-600 dark:text-red-300' : 'text-xs text-emerald-700 dark:text-emerald-300'}>
          {feedback.text}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        {!isProtected ? (
          <Button
            type="button"
            size="sm"
            variant={confirmDelete ? 'destructive' : 'ghost'}
            className="h-8 gap-1.5 px-2.5 text-xs"
            disabled={isSaving}
            onClick={() => (confirmDelete ? void remove() : setConfirmDelete(true))}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {confirmDelete ? t('division.confirmDelete') : t('division.delete')}
          </Button>
        ) : (
          <span className="text-[10px] text-muted-foreground">{t('division.protected')}</span>
        )}
        <Button type="submit" size="sm" className="h-8 px-3 text-xs" disabled={isSaving || (!divisionChanged && !agentChanged) || !name.trim() || !agentName.trim()}>
          {isSaving ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </form>
  );
}

/** Picks which session of this division to show and renders its transcript. */
function DivisionTranscript({ division, caseItem, tasks, focusTaskId, onOpenSession }: AgentPanelProps) {
  const { t } = useTranslation('office');
  const ownTasks = division.isAudit
    ? tasks.filter((task) => task.auditSessionId)
    : tasks.filter((task) => task.divisionId === division.id);
  const defaultTask = ownTasks.find((task) => task.id === focusTaskId)
    ?? ownTasks.find((task) => task.status === 'running')
    ?? [...ownTasks].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  // Task whose session the transcript shows; the timeline's pick or the most relevant one.
  const [pickedTaskId, setPickedTaskId] = useState<string | null>(null);
  const task = ownTasks.find((candidate) => candidate.id === pickedTaskId) ?? defaultTask;

  if (!caseItem) {
    return <p className="text-xs text-muted-foreground">{t('agent.noCase')}</p>;
  }

  if (division.isCoordinator) {
    return <TranscriptView sessionId={caseItem.coordinatorSessionId} onOpenSession={onOpenSession} />;
  }

  if (ownTasks.length === 0 || !task) {
    return <p className="text-xs text-muted-foreground">{t('agent.noTasks')}</p>;
  }

  const sessionId = division.isAudit ? task.auditSessionId : task.sessionId;
  return (
    <section className="space-y-2">
      <label className="flex items-center gap-2">
        <span className="shrink-0 text-[11px] text-muted-foreground">{t('agent.task')}</span>
        <select
          value={task.id}
          onChange={(event) => setPickedTaskId(event.target.value)}
          className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs"
        >
          {ownTasks.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>{`${candidate.ref} · ${candidate.title}`}</option>
          ))}
        </select>
        <OfficeStatusBadge tone={officeTaskTone(task.status)} label={t(`taskStatus.${task.status}`)} />
      </label>
      {!division.isAudit && task.resultSummary && (
        <div className="rounded-[10px] border border-border bg-card/60 p-2 text-xs">
          <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">{t('agent.result')}</span>
          <p className="whitespace-pre-wrap">{task.resultSummary}</p>
        </div>
      )}
      {task.auditNotes && (
        <div className="rounded-[10px] border border-navy/20 bg-navy/5 p-2 text-xs dark:border-blue-300/20">
          <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">{t('agent.auditNotes')}</span>
          <p className="whitespace-pre-wrap">{task.auditNotes}</p>
        </div>
      )}
      <TranscriptView sessionId={sessionId} onOpenSession={onOpenSession} />
    </section>
  );
}
