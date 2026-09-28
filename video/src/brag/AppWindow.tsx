import './app';

import CoordinatorDock, { type CoordinatorDockMode } from '@/modules/office/CoordinatorDock';
import OfficeCanvas from '@/modules/office/OfficeCanvas';
import ModeSwitch from '@/modules/project-workspace/ModeSwitch';
import type { OfficeCase, OfficeTask } from '@/shared/types';
import { useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react';

import { CANVAS_ACTIONS, DIVISIONS, FLOW, NO_MESSAGES, NO_SHAPES, NO_SKILL_NODES, NO_SKILLS } from './appData';

export const APP_W = 1600;
export const APP_H = 940;

export type AppState = {
  caseItem: OfficeCase | null;
  tasks: OfficeTask[];
  /** Work items in the chat dock, newest first. */
  cases: OfficeCase[];
  dockMode: CoordinatorDockMode;
  /** Text in the work chat's message box (typed by the film). */
  typed: string;
};

const SELECTION = { type: 'case' } as const;
const TARGET = { kind: 'coordinator' } as const;
const noop = () => {};
const noopAsync = async () => {};

/**
 * The real OpenLeira workspace — the app's own header switch, Node Design
 * canvas and work chat components with its built stylesheet — at 1600×940,
 * driven by `state`. `stateKey` changes only when the state does, so the
 * canvas sees stable props between changes (as it does in the app).
 */
export function AppWindow({ state, stateKey, style }: { state: AppState; stateKey: string; style?: CSSProperties }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stable = useMemo(() => state, [stateKey]);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  // The message box keeps its text in its own state; the film writes into the real textarea after each commit.
  useLayoutEffect(() => {
    if (composerRef.current) {
      composerRef.current.value = state.typed;
    }
  });

  return (
    <div
      className="dark bg-background font-sans text-foreground"
      style={{
        width: APP_W,
        height: APP_H,
        borderRadius: 16,
        overflow: 'hidden',
        border: '1px solid #3A3A40',
        boxShadow: '0 60px 140px #000000e6, 0 0 0 1px #00000080',
        display: 'flex',
        flexDirection: 'column',
        ...style,
      }}
    >
      <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-border/60 bg-card px-4">
        <span className="flex gap-1.5">
          <span className="h-3 w-3 rounded-full bg-muted-foreground/40" />
          <span className="h-3 w-3 rounded-full bg-muted-foreground/40" />
          <span className="h-3 w-3 rounded-full bg-muted-foreground/40" />
        </span>
        <span className="ml-3 font-serif text-[17px] font-semibold text-foreground">shoe-shop</span>
        <span className="text-xs text-muted-foreground">/srv/apps/shoe-shop</span>
        <div className="ml-auto">
          <ModeSwitch isWorkspaceMode onChange={noop} />
        </div>
      </div>
      <main className="relative min-h-0 flex-1">
        <OfficeCanvas
          officeId="office-1"
          projectName="shoe-shop"
          divisions={DIVISIONS}
          flow={FLOW}
          caseItem={stable.caseItem}
          tasks={stable.tasks}
          messages={NO_MESSAGES}
          selection={SELECTION}
          onSelect={noop}
          actions={CANVAS_ACTIONS}
          onAddDivisionAt={noop}
          onDeleteDivision={noop}
          skillNodes={NO_SKILL_NODES}
          shapes={NO_SHAPES}
          installedSkills={NO_SKILLS}
        />
        <CoordinatorDock
          ref={composerRef}
          cases={stable.cases}
          divisions={DIVISIONS}
          selectedCaseId={stable.cases[0]?.id ?? null}
          selectedMessages={NO_MESSAGES}
          mode={stable.dockMode}
          onModeChange={noop}
          target={TARGET}
          onTargetChange={noop}
          onSelectCase={noop}
          onSubmitWork={noopAsync}
          onSendNote={noopAsync}
        />
      </main>
    </div>
  );
}
