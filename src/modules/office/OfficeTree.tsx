import { Maximize2, MessageSquare, Minus, Plus, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';

import OfficeStatusBadge from '@/modules/office/OfficeStatusBadge';
import type {
  OfficeCase,
  OfficeDivision,
  OfficeMessage,
  OfficeNodeStatus,
  OfficeSelection,
  OfficeTask,
} from '@/shared/types';
import { cn, officeCaseTone } from '@/shared/utils';

const NODE_WIDTH = 152;
const NODE_HEIGHT = 88;
const CASE_WIDTH = 248;
const CASE_HEIGHT = 58;
const GAP_X = 16;
const ROW_GAP = 66;
const PADDING = 20;
const LAYER_DROP = 30;
const MIN_CANVAS_WIDTH = 560;
/** How long an edge keeps flowing after a message crossed it. */
const MESSAGE_FLOW_MS = 2600;
/** Zoom limits of the chart canvas. */
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2;
/** One press of the zoom buttons or keys. */
const ZOOM_STEP = 1.2;
/** Space kept around the chart when it is fitted to the canvas. */
const FIT_MARGIN = 24;

/** Pan offset and zoom of the chart inside its canvas. */
type ChartView = { x: number; y: number; zoom: number };

const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/** Selected nodes use `outline`, which glass surfaces' own box-shadow cannot hide (a `ring` would be). */
const SELECTED_OUTLINE = 'outline outline-primary bg-primary/[0.06]';
const FOCUS_OUTLINE = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/** Border colour per status, set inline because glass surfaces own their border colour. */
const STATUS_BORDER: Record<OfficeNodeStatus, string> = {
  idle: 'hsl(var(--border))',
  running: 'hsl(var(--primary))',
  review: 'hsl(var(--navy))',
  done: 'rgb(16 185 129 / 0.55)',
  failed: 'rgb(239 68 68 / 0.6)',
  blocked: 'rgb(245 158 11 / 0.6)',
};

type DivisionState = {
  status: OfficeNodeStatus;
  queued: number;
  done: number;
  total: number;
};

/**
 * Collapses a division's tasks in the selected case into one node state.
 * Live work wins (running, then review); a failure only shows when no
 * replacement task took it over.
 */
function deriveDivisionState(tasks: OfficeTask[], replacedTaskIds: ReadonlySet<string>): DivisionState {
  const count = (status: OfficeTask['status']) => tasks.filter((task) => task.status === status).length;
  const queued = count('queued');
  const done = count('done');
  const failed = tasks.filter((task) => task.status === 'failed' && !replacedTaskIds.has(task.id)).length;
  let status: OfficeNodeStatus = 'idle';
  if (count('running') > 0) status = 'running';
  else if (count('review') > 0) status = 'review';
  else if (queued > 0) status = 'idle';
  else if (failed > 0) status = 'failed';
  else if (count('blocked') > 0) status = 'blocked';
  else if (tasks.length > 0 && done > 0) status = 'done';
  return { status, queued, done, total: tasks.length };
}

type OfficeTreeProps = {
  projectName: string;
  divisions: OfficeDivision[];
  caseItem: OfficeCase | null;
  tasks: OfficeTask[];
  messages: OfficeMessage[];
  selection: OfficeSelection;
  onSelect: (selection: OfficeSelection) => void;
};

type NodeBox = { x: number; y: number; width: number; height: number };

/** Rendered by the office module's OfficePage as the live office chart (tree of case, coordinator, divisions, layers). */
export default function OfficeTree({
  projectName,
  divisions,
  caseItem,
  tasks,
  messages,
  selection,
  onSelect,
}: OfficeTreeProps) {
  const { t } = useTranslation('office');
  const coordinator = divisions.find((division) => division.isCoordinator) ?? null;
  const audit = divisions.find((division) => division.isAudit) ?? null;
  const workers = divisions.filter((division) => !division.isCoordinator && !division.isAudit);

  // Divisions a message just crossed to or from; their edge flows until the burst's timer clears them.
  // The parent remounts the tree per case, so a newly opened case starts calm.
  const [flowingDivisionIds, setFlowingDivisionIds] = useState<ReadonlySet<string>>(() => new Set());
  const lastSeenMessageIdRef = useRef<number | null>(null);
  // Pending flow timers; each burst keeps its own so a later burst never cuts an earlier one short.
  const flowTimersRef = useRef(new Set<number>());

  useEffect(() => {
    const timers = flowTimersRef.current;
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, []);

  useEffect(() => {
    const latestId = messages.reduce((max, message) => Math.max(max, message.id), 0);
    const previousId = lastSeenMessageIdRef.current;
    lastSeenMessageIdRef.current = latestId;
    // The case's history arrives as the first non-empty batch (the detail is
    // fetched after mount); it is not traffic, so only later messages flow.
    if (previousId === null || previousId === 0) {
      return;
    }
    const touched = new Set<string>();
    for (const message of messages) {
      if (message.id <= previousId) {
        continue;
      }
      for (const divisionId of [message.fromDivisionId, message.toDivisionId]) {
        if (divisionId && divisionId !== coordinator?.id) {
          touched.add(divisionId);
        }
      }
    }
    if (touched.size === 0) {
      return;
    }
    const schedule = (delay: number, update: (current: ReadonlySet<string>) => ReadonlySet<string>) => {
      const timer = window.setTimeout(() => {
        flowTimersRef.current.delete(timer);
        setFlowingDivisionIds(update);
      }, delay);
      flowTimersRef.current.add(timer);
    };
    schedule(0, (current) => new Set([...current, ...touched]));
    schedule(MESSAGE_FLOW_MS, (current) => new Set([...current].filter((id) => !touched.has(id))));
  }, [coordinator?.id, messages]);

  const replacedTaskIds = useMemo(
    () => new Set(tasks.map((task) => task.parentTaskId).filter((id): id is string => Boolean(id))),
    [tasks],
  );

  const divisionStates = useMemo(() => {
    const states = new Map<string, DivisionState>();
    for (const division of workers) {
      states.set(division.id, deriveDivisionState(tasks.filter((task) => task.divisionId === division.id), replacedTaskIds));
    }
    return states;
  }, [replacedTaskIds, tasks, workers]);

  const messageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const message of messages) {
      for (const divisionId of new Set([message.fromDivisionId, message.toDivisionId])) {
        if (divisionId) {
          counts.set(divisionId, (counts.get(divisionId) ?? 0) + 1);
        }
      }
    }
    return counts;
  }, [messages]);

  const auditStatus: OfficeNodeStatus = tasks.some((task) => task.status === 'review')
    ? 'running'
    : tasks.some((task) => task.status === 'done') ? 'done' : 'idle';

  const coordinatorStatus: OfficeNodeStatus = !caseItem
    ? 'idle'
    : caseItem.coordinatorBusy ? 'running' : officeCaseTone(caseItem.status) === 'running' ? 'idle' : officeCaseTone(caseItem.status);

  const skillCount = new Set(divisions.flatMap((division) => division.agent.skills)).size;

  // ----- layout -----
  const rowWidth = workers.length * NODE_WIDTH + Math.max(0, workers.length - 1) * GAP_X;
  const layerRowWidth = NODE_WIDTH * 2 + GAP_X * 3;
  const width = Math.max(rowWidth, layerRowWidth, MIN_CANVAS_WIDTH) + PADDING * 2;
  const centerX = width / 2;
  const caseBox: NodeBox = { x: centerX - CASE_WIDTH / 2, y: PADDING, width: CASE_WIDTH, height: CASE_HEIGHT };
  const coordinatorBox: NodeBox = {
    x: centerX - NODE_WIDTH / 2,
    y: caseBox.y + CASE_HEIGHT + ROW_GAP * 0.7,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  };
  const workersY = coordinatorBox.y + NODE_HEIGHT + ROW_GAP;
  const workersStartX = centerX - rowWidth / 2;
  const workerBoxes = workers.map((_, index): NodeBox => ({
    x: workersStartX + index * (NODE_WIDTH + GAP_X),
    y: workersY,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  }));
  const layerLineY = workersY + NODE_HEIGHT + LAYER_DROP;
  const layerY = layerLineY + LAYER_DROP + 8;
  const skillsBox: NodeBox = { x: centerX - GAP_X / 2 - NODE_WIDTH, y: layerY, width: NODE_WIDTH, height: NODE_HEIGHT };
  const auditBox: NodeBox = { x: centerX + GAP_X / 2, y: layerY, width: NODE_WIDTH, height: NODE_HEIGHT };
  const height = layerY + NODE_HEIGHT + PADDING;

  const coordinatorBottom = coordinatorBox.y + NODE_HEIGHT;
  const midY = (coordinatorBottom + workersY) / 2;
  const barLeft = Math.min(...workerBoxes.map((box) => box.x + NODE_WIDTH / 2), skillsBox.x + NODE_WIDTH / 2);
  const barRight = Math.max(...workerBoxes.map((box) => box.x + NODE_WIDTH / 2), auditBox.x + NODE_WIDTH / 2);
  const anyInReview = tasks.some((task) => task.status === 'review');

  // ----- canvas: zoom and pan -----
  const canvasRef = useRef<HTMLDivElement | null>(null);
  // Where the chart sits in the canvas and how far it is zoomed.
  const [view, setView] = useState<ChartView>({ x: 0, y: 0, zoom: 1 });
  // Once the user zooms or pans, resizing the canvas no longer refits the chart under them.
  const userMovedRef = useRef(false);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  // Only styles the canvas while it is being dragged.
  const [isPanning, setIsPanning] = useState(false);

  const fitToCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.clientWidth === 0 || canvas.clientHeight === 0) {
      return;
    }
    const zoom = clampZoom(Math.min(
      (canvas.clientWidth - FIT_MARGIN * 2) / width,
      (canvas.clientHeight - FIT_MARGIN * 2) / height,
      1,
    ));
    setView({
      zoom,
      x: (canvas.clientWidth - width * zoom) / 2,
      // Top-aligned: the case and coordinator are what the eye looks for first.
      y: FIT_MARGIN,
    });
  }, [height, width]);

  // The chart opens fitted, and stays fitted while the user has not moved it.
  useLayoutEffect(() => {
    if (!userMovedRef.current) {
      fitToCanvas();
    }
  }, [fitToCanvas]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const observer = new ResizeObserver(() => {
      if (!userMovedRef.current) {
        fitToCanvas();
      }
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [fitToCanvas]);

  /** Zooms by `factor`, keeping the chart point under (px, py) in place. */
  const zoomAt = useCallback((factor: number, px: number, py: number) => {
    userMovedRef.current = true;
    setView((current) => {
      const zoom = clampZoom(current.zoom * factor);
      const ratio = zoom / current.zoom;
      return { zoom, x: px - (px - current.x) * ratio, y: py - (py - current.y) * ratio };
    });
  }, []);

  const zoomAtCenter = useCallback((factor: number) => {
    const canvas = canvasRef.current;
    zoomAt(factor, (canvas?.clientWidth ?? 0) / 2, (canvas?.clientHeight ?? 0) / 2);
  }, [zoomAt]);

  // Wheel and trackpad pinch zoom around the cursor. Registered by hand
  // because React's wheel listener is passive and cannot stop the page scroll.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const speed = event.ctrlKey ? 0.01 : 0.0015;
      zoomAt(Math.exp(-event.deltaY * speed), event.clientX - rect.left, event.clientY - rect.top);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const pinchDistance = () => {
    const [first, second] = [...pointersRef.current.values()];
    return Math.hypot(first.x - second.x, first.y - second.y);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    // Nodes, chips and edges keep their clicks; only empty canvas starts a pan.
    if ((event.target as Element).closest('button, path[data-hit]')) {
      return;
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 2) {
      dragRef.current = null;
      pinchRef.current = { distance: pinchDistance(), zoom: view.zoom };
      return;
    }
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: view.x,
      originY: view.y,
    };
    setIsPanning(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) {
      return;
    }
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const pinch = pinchRef.current;
    if (pinch && pointersRef.current.size === 2) {
      const rect = event.currentTarget.getBoundingClientRect();
      const [first, second] = [...pointersRef.current.values()];
      const target = clampZoom(pinch.zoom * (pinchDistance() / pinch.distance));
      zoomAt(target / view.zoom, (first.x + second.x) / 2 - rect.left, (first.y + second.y) / 2 - rect.top);
      return;
    }
    const drag = dragRef.current;
    if (drag && drag.pointerId === event.pointerId) {
      userMovedRef.current = true;
      setView((current) => ({
        ...current,
        x: drag.originX + event.clientX - drag.startX,
        y: drag.originY + event.clientY - drag.startY,
      }));
    }
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) {
      pinchRef.current = null;
    }
    if (dragRef.current?.pointerId === event.pointerId || pointersRef.current.size === 0) {
      dragRef.current = null;
      setIsPanning(false);
    }
  };

  const handleCanvasKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }
    const pan = 40;
    const moves: Record<string, () => void> = {
      '+': () => zoomAtCenter(ZOOM_STEP),
      '=': () => zoomAtCenter(ZOOM_STEP),
      '-': () => zoomAtCenter(1 / ZOOM_STEP),
      '0': () => { userMovedRef.current = false; fitToCanvas(); },
      ArrowLeft: () => setView((current) => ({ ...current, x: current.x + pan })),
      ArrowRight: () => setView((current) => ({ ...current, x: current.x - pan })),
      ArrowUp: () => setView((current) => ({ ...current, y: current.y + pan })),
      ArrowDown: () => setView((current) => ({ ...current, y: current.y - pan })),
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      if (event.key.startsWith('Arrow')) {
        userMovedRef.current = true;
      }
      move();
    }
  };

  // The chart is scaled, so the outline is thickened to stay ~2.5px on screen at any zoom.
  const selectedOutlineStyle = { outlineWidth: 2.5 / view.zoom, outlineOffset: 3 / view.zoom };

  const isSelectedDivision = (divisionId: string) =>
    (selection.type === 'division' || selection.type === 'messages') && selection.divisionId === divisionId;

  const renderDivisionNode = (division: OfficeDivision, box: NodeBox, state: DivisionState | null, status: OfficeNodeStatus) => {
    const agent = division.agent;
    const statusLabel = t(`nodeStatus.${status}`);
    const hasModel = Boolean(agent.provider && agent.model);
    return (
      <button
        key={division.id}
        type="button"
        data-testid={`office-node-${division.slug}`}
        data-status={status}
        aria-pressed={isSelectedDivision(division.id)}
        aria-label={`${division.name} · ${agent.name} · ${statusLabel}`}
        onClick={() => onSelect({ type: 'division', divisionId: division.id })}
        className={cn(
          'office-node-enter glass-surface absolute z-10 flex flex-col gap-1 overflow-hidden rounded-[12px] border px-2.5 py-2 text-left transition-colors hover:bg-card/80',
          FOCUS_OUTLINE,
          status === 'running' && 'office-node-running',
          isSelectedDivision(division.id) && SELECTED_OUTLINE,
          !agent.enabled && 'opacity-60',
        )}
        style={{
          left: box.x,
          top: box.y,
          width: box.width,
          height: box.height,
          borderColor: STATUS_BORDER[status],
          ...(isSelectedDivision(division.id) ? selectedOutlineStyle : {}),
        }}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: division.color }} />
          <span className="truncate text-[13px] font-semibold text-foreground">{division.name}</span>
        </span>
        <span className="truncate text-[11px] text-muted-foreground">
          {agent.name}
          {!agent.enabled ? ` · ${t('tree.disabled')}` : ''}
        </span>
        <span className="mt-auto flex min-w-0 items-center gap-1">
          <span
            className={cn(
              'max-w-[84px] truncate rounded-md border px-1 py-0.5 font-mono text-[9.5px] leading-none',
              hasModel ? 'border-border text-muted-foreground' : 'border-amber-400/60 text-amber-700 dark:text-amber-300',
            )}
            title={hasModel ? `${agent.provider} · ${agent.model}` : t('tree.noModel')}
          >
            {hasModel ? agent.model : t('tree.noModel')}
          </span>
          <OfficeStatusBadge tone={status} label={statusLabel} />
          {state && state.queued > 0 && (
            <span className="shrink-0 text-[9.5px] text-muted-foreground">{t('tree.queued', { count: state.queued })}</span>
          )}
        </span>
      </button>
    );
  };

  const edgePath = (box: NodeBox) => {
    const x = box.x + NODE_WIDTH / 2;
    return `M ${centerX} ${coordinatorBottom} C ${centerX} ${midY}, ${x} ${midY}, ${x} ${workersY}`;
  };

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div
        ref={canvasRef}
        role="region"
        aria-label={t('tree.label')}
        aria-roledescription={t('tree.canvas')}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onKeyDown={handleCanvasKeyDown}
        className={cn(
          'office-canvas absolute inset-0 touch-none select-none focus-visible:outline-none',
          isPanning ? 'cursor-grabbing' : 'cursor-grab',
        )}
        style={{ backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${20 * view.zoom}px ${20 * view.zoom}px` }}
      >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ width, height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
        data-testid="office-tree"
        data-zoom={view.zoom.toFixed(2)}
      >
        <svg
          className="pointer-events-none absolute inset-0"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          aria-hidden
        >
          {/* case → coordinator */}
          <line
            x1={centerX}
            y1={caseBox.y + CASE_HEIGHT}
            x2={centerX}
            y2={coordinatorBox.y}
            stroke="hsl(var(--border))"
            strokeWidth={1.5}
            className={cn(caseItem?.coordinatorBusy && 'office-edge-flow')}
            style={caseItem?.coordinatorBusy ? { stroke: 'hsl(var(--primary))' } : undefined}
          />

          {/* coordinator → divisions */}
          {workers.map((division, index) => {
            const state = divisionStates.get(division.id);
            const active = state?.status === 'running' || flowingDivisionIds.has(division.id);
            const edgeSelected = selection.type === 'messages' && selection.divisionId === division.id;
            const path = edgePath(workerBoxes[index]);
            return (
              <g key={division.id}>
                <path
                  d={path}
                  fill="none"
                  stroke={active || edgeSelected ? 'hsl(var(--primary))' : 'hsl(var(--border))'}
                  strokeWidth={edgeSelected ? 3 : active ? 1.75 : 1.5}
                  className={cn(active && 'office-edge-flow')}
                  data-testid={`office-edge-${division.slug}`}
                  data-active={active ? 'true' : 'false'}
                />
                {/* Wide invisible stroke so the thin edge is easy to click. */}
                <path
                  d={path}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={14}
                  data-hit
                  style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                  onClick={() => onSelect({ type: 'messages', divisionId: division.id })}
                />
              </g>
            );
          })}

          {/* cross-division layer: skills and audit sit under every division */}
          {workers.length > 0 && (
            <>
              {workerBoxes.map((box, index) => {
                const inReview = divisionStates.get(workers[index].id)?.status === 'review';
                return (
                  <line
                    key={workers[index].id}
                    x1={box.x + NODE_WIDTH / 2}
                    y1={workersY + NODE_HEIGHT}
                    x2={box.x + NODE_WIDTH / 2}
                    y2={layerLineY}
                    stroke={inReview ? 'hsl(var(--navy))' : 'hsl(var(--border))'}
                    strokeWidth={1}
                    className={cn(inReview && 'office-edge-flow')}
                  />
                );
              })}
              <line
                x1={barLeft}
                y1={layerLineY}
                x2={barRight}
                y2={layerLineY}
                stroke="hsl(var(--border))"
                strokeWidth={1.5}
                strokeDasharray="4 4"
              />
              {/* Labelled next to the layer nodes, which always sit mid-chart and in view. */}
              <text
                x={skillsBox.x - 10}
                y={layerLineY + 18}
                textAnchor="end"
                className="fill-muted-foreground"
                style={{ fontSize: 10 }}
              >
                {t('tree.layer')}
              </text>
              {[skillsBox, auditBox].map((box, index) => (
                <line
                  key={index === 0 ? 'skills' : 'audit'}
                  x1={box.x + NODE_WIDTH / 2}
                  y1={layerLineY}
                  x2={box.x + NODE_WIDTH / 2}
                  y2={layerY}
                  stroke={index === 1 && anyInReview ? 'hsl(var(--navy))' : 'hsl(var(--border))'}
                  strokeWidth={1}
                  className={cn(index === 1 && anyInReview && 'office-edge-flow')}
                />
              ))}
            </>
          )}
        </svg>

        {/* case / project node */}
        <button
          type="button"
          data-testid="office-node-case"
          aria-pressed={selection.type === 'case'}
          onClick={() => onSelect({ type: 'case' })}
          className={cn(
            'office-node-enter glass-surface absolute z-10 flex flex-col justify-center gap-1 rounded-[12px] border px-3 text-left hover:bg-card/80',
            FOCUS_OUTLINE,
            selection.type === 'case' && SELECTED_OUTLINE,
          )}
          style={{
            left: caseBox.x,
            top: caseBox.y,
            width: caseBox.width,
            height: caseBox.height,
            borderColor: STATUS_BORDER[caseItem ? officeCaseTone(caseItem.status) : 'idle'],
            ...(selection.type === 'case' ? selectedOutlineStyle : {}),
          }}
        >
          <span className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
            {caseItem ? t('tree.caseNode') : projectName}
          </span>
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[13px] font-semibold text-foreground">
              {caseItem ? caseItem.title : t('tree.noCase')}
            </span>
            {caseItem && <OfficeStatusBadge tone={officeCaseTone(caseItem.status)} label={t(`status.${caseItem.status}`)} />}
          </span>
        </button>

        {coordinator && renderDivisionNode(coordinator, coordinatorBox, null, coordinatorStatus)}

        {workers.map((division, index) => {
          const state = divisionStates.get(division.id) ?? null;
          return renderDivisionNode(division, workerBoxes[index], state, state?.status ?? 'idle');
        })}

        {/* message-count chips on the coordinator → division edges */}
        {workers.map((division, index) => {
          const count = messageCounts.get(division.id) ?? 0;
          if (count === 0) {
            return null;
          }
          const box = workerBoxes[index];
          const x = (centerX + box.x + NODE_WIDTH / 2) / 2;
          return (
            <button
              key={`messages-${division.id}`}
              type="button"
              onClick={() => onSelect({ type: 'messages', divisionId: division.id })}
              aria-label={t('tree.openMessages', { name: division.name })}
              title={t('tree.messages', { count })}
              className="glass-surface-strong absolute z-20 flex h-5 -translate-x-1/2 -translate-y-1/2 items-center gap-0.5 rounded-full border px-1.5 text-[10px] text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
              style={{ left: x, top: midY }}
            >
              <MessageSquare className="h-3 w-3" />
              {count}
            </button>
          );
        })}

        {/* skills layer */}
        <button
          type="button"
          data-testid="office-node-skills"
          aria-pressed={selection.type === 'skills'}
          onClick={() => onSelect({ type: 'skills' })}
          className={cn(
            'office-node-enter glass-surface absolute z-10 flex flex-col gap-1 rounded-[12px] border px-2.5 py-2 text-left hover:bg-card/80',
            FOCUS_OUTLINE,
            selection.type === 'skills' && SELECTED_OUTLINE,
          )}
          style={{
            left: skillsBox.x,
            top: skillsBox.y,
            width: skillsBox.width,
            height: skillsBox.height,
            borderColor: STATUS_BORDER.idle,
            ...(selection.type === 'skills' ? selectedOutlineStyle : {}),
          }}
        >
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            {t('tree.skills')}
          </span>
          <span className="text-[11px] text-muted-foreground">{t('tree.skillsCount', { count: skillCount })}</span>
        </button>

        {audit && renderDivisionNode(audit, auditBox, null, auditStatus)}
      </div>
      </div>

      <div className="glass-surface-strong absolute bottom-3 right-3 z-30 flex items-center gap-0.5 rounded-[10px] border p-1" role="toolbar" aria-label={t('tree.controls')}>
        <button type="button" onClick={() => zoomAtCenter(1 / ZOOM_STEP)} aria-label={t('tree.zoomOut')} title={t('tree.zoomOut')}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="w-10 text-center text-[11px] tabular-nums text-muted-foreground" data-testid="office-zoom-level">
          {Math.round(view.zoom * 100)}%
        </span>
        <button type="button" onClick={() => zoomAtCenter(ZOOM_STEP)} aria-label={t('tree.zoomIn')} title={t('tree.zoomIn')}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
          <Plus className="h-3.5 w-3.5" />
        </button>
        <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />
        <button type="button" onClick={() => { userMovedRef.current = false; fitToCanvas(); }} aria-label={t('tree.fit')} title={t('tree.fit')}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="pointer-events-none absolute bottom-4 left-3 z-30 hidden text-[10.5px] text-muted-foreground/80 min-[900px]:block">
        {t('tree.hint')}
      </p>
    </div>
  );
}
