import { ArrowRight, Building2, Cpu, FolderPlus, Loader2, Menu, PanelRight, Plug, Plus, Settings2, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AgentPanel from '@/modules/office/AgentPanel';
import CasePanel from '@/modules/office/CasePanel';
import MessagesPanel from '@/modules/office/MessagesPanel';
import OfficeCanvas from '@/modules/office/OfficeCanvas';
import ResultFilesPanel from '@/modules/office/ResultFilesPanel';
import SkillsPanel from '@/modules/office/SkillsPanel';
import UsagePanel from '@/modules/office/UsagePanel';
import WorkspaceSidebar from '@/modules/office/WorkspaceSidebar';
import { useCaseDetail } from '@/modules/office/hooks/useCaseDetail';
import { useCaseUsage } from '@/modules/office/hooks/useCaseUsage';
import { useInstalledSkills } from '@/modules/office/hooks/useInstalledSkills';
import { useOffice } from '@/modules/office/hooks/useOffice';
import { OFFICE_PROVIDER_LABELS, useOfficeProviders } from '@/modules/office/hooks/useOfficeProviders';
import { useProviderModelCatalog } from '@/modules/office/hooks/useProviderModelCatalog';
import { useWorkspaces } from '@/modules/office/hooks/useWorkspaces';
import AddWorkspaceModal from '@/modules/office/modals/AddWorkspaceModal';
import ConfirmModal from '@/modules/office/modals/ConfirmModal';
import DivisionModal from '@/modules/office/modals/DivisionModal';
import ModelWizardModal from '@/modules/office/modals/ModelWizardModal';
import OfficeSettingsModal from '@/modules/office/modals/OfficeSettingsModal';
import PermissionWarningModal from '@/modules/office/modals/PermissionWarningModal';
import type { CanvasPoint } from '@/modules/office/utils/officeCanvasLayout';
import { ProviderLoginModal } from '@/modules/provider-auth';
import { api, readApiJson } from '@/shared/api';
import { Button } from '@/shared/ui';
import type { LLMProvider, OfficeDivision, OfficeSelection, OfficeTask, OfficeWorkspaceSummary } from '@/shared/types';
import { cn } from '@/shared/utils';

/** Below this width the sidebar and the right panel turn into drawers. */
const NARROW_LAYOUT_QUERY = '(max-width: 899px)';
const SELECTED_WORKSPACE_KEY = 'office-selected-project';

type CaseTab = 'result' | 'files' | 'usage';

/** Tracks whether the viewport is in the narrow (drawer) layout. */
function useIsNarrowLayout(): boolean {
  const readMatch = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(NARROW_LAYOUT_QUERY).matches
    : false);
  // Mirrors the media query so the side columns can switch between column and drawer.
  const [isNarrow, setIsNarrow] = useState(readMatch);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return undefined;
    }
    const query = window.matchMedia(NARROW_LAYOUT_QUERY);
    const update = () => setIsNarrow(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  return isNarrow;
}

const readStoredWorkspace = (): string | null => {
  try {
    return window.localStorage.getItem(SELECTED_WORKSPACE_KEY);
  } catch {
    return null;
  }
};

type OfficePageProps = {
  /** The project open in normal mode; its workspace is shown first when it has one. */
  initialProjectId: string | null;
  /** Opens a workspace session in the regular chat view. */
  onOpenSession: (sessionId: string) => void;
};

/**
 * Workspace mode: every workspace (an AI team working in one app folder) in
 * its own sidebar, the selected workspace's canvas in the middle, and the
 * case result, files, tokens or the picked agent on the right. Rendered by
 * the project-workspace module in place of the project sidebar and tabs.
 */
