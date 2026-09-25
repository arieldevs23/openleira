import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { ArrowUp, ChevronRight, FolderPlus, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { api } from '@/shared/api';
import { setPendingComposerSubmit } from '@/shared/composerHandoff';
import { OBROLAN_DEFAULT_CLAUDE_MODEL, OBROLAN_MODEL_STORAGE_KEY } from '@/shared/constants';
import { useBuiltInWorkspaces } from '@/shared/hooks/useBuiltInWorkspaces';
import { PROVIDERS, providerModelStorageKey, readSelectedProvider, writeSelectedProvider } from '@/shared/selectedProvider';
import { ActionMenu, OgivalArchOrnament, RoseMark } from '@/shared/ui';
import { cn, isBuiltInWorkspaceProject } from '@/shared/utils';
import type { LLMProvider, ProviderModelOption, ProviderModelsDefinition, SettingsMainTab } from '@/shared/types';
import MobileMenuButton from '@/modules/project-workspace/MobileMenuButton';
import { useProjectMainState } from '@/modules/project-workspace/context/ProjectsStateContext';

type WorkspaceWelcomeProps = {
  isMobile: boolean;
  onMenuClick: () => void;
  onShowSettings: (tab?: SettingsMainTab) => void;
};

type StartMode = 'obrolan' | 'project';

const MAX_LISTED_PROJECTS = 5;

/** Shown until the Claude catalogue arrives, so the picker is never empty. */
const FALLBACK_CLAUDE_MODELS: ProviderModelOption[] = [
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'opus', label: 'Opus' },
  { value: 'fable', label: 'Fable 5' },
];

const PROVIDER_LABELS: Record<LLMProvider, string> = {
  claude: 'Claude',
  cursor: 'Cursor',
  codex: 'Codex',
  opencode: 'OpenCode',
};

/**
 * Obrolan chats keep a Claude model of their own; every other provider shares
 * the key the chat composer reads, so a pick here is what the composer sends.
 */
const modelStorageKey = (provider: LLMProvider): string => (
  provider === 'claude' ? OBROLAN_MODEL_STORAGE_KEY : providerModelStorageKey(provider)
);

const readStoredModel = (provider: LLMProvider): string => (
  localStorage.getItem(modelStorageKey(provider)) || (provider === 'claude' ? OBROLAN_DEFAULT_CLAUDE_MODEL : '')
);

/**
 * Rendered by WorkspaceMain when nothing is open yet: the app's home screen.
 * Typing here starts a plain chat with that message; a project is either an
 * existing one or the creation wizard, which the sidebar owns and opens on
 * request.
 */
