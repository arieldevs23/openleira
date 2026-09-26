import { AlertTriangle, Building2, CheckCircle2, ChevronRight, FolderPlus, Loader2, Settings2, Trash2, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import CaseList from '@/modules/office/CaseList';
import MarkdownPreview from '@/modules/office/MarkdownPreview';
import { analysisStage } from '@/modules/office/utils/officeAnalysis';
import { ContextMenu } from '@/shared/ui';
import type { OfficeAnalysis, OfficeCase, OfficeDivision, OfficeWorkspaceSummary } from '@/shared/types';
import { cn } from '@/shared/utils';

const COLLAPSE_STORAGE_KEY = 'office-sidebar-collapsed';

type SidebarGroup = 'workspaces' | 'cases' | 'agents';

const readCollapsed = (): Set<SidebarGroup> => {
  try {
    const stored = JSON.parse(window.localStorage.getItem(COLLAPSE_STORAGE_KEY) ?? '[]') as unknown;
    return new Set(Array.isArray(stored) ? stored.filter((value): value is SidebarGroup => typeof value === 'string') : []);
  } catch {
    return new Set();
  }
};

type WorkspaceSidebarProps = {
  workspaces: OfficeWorkspaceSummary[] | null;
  workspacesError: string | null;
  selectedProjectId: string | null;
  onSelectWorkspace: (projectId: string) => void;
  onAddWorkspace: () => void;
  /** App analyses running in the background or waiting for review. */
  analyses: OfficeAnalysis[];
  onOpenAnalysis: (analysisId: string) => void;
  onDismissAnalysis: (analysisId: string) => void;
  onOpenSettings: () => void;
  onDeleteWorkspace: (workspace: OfficeWorkspaceSummary) => void;
  /** The selected workspace's cases and divisions; empty while it loads. */
  cases: OfficeCase[];
  divisions: OfficeDivision[];
  selectedCaseId: string | null;
  onSelectCase: (caseId: string) => void;
  onCreateCase: (input: { title: string; description: string }) => Promise<void>;
  selectedDivisionId: string | null;
  onSelectDivision: (divisionId: string) => void;
};

/**
 * Left column of workspace mode: every workspace (one per app folder), and
 * for the open one its cases and its agents. Each group folds, each agent
 * unfolds to show its model and its role as rendered markdown. Replaces the
 * project/chat sidebar while workspace mode is on.
 */
export default function WorkspaceSidebar({
  workspaces,
  workspacesError,
  selectedProjectId,
  onSelectWorkspace,
  onAddWorkspace,
  analyses,
  onOpenAnalysis,
  onDismissAnalysis,
  onOpenSettings,
  onDeleteWorkspace,
  cases,
  divisions,
  selectedCaseId,
  onSelectCase,
  onCreateCase,
  selectedDivisionId,
  onSelectDivision,
}: WorkspaceSidebarProps) {
  const { t } = useTranslation('office');
  // Groups the user folded; remembered in this browser.
  const [collapsed, setCollapsed] = useState<Set<SidebarGroup>>(readCollapsed);
  // Agents unfolded to show their role.
  const [expandedAgents, setExpandedAgents] = useState<ReadonlySet<string>>(() => new Set());
  // The right-click menu of a workspace row.
  const [menu, setMenu] = useState<{ position: { x: number; y: number }; workspace: OfficeWorkspaceSummary } | null>(null);

  const toggleGroup = (group: SidebarGroup) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(group)) next.delete(group); else next.add(group);
      try {
        window.localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // Not remembered in private windows.
      }
      return next;
    });
  };

  const group = (id: SidebarGroup, title: string, count: number | null, children: ReactNode, action?: ReactNode) => {
    const isOpen = !collapsed.has(id);
    return (
      <section className="border-b border-border/50 py-1.5" data-testid={`office-sidebar-${id}`} data-open={isOpen ? 'true' : 'false'}>
        <div className="flex items-center gap-1 px-2">
          <button
            type="button"
            aria-expanded={isOpen}
            onClick={() => toggleGroup(id)}
            className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-1 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 transition-transform', isOpen && 'rotate-90')} />
            <span className="truncate">{title}</span>
            {count !== null && <span className="font-normal normal-case tracking-normal">{count}</span>}
          </button>
          {action}
        </div>
        {isOpen && <div className="px-2 pt-1">{children}</div>}
      </section>
    );
  };

  const selectedWorkspace = workspaces?.find((workspace) => workspace.projectId === selectedProjectId) ?? null;

  return (
    <nav className="flex h-full min-h-0 flex-col" aria-label={t('sidebar.label')}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {group('workspaces', t('sidebar.workspaces'), workspaces?.length ?? null, (
          <div className="space-y-0.5">
            {workspaces === null && (
              <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t('loading')}</div>
            )}
            {workspacesError && <p className="px-2 text-xs text-err">{workspacesError}</p>}
            {workspaces?.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">{t('sidebar.noWorkspaces')}</p>}
            {workspaces?.map((workspace) => {
              const isSelected = workspace.projectId === selectedProjectId;
              return (
                <button
                  key={workspace.office.id}
                  type="button"
                  aria-current={isSelected}
                  onClick={() => onSelectWorkspace(workspace.projectId)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setMenu({ position: { x: event.clientX, y: event.clientY }, workspace });
                  }}
                  className={cn(
                    'flex w-full flex-col rounded-[10px] px-2.5 py-1.5 text-left hover:bg-muted/70',
                    isSelected && 'bg-primary/10 hover:bg-primary/10',
                  )}
                  title={workspace.office.projectPath}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">{workspace.office.name}</span>
                    {workspace.activeCases > 0 && (
                      <span className="shrink-0 rounded-full bg-primary/15 px-1.5 text-[10px] text-primary" title={t('sidebar.activeCases', { count: workspace.activeCases })}>
                        {workspace.activeCases}
                      </span>
                    )}
                  </span>
                  <span className="truncate text-[10.5px] text-muted-foreground">{workspace.office.projectPath}</span>
                </button>
              );
            })}
            {analyses.map((analysis) => {
              const isRunning = analysis.status === 'running';
              const lastStep = analysis.steps[analysis.steps.length - 1];
              const detail = isRunning
                ? `${t(`addWorkspace.stage.${analysisStage(analysis)}`)} · ${t('addWorkspace.stepCount', { count: analysis.stepCount })}`
                : analysis.status === 'done' ? t('sidebar.analysisReady') : t('sidebar.analysisStopped');
              return (
                <div key={analysis.id} className="group flex items-center rounded-[10px] hover:bg-muted/70" data-testid={`office-sidebar-analysis-${analysis.status}`}>
                  <button
                    type="button"
                    onClick={() => onOpenAnalysis(analysis.id)}
                    className="flex min-w-0 flex-1 items-start gap-2 px-2.5 py-1.5 text-left"
                    title={lastStep?.text}
                  >
                    {isRunning
                      ? <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                      : analysis.status === 'done'
                        ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" />
                        : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-foreground">{t('sidebar.analysisOf', { name: analysis.projectName })}</span>
                      <span className="block truncate text-[10.5px] text-muted-foreground">{detail}</span>
                    </span>
                  </button>
                  {!isRunning && (
                    <button
                      type="button"
                      onClick={() => onDismissAnalysis(analysis.id)}
                      className="mr-1 rounded-md p-1 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
                      aria-label={t('sidebar.dismissAnalysis', { name: analysis.projectName })}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
            <button
              type="button"
              onClick={onAddWorkspace}
              className="flex w-full items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-left text-xs text-primary hover:bg-primary/10"
              data-testid="office-add-workspace"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              {t('sidebar.addWorkspace')}
            </button>
          </div>
        ))}

        {selectedWorkspace && group('cases', t('cases.title'), cases.length, (
          <CaseList cases={cases} selectedCaseId={selectedCaseId} onSelect={onSelectCase} onCreate={onCreateCase} variant="section" />
        ))}

        {selectedWorkspace && group('agents', t('sidebar.agents'), divisions.length, (
          <ul className="space-y-0.5">
            {divisions.map((division) => {
              const isExpanded = expandedAgents.has(division.id);
              const { agent } = division;
              return (
                <li key={division.id} data-testid={`office-sidebar-agent-${division.slug}`}>
                  <div className={cn('flex items-center gap-0.5 rounded-[10px] hover:bg-muted/70', selectedDivisionId === division.id && 'bg-primary/10 hover:bg-primary/10')}>
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      aria-label={t(isExpanded ? 'sidebar.collapseAgent' : 'sidebar.expandAgent', { name: agent.name })}
                      onClick={() => setExpandedAgents((current) => {
                        const next = new Set(current);
                        if (next.has(division.id)) next.delete(division.id); else next.add(division.id);
                        return next;
                      })}
                      className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                    >
                      <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', isExpanded && 'rotate-90')} />
                    </button>
                    <button type="button" onClick={() => onSelectDivision(division.id)} className="flex min-w-0 flex-1 items-center gap-1.5 py-1 pr-2 text-left">
                      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: division.color }} />
                      <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                        {agent.name}
                        <span className="text-muted-foreground"> · {division.name}</span>
                      </span>
                      {!agent.enabled && <span className="shrink-0 text-[10px] text-muted-foreground">{t('tree.disabled')}</span>}
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="mb-1 ml-6 mr-1 space-y-1 rounded-md border border-border/70 bg-card/50 p-2">
                      <p className="font-mono text-[10.5px] text-muted-foreground">
                        {agent.provider && agent.model ? `${agent.provider} · ${agent.model}` : t('tree.noModel')}
                      </p>
                      {agent.rolePrompt.trim()
                        ? <MarkdownPreview markdown={agent.rolePrompt} className="max-h-60 overflow-y-auto" />
                        : <p className="text-[11px] text-muted-foreground">{t('agent.roleEmpty')}</p>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ))}
      </div>

      {menu && (
        <ContextMenu
          position={menu.position}
          ariaLabel={t('menu.label')}
          onClose={() => setMenu(null)}
          items={[
            { key: 'open', label: t('sidebar.open'), icon: Building2, onSelect: () => onSelectWorkspace(menu.workspace.projectId) },
            {
              key: 'settings', label: t('toolbar.settings'), icon: Settings2,
              onSelect: () => { onSelectWorkspace(menu.workspace.projectId); onOpenSettings(); },
            },
            {
              key: 'delete', label: t('sidebar.deleteWorkspace'), icon: Trash2, isDanger: true, showDividerBefore: true,
              onSelect: () => onDeleteWorkspace(menu.workspace),
            },
          ]}
        />
      )}
    </nav>
  );
}