export default function OfficePage({ initialProjectId, onOpenSession }: OfficePageProps) {
  const { t, i18n } = useTranslation('office');
  const { workspaces, error: workspacesError } = useWorkspaces();
  const isNarrow = useIsNarrowLayout();

  // The workspace on screen, by its project folder id.
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(() => readStoredWorkspace() ?? initialProjectId);

  // Falls back to a listed workspace when the remembered one is gone (or none was remembered).
  useEffect(() => {
    if (!workspaces || workspaces.length === 0) {
      return;
    }
    if (!selectedProjectId || !workspaces.some((workspace) => workspace.projectId === selectedProjectId)) {
      const preferred = workspaces.find((workspace) => workspace.projectId === initialProjectId) ?? workspaces[0];
      setSelectedProjectId(preferred.projectId);
    }
  }, [initialProjectId, selectedProjectId, workspaces]);

  const selectWorkspace = (projectId: string) => {
    setSelectedProjectId(projectId);
    try {
      window.localStorage.setItem(SELECTED_WORKSPACE_KEY, projectId);
    } catch {
      // Not remembered in private windows.
    }
  };

  const { snapshot, loadState, loadError, reload, actions } = useOffice(selectedProjectId);
  const modelCatalog = useProviderModelCatalog();
  const providers = useOfficeProviders();
  const selectedWorkspace = workspaces?.find((workspace) => workspace.projectId === selectedProjectId) ?? null;
  const installedSkills = useInstalledSkills(snapshot?.office.projectPath ?? '');

  // The case shown in the canvas and the right panel; follows the newest case until the user picks one.
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  // What the right panel shows: the case, a division/agent, its messages, an arrow, or the skills layer.
  const [selection, setSelection] = useState<OfficeSelection>({ type: 'case' });
  // Which view of the case the right panel shows.
  const [caseTab, setCaseTab] = useState<CaseTab>('result');
  // Narrow layout only: whether the sidebar drawer is open.
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // Narrow layout only: whether the right drawer is open.
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  // Whether the provider + model setup is open (also opened once while setup is unfinished).
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  // The wizard step to open on; unset lets the wizard choose from the connected providers.
  const [wizardStep, setWizardStep] = useState<'providers' | 'models' | undefined>(undefined);
  // "Add agent" dialog: undefined = closed, null = automatic place, a point = where the canvas was right-clicked.
  const [newDivisionAt, setNewDivisionAt] = useState<CanvasPoint | null | undefined>(undefined);
  // Whether the workspace settings dialog is open.
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  // Whether the add-workspace dialog is open.
  const [isAddOpen, setIsAddOpen] = useState(false);
  // The case waiting on the one-time bypass-permissions warning before it starts.
  const [pendingStartCaseId, setPendingStartCaseId] = useState<string | null>(null);
  // A delete waiting for confirmation.
  const [pendingDelete, setPendingDelete] = useState<
    { kind: 'workspace'; workspace: OfficeWorkspaceSummary } | { kind: 'division'; division: OfficeDivision } | null
  >(null);
  // "Create workspace" for a folder that has none, in flight.
  const [isCreating, setIsCreating] = useState(false);
  // Error from a page-level action, shown in a banner.
  const [pageError, setPageError] = useState<string | null>(null);
  const autoWizardOfficeRef = useRef<string | null>(null);

  const office = snapshot?.office ?? null;
  const divisions = useMemo(() => snapshot?.divisions ?? [], [snapshot?.divisions]);
  const flow = useMemo(() => snapshot?.flow ?? [], [snapshot?.flow]);
  const cases = useMemo(() => snapshot?.cases ?? [], [snapshot?.cases]);
  const missingModelAgents = divisions.filter((division) => division.agent.enabled && (!division.agent.provider || !division.agent.model));
  const connectedProviders = providers.connected;
  // Only a logged-in provider's models are offered; the others could not run.
  const modelGroups = useMemo(
    () => modelCatalog.filter((group) => connectedProviders.includes(group.provider)),
    [connectedProviders, modelCatalog],
  );
  const providersChecked = !providers.isChecking;
  const noProviderConnected = providersChecked && connectedProviders.length === 0;
  const disconnectedProviders = providersChecked
    ? [...new Set(divisions
      .filter((division) => division.agent.enabled && division.agent.provider && !connectedProviders.includes(division.agent.provider))
      .map((division) => division.agent.provider as LLMProvider))]
    : [];

  const activeCaseId = cases.some((caseItem) => caseItem.id === selectedCaseId) ? selectedCaseId : cases[0]?.id ?? null;
  const detail = useCaseDetail(office?.id ?? null, activeCaseId);
  const caseItem = detail?.case ?? cases.find((candidate) => candidate.id === activeCaseId) ?? null;
  const tasks = detail?.tasks ?? [];
  const messages = detail?.messages ?? [];
  const usage = useCaseUsage(office?.id ?? null, activeCaseId);
  const usageByDivision = useMemo(() => {
    const totals = new Map<string, number>();
    for (const session of usage?.sessions ?? []) {
      if (session.divisionId) {
        totals.set(session.divisionId, (totals.get(session.divisionId) ?? 0) + session.total);
      }
    }
    return totals;
  }, [usage]);

  // The setup wizard opens by itself once per workspace while its setup is unfinished.
  useEffect(() => {
    if (!office || !providersChecked || autoWizardOfficeRef.current === office.id) {
      return;
    }
    if (noProviderConnected || missingModelAgents.length > 0) {
      autoWizardOfficeRef.current = office.id;
      setWizardStep(undefined);
      setIsWizardOpen(true);
    }
  }, [missingModelAgents.length, noProviderConnected, office, providersChecked]);

  const openWizard = (step?: 'providers' | 'models') => {
    setWizardStep(step);
    setIsWizardOpen(true);
  };

  // The login shell and the wizard are both modal, so the wizard steps aside while a
  // provider logs in and comes back on the provider step afterwards.
  const connectProvider = (provider: LLMProvider) => {
    setIsWizardOpen(false);
    setIsAddOpen(false);
    providers.openLogin(provider);
  };

  const closeProviderLogin = () => {
    providers.closeLogin();
    openWizard('providers');
  };

  const select = (next: OfficeSelection) => {
    setSelection(next);
    setIsPanelOpen(true);
  };

  const selectTask = (task: OfficeTask) => {
    if (task.divisionId) {
      select({ type: 'division', divisionId: task.divisionId, taskId: task.id, focus: 'work' });
    }
  };

  const reportError = (error: unknown) => {
    setPageError(error instanceof Error ? error.message : String(error));
  };

  const createDefaultWorkspace = async () => {
    setIsCreating(true);
    setPageError(null);
    try {
      await actions.createOffice(i18n.language || 'id');
    } catch (error) {
      reportError(error);
    } finally {
      setIsCreating(false);
    }
  };

  const startCase = async () => {
    if (!office || !caseItem) {
      return;
    }
    if (office.permissionMode === 'bypassPermissions' && !office.permissionWarningAcknowledged) {
      setPendingStartCaseId(caseItem.id);
      return;
    }
    await actions.caseAction(caseItem.id, 'start');
  };

  const confirmPermissionAndStart = async () => {
    setPageError(null);
    try {
      await actions.updateOffice({ permissionWarningAcknowledged: true });
      if (pendingStartCaseId) {
        await actions.caseAction(pendingStartCaseId, 'start');
      }
    } catch (error) {
      reportError(error);
    } finally {
      setPendingStartCaseId(null);
    }
  };

  const selectedDivision = selection.type === 'division' || selection.type === 'messages'
    ? divisions.find((division) => division.id === selection.divisionId) ?? null
    : null;

  // ----- right panel -----
  const renderPanel = () => {
    if (!office) {
      return null;
    }
    if (selection.type === 'skills') {
      return (
        <SkillsPanel
          divisions={divisions}
          skills={installedSkills}
          onSelectDivision={(divisionId) => select({ type: 'division', divisionId, focus: 'skills' })}
        />
      );
    }
    if (selection.type === 'messages' && selectedDivision) {
      return <MessagesPanel division={selectedDivision} divisions={divisions} messages={messages} />;
    }
    if (selection.type === 'edge') {
      const from = divisions.find((division) => division.id === selection.fromDivisionId);
      const to = divisions.find((division) => division.id === selection.toDivisionId);
      if (from && to) {
        return (
          <div className="space-y-3" data-testid="office-edge-panel">
            <h2 className="flex items-center gap-1.5 text-base font-semibold text-foreground">
              {from.name}
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              {to.name}
            </h2>
            <p className="text-xs text-muted-foreground">{t('flow.explain', { from: from.name, to: to.name })}</p>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 px-3 text-xs"
              onClick={() => {
                actions.deleteFlowEdge(from.id, to.id).then(() => setSelection({ type: 'case' })).catch(reportError);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t('menu.deleteArrow')}
            </Button>
          </div>
        );
      }
    }
    if (selection.type === 'division' && selectedDivision) {
      return (
        <AgentPanel
          division={selectedDivision}
          caseItem={caseItem}
          tasks={tasks}
          focusTaskId={selection.taskId}
          focus={selection.focus}
          modelGroups={modelGroups}
          skills={installedSkills}
          actions={actions}
          onDeleted={() => setSelection({ type: 'case' })}
          onOpenSession={onOpenSession}
        />
      );
    }
    if (!caseItem) {
      return <p className="text-sm text-muted-foreground">{t('case.noCaseSelected')}</p>;
    }
    return (
      <div className="flex flex-col gap-3">
        <div role="tablist" aria-label={t('panel.caseViews')} className="flex gap-0.5 rounded-[10px] border border-border bg-muted/40 p-0.5">
          {(['result', 'files', 'usage'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={caseTab === tab}
              onClick={() => setCaseTab(tab)}
              className={cn(
                'flex-1 rounded-[8px] px-2 py-1 text-xs transition-colors',
                caseTab === tab ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
              data-testid={`office-case-tab-${tab}`}
            >
              {t(`panel.${tab}`)}
            </button>
          ))}
        </div>
        {caseTab === 'result' && (
          <CasePanel
            caseItem={caseItem}
            tasks={tasks}
            messages={messages}
            divisions={divisions}
            missingModelAgents={missingModelAgents}
            disconnectedProviders={disconnectedProviders.map((provider) => OFFICE_PROVIDER_LABELS[provider])}
            onConnectProviders={() => openWizard('providers')}
            actions={actions}
            onStart={startCase}
            onOpenWizard={() => openWizard()}
            onSelectTask={selectTask}
            onOpenSession={onOpenSession}
          />
        )}
        {caseTab === 'files' && selectedProjectId && (
          <ResultFilesPanel projectId={selectedProjectId} projectPath={office.projectPath} tasks={tasks} divisions={divisions} />
        )}
        {caseTab === 'usage' && <UsagePanel usage={usage} divisions={divisions} tasks={tasks} />}
      </div>
    );
  };

  // ----- main area -----
  const renderMain = () => {
    if (workspaces !== null && workspaces.length === 0 && loadState !== 'ready') {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="glass-surface flex h-14 w-14 items-center justify-center rounded-[14px] border">
            <Building2 className="h-7 w-7 text-primary" />
          </div>
          <div className="max-w-md space-y-1.5">
            <h2 className="text-lg font-semibold text-foreground">{t('empty.title')}</h2>
            <p className="text-sm text-muted-foreground">{t('empty.body')}</p>
          </div>
          <Button onClick={() => setIsAddOpen(true)} className="gap-2" data-testid="office-empty-add">
            <FolderPlus className="h-4 w-4" />
            {t('sidebar.addWorkspace')}
          </Button>
        </div>
      );
    }
    if (loadState === 'loading') {
      return (
        <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('loading')}
        </div>
      );
    }
    if (loadState === 'error') {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-sm text-err">{t('loadError', { message: loadError ?? '' })}</p>
          <Button size="sm" variant="outline" onClick={() => void reload()}>{t('retry')}</Button>
        </div>
      );
    }
    if (!office) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="max-w-sm text-sm text-muted-foreground">{selectedProjectId ? t('empty.folderWithout') : t('empty.pick')}</p>
          <div className="flex gap-2">
            {selectedProjectId && (
              <Button size="sm" onClick={() => void createDefaultWorkspace()} disabled={isCreating}>
                {isCreating ? t('empty.creating') : t('empty.create')}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setIsAddOpen(true)}>{t('sidebar.addWorkspace')}</Button>
          </div>
          {pageError && <p className="text-xs text-err">{pageError}</p>}
        </div>
      );
    }
    return (
      <OfficeCanvas
        key={`${office.id}:${activeCaseId ?? 'no-case'}`}
        officeId={office.id}
        projectName={selectedWorkspace?.projectName ?? office.name}
        divisions={divisions}
        flow={flow}
        caseItem={caseItem}
        tasks={tasks}
        messages={messages}
        selection={selection}
        onSelect={select}
        usageByDivision={usageByDivision}
        actions={actions}
        onAddDivisionAt={(position) => setNewDivisionAt(position)}
        onDeleteDivision={(division) => setPendingDelete({ kind: 'division', division })}
      />
    );
  };

  const sidebar = (
    <WorkspaceSidebar
      workspaces={workspaces}
      workspacesError={workspacesError}
      selectedProjectId={selectedProjectId}
      onSelectWorkspace={(projectId) => {
        selectWorkspace(projectId);
        setSelectedCaseId(null);
        setSelection({ type: 'case' });
        setIsSidebarOpen(false);
      }}
      onAddWorkspace={() => setIsAddOpen(true)}
      onOpenSettings={() => setIsSettingsOpen(true)}
      onDeleteWorkspace={(workspace) => setPendingDelete({ kind: 'workspace', workspace })}
      cases={cases}
      divisions={divisions}
      selectedCaseId={activeCaseId}
      onSelectCase={(caseId) => {
        setSelectedCaseId(caseId);
        setSelection({ type: 'case' });
        setIsSidebarOpen(false);
      }}
      onCreateCase={async (input) => {
        const created = await actions.createCase(input);
        setSelectedCaseId(created.id);
        setSelection({ type: 'case' });
      }}
      selectedDivisionId={selection.type === 'division' ? selection.divisionId : null}
      onSelectDivision={(divisionId) => {
        select({ type: 'division', divisionId });
        setIsSidebarOpen(false);
      }}
    />
  );

  const toolbarButton = (label: string, Icon: typeof Plug, onClick: () => void, testId?: string) => (
    <Button size="sm" variant="ghost" className="h-8 gap-1.5 px-2 text-xs" onClick={onClick} title={label} aria-label={label} data-testid={testId}>
      <Icon className="h-3.5 w-3.5" />
      <span className="hidden xl:inline">{label}</span>
    </Button>
  );

  const bannerClass = 'flex flex-wrap items-center gap-2 border-b border-warn/30 bg-warn/5 px-3 py-1.5 text-xs text-warn';

  return (
    <div className="flex h-full min-h-0" data-testid="office-page">
      {!isNarrow && (
        <aside className="w-[248px] shrink-0 border-r border-border/60">{sidebar}</aside>
      )}
      {isNarrow && isSidebarOpen && (
        <>
          <button type="button" aria-label={t('common.close')} className="fixed inset-0 z-30 bg-black/30" onClick={() => setIsSidebarOpen(false)} />
          <aside className="glass-surface-strong fixed inset-y-0 left-0 z-40 w-[min(300px,86vw)] border-r">{sidebar}</aside>
        </>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1 border-b border-border/60 px-2 py-1.5">
          {isNarrow && (
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setIsSidebarOpen(true)} aria-label={t('sidebar.open')}>
              <Menu className="h-4 w-4" />
            </Button>
          )}
          <h1 className="min-w-0 flex-1 truncate px-1 text-sm font-semibold text-foreground">{office?.name ?? t('sidebar.title')}</h1>
          {office && (
            <>
              {toolbarButton(t('toolbar.providers'), Plug, () => openWizard('providers'))}
              {toolbarButton(t('toolbar.models'), Cpu, () => openWizard())}
              {toolbarButton(t('toolbar.addDivision'), Plus, () => setNewDivisionAt(null), 'office-toolbar-add-agent')}
              {toolbarButton(t('toolbar.settings'), Settings2, () => setIsSettingsOpen(true))}
              {isNarrow && (
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setIsPanelOpen(true)} aria-label={t('panel.label')}>
                  <PanelRight className="h-4 w-4" />
                </Button>
              )}
            </>
          )}
        </div>

        {office && (noProviderConnected ? (
          <div data-testid="office-setup-banner" className={bannerClass}>
            <span>{t('providers.noneBanner')}</span>
            <button type="button" className="font-medium underline underline-offset-2" onClick={() => openWizard('providers')}>{t('providers.connectAction')}</button>
          </div>
        ) : disconnectedProviders.length > 0 ? (
          <div data-testid="office-setup-banner" className={bannerClass}>
            <span>{t('providers.disconnectedBanner', { providers: disconnectedProviders.map((provider) => OFFICE_PROVIDER_LABELS[provider]).join(', ') })}</span>
            <button type="button" className="font-medium underline underline-offset-2" onClick={() => openWizard('providers')}>{t('providers.connectAction')}</button>
          </div>
        ) : missingModelAgents.length > 0 && (
          <div data-testid="office-setup-banner" className={bannerClass}>
            <span>{t('missingModels.banner', { count: missingModelAgents.length })}</span>
            <button type="button" className="font-medium underline underline-offset-2" onClick={() => openWizard('models')}>{t('missingModels.action')}</button>
          </div>
        ))}
        {pageError && office && (
          <div className="flex items-center gap-2 border-b border-err/30 bg-err/5 px-3 py-1.5 text-xs text-err">
            <span className="min-w-0 flex-1">{pageError}</span>
            <button type="button" onClick={() => setPageError(null)} aria-label={t('common.close')}><X className="h-3.5 w-3.5" /></button>
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          <main className="min-h-0 min-w-0 flex-1">{renderMain()}</main>

          {office && isNarrow && isPanelOpen && (
            <button type="button" aria-label={t('common.close')} className="fixed inset-0 z-30 bg-black/30 backdrop-blur-[1px]" onClick={() => setIsPanelOpen(false)} />
          )}
          {office && (
            <aside
              className={cn(
                'overflow-y-auto p-4',
                isNarrow
                  ? cn(
                    'glass-surface-strong fixed inset-y-0 right-0 z-40 w-[min(420px,92vw)] border-l transition-transform duration-200 ease-out',
                    isPanelOpen ? 'translate-x-0' : 'translate-x-full',
                  )
                  : 'w-[340px] shrink-0 border-l border-border/60',
              )}
              aria-label={t('panel.label')}
              aria-hidden={isNarrow && !isPanelOpen ? true : undefined}
            >
              {isNarrow && (
                <div className="mb-2 flex justify-end">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setIsPanelOpen(false)} aria-label={t('common.close')}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              {selection.type !== 'case' && caseItem && (
                <button type="button" onClick={() => setSelection({ type: 'case' })} className="mb-3 text-[11px] text-primary hover:underline">
                  {t('panel.backToCase')}
                </button>
              )}
              {renderPanel()}
            </aside>
          )}
        </div>
      </div>

      {isWizardOpen && office && (
        <ModelWizardModal
          open
          onOpenChange={setIsWizardOpen}
          divisions={divisions}
          groups={modelGroups}
          providerStatuses={providers.statuses}
          connectedProviders={connectedProviders}
          isCheckingProviders={providers.isChecking}
          onConnectProvider={connectProvider}
          onRefreshProviders={() => void providers.refresh()}
          initialStep={wizardStep}
          onSave={actions.assignModels}
        />
      )}
      {providers.loginProvider && (
        <ProviderLoginModal isOpen provider={providers.loginProvider} onClose={closeProviderLogin} onComplete={providers.onLoginComplete} />
      )}
      {newDivisionAt !== undefined && (
        <DivisionModal
          open
          onOpenChange={(open) => { if (!open) setNewDivisionAt(undefined); }}
          onCreate={async (input) => {
            const division = await actions.createDivision({ ...input, position: newDivisionAt });
            select({ type: 'division', divisionId: division.id, focus: 'model' });
          }}
        />
      )}
      {isSettingsOpen && office && (
        <OfficeSettingsModal
          open
          onOpenChange={setIsSettingsOpen}
          office={office}
          onSave={async (changes) => {
            await actions.updateOffice(changes);
          }}
        />
      )}
      {isAddOpen && (
        <AddWorkspaceModal
          open
          onOpenChange={setIsAddOpen}
          locale={i18n.language || 'id'}
          groups={modelGroups}
          onConnectProviders={() => { setIsAddOpen(false); openWizard('providers'); }}
          onReady={(projectId) => {
            selectWorkspace(projectId);
            setSelectedCaseId(null);
            setSelection({ type: 'case' });
            if (projectId === selectedProjectId) {
              void reload();
            }
          }}
        />
      )}
      {pendingStartCaseId && (
        <PermissionWarningModal
          open
          onOpenChange={(open) => {
            if (!open) setPendingStartCaseId(null);
          }}
          onConfirm={confirmPermissionAndStart}
        />
      )}
      {pendingDelete?.kind === 'workspace' && (
        <ConfirmModal
          title={t('sidebar.deleteWorkspace')}
          body={t('sidebar.deleteWorkspaceBody', { name: pendingDelete.workspace.office.name, path: pendingDelete.workspace.office.projectPath })}
          confirmLabel={t('sidebar.deleteWorkspace')}
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => {
            const { workspace } = pendingDelete;
            if (workspace.projectId === selectedProjectId) {
              await actions.deleteOffice();
            } else {
              await readApiJson(await api.office.remove(workspace.office.id));
            }
            setPendingDelete(null);
          }}
        />
      )}
      {pendingDelete?.kind === 'division' && (
        <ConfirmModal
          title={t('menu.deleteDivision')}
          body={t('division.deleteBody', { name: pendingDelete.division.name })}
          confirmLabel={t('division.confirmDelete')}
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => {
            await actions.deleteDivision(pendingDelete.division.id);
            if (selection.type === 'division' && selection.divisionId === pendingDelete.division.id) {
              setSelection({ type: 'case' });
            }
            setPendingDelete(null);
          }}
        />
      )}
    </div>
  );
}