export default function WorkspaceWelcome({ isMobile, onMenuClick, onShowSettings }: WorkspaceWelcomeProps) {
  const { t } = useTranslation();
  const { projects, handleNewSession, handleProjectSelect, requestNewProject, refreshProjectsSilently } = useProjectMainState();
  const { pendingWorkspace, ensureWorkspace } = useBuiltInWorkspaces(projects, refreshProjectsSilently);
  const [mode, setMode] = useState<StartMode>('obrolan');
  const [text, setText] = useState('');
  const [provider, setProvider] = useState<LLMProvider>(readSelectedProvider);
  const [model, setModel] = useState(() => readStoredModel(readSelectedProvider()));
  const [models, setModels] = useState<ProviderModelOption[]>(() => (provider === 'claude' ? FALLBACK_CLAUDE_MODELS : []));
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    void api.providers.models(provider)
      .then((response) => response.json())
      .then((body: { success?: boolean; data?: { models?: ProviderModelsDefinition } }) => {
        const options = body.data?.models?.OPTIONS;
        if (cancelled || !body.success || !options?.length) return;
        setModels(options);
        // A provider with no stored pick starts on its first catalogue entry.
        setModel((current) => (options.some((option) => option.value === current) ? current : options[0].value));
      })
      .catch(() => {
        // The fallback list stays; the composer re-validates the model anyway.
      });
    return () => {
      cancelled = true;
    };
  }, [provider]);

  const modelLabel = models.find((option) => option.value === model)?.label ?? model;
  const listedProjects = projects.filter((project) => !isBuiltInWorkspaceProject(project)).slice(0, MAX_LISTED_PROJECTS);
  const canSend = text.trim().length > 0 && pendingWorkspace === null;

  const chooseProvider = (next: LLMProvider) => {
    if (next === provider) return;
    setProvider(next);
    writeSelectedProvider(next);
    setModels(next === 'claude' ? FALLBACK_CLAUDE_MODELS : []);
    setModel(readStoredModel(next));
  };

  const chooseModel = (value: string) => {
    setModel(value);
    // The composer reads this key when it mounts for the obrolan workspace.
    localStorage.setItem(modelStorageKey(provider), value);
  };

  const startObrolan = async () => {
    const message = text.trim();
    if (!message) return;
    const project = await ensureWorkspace('obrolan');
    if (!project) return;
    setPendingComposerSubmit(`project:${project.projectId}`, message);
    setText('');
    handleNewSession(project);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void startObrolan();
    }
  };

  const modes: { id: StartMode; label: string }[] = [
    { id: 'obrolan', label: t('welcome.modeObrolan') },
    { id: 'project', label: t('welcome.modeProject') },
  ];

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-background">

      <div className="pwa-header-safe relative flex flex-shrink-0 items-center gap-1 px-3 py-2">
        {isMobile && <MobileMenuButton onMenuClick={onMenuClick} compact />}
        <ActionMenu
          label={`${PROVIDER_LABELS[provider]} · ${modelLabel}`}
          ariaLabel={t('welcome.pickModel')}
          variant="ghost"
          size="sm"
          portal
          align="left"
          triggerClassName="h-9 gap-1 rounded-lg px-3 text-[13px] font-medium hover:bg-accent [&_svg]:order-last [&_svg]:size-4 [&_svg]:text-muted-foreground"
          menuClassName="max-h-[70vh] overflow-y-auto"
          items={[
            ...PROVIDERS.map((option) => ({
              key: `provider:${option}`,
              label: PROVIDER_LABELS[option],
              description: option === provider ? t('welcome.activeProvider') : undefined,
              onSelect: () => chooseProvider(option),
              closeOnSelect: false,
            })),
            ...models.map((option, index) => ({
              key: option.value,
              label: option.label,
              description: option.description,
              showDividerBefore: index === 0,
              onSelect: () => chooseModel(option.value),
            })),
          ]}
        />
        <button
          type="button"
          onClick={() => onShowSettings()}
          aria-label={t('misc.settings', { defaultValue: 'Settings' })}
          className="ml-auto rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Settings className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-5 pb-6">
        {/* Empty state (DESIGN.md §7): one faint ogival arch behind the mark and
            title only, never behind the project list below. */}
        <div className="relative flex flex-col items-center">
          <OgivalArchOrnament className="-top-10 left-1/2 h-40 w-32 -translate-x-1/2" />
          <RoseMark size={56} alt="" className="relative" />
          <h1 className="display-title relative mt-4 text-center text-2xl text-foreground">
            {t('welcome.title')}
          </h1>
        </div>

        <div className="glass-surface mt-6 flex w-full max-w-sm rounded-lg p-1" role="tablist">
          {modes.map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={mode === option.id}
              onClick={() => setMode(option.id)}
              className={cn(
                'flex-1 rounded-md py-2 text-[13px] font-medium transition-colors',
                mode === option.id ? 'bg-surface-3 text-foreground' : 'text-muted-foreground hover:bg-accent',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="mt-4 w-full max-w-sm">
          {mode === 'obrolan' ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void startObrolan();
              }}
              className="glass-surface-strong flex items-end gap-2 rounded-xl py-2 pl-4 pr-2"
            >
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder={t('welcome.placeholder')}
                enterKeyHint="send"
                className="max-h-32 min-h-10 flex-1 resize-none bg-transparent py-2 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground"
              />
              <button
                type="submit"
                disabled={!canSend}
                aria-label={t('welcome.send')}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-30"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            </form>
          ) : (
            <>
              <button
                type="button"
                onClick={requestNewProject}
                className="glass-surface-strong flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-medium text-foreground hover:bg-accent"
              >
                <FolderPlus className="h-4 w-4" />
                {t('welcome.addWorkspace')}
              </button>
              {listedProjects.length > 0 && (
                <div className="glass-surface mt-3 overflow-hidden rounded-xl">
                  {listedProjects.map((project, index) => (
                    <button
                      key={project.projectId}
                      type="button"
                      onClick={() => handleProjectSelect(project)}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm text-foreground transition-colors active:bg-accent/60',
                        index > 0 && 'border-t border-border/40',
                      )}
                    >
                      <span className="truncate">{project.displayName || project.fullPath}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
