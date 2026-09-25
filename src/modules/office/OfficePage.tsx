import { Building2, Cpu, Loader2, Plug, Plus, Settings2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AgentPanel from '@/modules/office/AgentPanel';
import CaseList from '@/modules/office/CaseList';
import CasePanel from '@/modules/office/CasePanel';
import MessagesPanel from '@/modules/office/MessagesPanel';
import OfficeTree from '@/modules/office/OfficeTree';
import SkillsPanel from '@/modules/office/SkillsPanel';
import { useCaseDetail } from '@/modules/office/hooks/useCaseDetail';
import { useInstalledSkills } from '@/modules/office/hooks/useInstalledSkills';
import { useOffice } from '@/modules/office/hooks/useOffice';
import { OFFICE_PROVIDER_LABELS, useOfficeProviders } from '@/modules/office/hooks/useOfficeProviders';
import { useProviderModelCatalog } from '@/modules/office/hooks/useProviderModelCatalog';
import DivisionModal from '@/modules/office/modals/DivisionModal';
import ModelWizardModal from '@/modules/office/modals/ModelWizardModal';
import OfficeSettingsModal from '@/modules/office/modals/OfficeSettingsModal';
import PermissionWarningModal from '@/modules/office/modals/PermissionWarningModal';
import { ProviderLoginModal } from '@/modules/provider-auth';
import { Button } from '@/shared/ui';
import type { LLMProvider, OfficeSelection, OfficeTask, Project } from '@/shared/types';
import { cn } from '@/shared/utils';

/** Below this width the right panel turns into a drawer and the tree scrolls sideways. */
const NARROW_LAYOUT_QUERY = '(max-width: 899px)';

/** Tracks whether the viewport is in the narrow (drawer) layout. */
function useIsNarrowLayout(): boolean {
  const readMatch = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(NARROW_LAYOUT_QUERY).matches
    : false);
  // Mirrors the media query so the panel can switch between column and drawer.
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

type OfficePageProps = {
  project: Project;
  /** Opens an office session in the regular chat view. */
  onOpenSession: (sessionId: string) => void;
};

/**
 * Kantor AI page for the active project. Rendered by the project-workspace
 * module when the sidebar's "kantor" entry is chosen.
 */
export default function OfficePage({ project, onOpenSession }: OfficePageProps) {
  const { t, i18n } = useTranslation('office');
  const { snapshot, loadState, loadError, reload, actions } = useOffice(project);
  const modelCatalog = useProviderModelCatalog();
  const providers = useOfficeProviders();
  const installedSkills = useInstalledSkills(project.fullPath);
  const isNarrow = useIsNarrowLayout();

  // The case shown in the tree and the case panel; follows the newest case until the user picks one.
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  // What the right panel shows: the case, a division/agent, its messages, or the skills layer.
  const [selection, setSelection] = useState<OfficeSelection>({ type: 'case' });
  // Below 900px the right panel is a drawer; this opens it. Ignored on wide screens.
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  // Whether the setup wizard is open (also opened once automatically while setup is unfinished).
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  // The wizard step to open on; unset lets the wizard choose from the connected providers.
  const [wizardStep, setWizardStep] = useState<'providers' | 'models' | undefined>(undefined);
  // Whether the "add division" dialog is open.
  const [isDivisionModalOpen, setIsDivisionModalOpen] = useState(false);
  // Whether the office settings dialog is open.
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  // The case waiting on the one-time bypass-permissions warning before it starts.
  const [pendingStartCaseId, setPendingStartCaseId] = useState<string | null>(null);
  // "Create office" request in flight.
  const [isCreating, setIsCreating] = useState(false);
  // Error from a page-level action (create office, confirm and start) shown in a banner.
  const [pageError, setPageError] = useState<string | null>(null);
  const autoWizardOfficeRef = useRef<string | null>(null);

  const office = snapshot?.office ?? null;
  const divisions = useMemo(() => snapshot?.divisions ?? [], [snapshot?.divisions]);
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

  // The setup wizard opens by itself once, the first time an office with unfinished setup
  // (no provider logged in, or agents without a model) is shown.
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
    providers.openLogin(provider);
  };

  const closeProviderLogin = () => {
    providers.closeLogin();
    openWizard('providers');
  };

  const select = (next: OfficeSelection) => {
    setSelection(next);
    setIsDrawerOpen(true);
  };

  const selectTask = (task: OfficeTask) => {
    if (task.divisionId) {
      select({ type: 'division', divisionId: task.divisionId, taskId: task.id });
    }
  };

  const createOffice = async () => {
    setIsCreating(true);
    setPageError(null);
    try {
      await actions.createOffice(i18n.language || 'id');
    } catch (error) {
      setPageError(error instanceof Error ? error.message : String(error));
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
      setPageError(error instanceof Error ? error.message : String(error));
    } finally {
      setPendingStartCaseId(null);
    }
  };

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
        <p className="text-sm text-red-600 dark:text-red-300">{t('loadError', { message: loadError ?? '' })}</p>
        <Button size="sm" variant="outline" onClick={() => void reload()}>{t('retry')}</Button>
      </div>
    );
  }

  if (loadState === 'missing' || !office) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="glass-surface flex h-14 w-14 items-center justify-center rounded-[14px] border">
          <Building2 className="h-7 w-7 text-primary" />
        </div>
        <div className="max-w-md space-y-1.5">
          <h2 className="text-lg font-semibold text-foreground">{t('empty.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('empty.body')}</p>
        </div>
        {pageError && <p className="text-xs text-red-600 dark:text-red-300">{pageError}</p>}
        <Button onClick={() => void createOffice()} disabled={isCreating} className="gap-2">
          {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
          {isCreating ? t('empty.creating') : t('empty.create')}
        </Button>
      </div>
    );
  }

  const selectedDivision = selection.type === 'division' || selection.type === 'messages'
    ? divisions.find((division) => division.id === selection.divisionId) ?? null
    : null;

  const renderPanel = () => {
    if (selection.type === 'skills') {
      return (
        <SkillsPanel
          divisions={divisions}
          skills={installedSkills}
          onSelectDivision={(divisionId) => select({ type: 'division', divisionId })}
        />
      );
    }
    if (selection.type === 'messages' && selectedDivision) {
      return <MessagesPanel division={selectedDivision} divisions={divisions} messages={messages} />;
    }
    if (selection.type === 'division' && selectedDivision) {
      return (
        <AgentPanel
          division={selectedDivision}
          caseItem={caseItem}
          tasks={tasks}
          focusTaskId={selection.taskId}
          modelGroups={modelGroups}
          skills={installedSkills}
          actions={actions}
          onDeleted={() => setSelection({ type: 'case' })}
          onOpenSession={onOpenSession}
        />
      );
    }
    if (caseItem) {
      return (
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
      );
    }
    return <p className="text-sm text-muted-foreground">{t('case.noCaseSelected')}</p>;
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2">
        <Building2 className="h-4 w-4 text-navy dark:text-blue-200" />
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{office.name}</h1>
        <Button size="sm" variant="ghost" className="h-8 gap-1.5 px-2.5 text-xs" onClick={() => openWizard('providers')}>
          <Plug className="h-3.5 w-3.5" />
          {t('toolbar.providers')}
        </Button>
        <Button size="sm" variant="ghost" className="h-8 gap-1.5 px-2.5 text-xs" onClick={() => openWizard()}>
          <Cpu className="h-3.5 w-3.5" />
          {t('toolbar.models')}
        </Button>
        <Button size="sm" variant="ghost" className="h-8 gap-1.5 px-2.5 text-xs" onClick={() => setIsDivisionModalOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          {t('toolbar.addDivision')}
        </Button>
        <Button size="sm" variant="ghost" className="h-8 gap-1.5 px-2.5 text-xs" onClick={() => setIsSettingsOpen(true)}>
          <Settings2 className="h-3.5 w-3.5" />
          {t('toolbar.settings')}
        </Button>
      </div>

      {noProviderConnected ? (
        <div data-testid="office-setup-banner" className="flex flex-wrap items-center gap-2 border-b border-amber-400/30 bg-amber-500/5 px-3 py-1.5 text-xs text-amber-800 dark:text-amber-200">
          <span>{t('providers.noneBanner')}</span>
          <button type="button" className="font-medium underline underline-offset-2" onClick={() => openWizard('providers')}>
            {t('providers.connectAction')}
          </button>
        </div>
      ) : disconnectedProviders.length > 0 ? (
        <div data-testid="office-setup-banner" className="flex flex-wrap items-center gap-2 border-b border-amber-400/30 bg-amber-500/5 px-3 py-1.5 text-xs text-amber-800 dark:text-amber-200">
          <span>{t('providers.disconnectedBanner', { providers: disconnectedProviders.map((provider) => OFFICE_PROVIDER_LABELS[provider]).join(', ') })}</span>
          <button type="button" className="font-medium underline underline-offset-2" onClick={() => openWizard('providers')}>
            {t('providers.connectAction')}
          </button>
        </div>
      ) : missingModelAgents.length > 0 && (
        <div data-testid="office-setup-banner" className="flex flex-wrap items-center gap-2 border-b border-amber-400/30 bg-amber-500/5 px-3 py-1.5 text-xs text-amber-800 dark:text-amber-200">
          <span>{t('missingModels.banner', { count: missingModelAgents.length })}</span>
          <button type="button" className="font-medium underline underline-offset-2" onClick={() => openWizard('models')}>
            {t('missingModels.action')}
          </button>
        </div>
      )}
      {pageError && (
        <div className="border-b border-red-500/30 bg-red-500/5 px-3 py-1.5 text-xs text-red-700 dark:text-red-300">{pageError}</div>
      )}

      <div className="relative flex min-h-0 flex-1 flex-col min-[900px]:grid min-[900px]:grid-cols-[216px_minmax(0,1fr)_minmax(300px,360px)]">
        <aside className="max-h-48 shrink-0 border-b border-border/60 min-[900px]:max-h-none min-[900px]:border-b-0 min-[900px]:border-r">
          <CaseList
            cases={cases}
            selectedCaseId={activeCaseId}
            onSelect={(caseId) => {
              setSelectedCaseId(caseId);
              select({ type: 'case' });
            }}
            onCreate={async (input) => {
              const created = await actions.createCase(input);
              setSelectedCaseId(created.id);
              setSelection({ type: 'case' });
            }}
          />
        </aside>

        <main className="min-h-0 min-w-0 flex-1">
          <OfficeTree
            key={activeCaseId ?? 'no-case'}
            projectName={project.displayName}
            divisions={divisions}
            caseItem={caseItem}
            tasks={tasks}
            messages={messages}
            selection={selection}
            onSelect={select}
          />
        </main>

        {isNarrow && isDrawerOpen && (
          <button
            type="button"
            aria-label={t('common.close')}
            className="fixed inset-0 z-30 bg-black/30 backdrop-blur-[1px]"
            onClick={() => setIsDrawerOpen(false)}
          />
        )}
        <aside
          className={cn(
            'overflow-y-auto p-4',
            isNarrow
              ? cn(
                'glass-surface-strong fixed inset-y-0 right-0 z-40 w-[min(420px,92vw)] border-l transition-transform duration-200 ease-out',
                isDrawerOpen ? 'translate-x-0' : 'translate-x-full',
              )
              : 'min-h-0 border-l border-border/60',
          )}
          aria-label={t('panel.label')}
          aria-hidden={isNarrow && !isDrawerOpen ? true : undefined}
        >
          {isNarrow && (
            <div className="mb-2 flex justify-end">
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setIsDrawerOpen(false)} aria-label={t('common.close')}>
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
      </div>

      {isWizardOpen && (
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
        <ProviderLoginModal
          isOpen
          provider={providers.loginProvider}
          onClose={closeProviderLogin}
          onComplete={providers.onLoginComplete}
        />
      )}
      {isDivisionModalOpen && (
        <DivisionModal
          open
          onOpenChange={setIsDivisionModalOpen}
          onCreate={async (input) => {
            const division = await actions.createDivision(input);
            select({ type: 'division', divisionId: division.id });
          }}
        />
      )}
      {isSettingsOpen && (
        <OfficeSettingsModal
          open
          onOpenChange={setIsSettingsOpen}
          office={office}
          onSave={async (changes) => {
            await actions.updateOffice(changes);
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
    </div>
  );
}
