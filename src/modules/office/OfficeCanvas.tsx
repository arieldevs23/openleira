import {
  ArrowRightLeft,
  Bot,
  Cpu,
  FileText,
  LayoutGrid,
  Link2,
  Maximize2,
  MessageSquare,
  Minus,
  Plus,
  Power,
  RotateCcw,
  Sparkles,
  Trash2,
  Wrench,
} from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import { useTranslation } from 'react-i18next';

import OfficeStatusBadge from '@/modules/office/OfficeStatusBadge';
import {
  CASE_HEIGHT,
  CASE_WIDTH,
  casePosition,
  computeAutoLayout,
  connectorPath,
  formatTokens,
  NODE_HEIGHT,
  NODE_WIDTH,
} from '@/modules/office/utils/officeCanvasLayout';
import type { CanvasPoint } from '@/modules/office/utils/officeCanvasLayout';
import { ContextMenu } from '@/shared/ui';
import type {
  OfficeActions,
  OfficeAgentSection,
  OfficeCase,
  OfficeDivision,
  OfficeFlowEdge,
  OfficeMessage,
  OfficeNodeStatus,
  OfficeSelection,
  OfficeTask,
} from '@/shared/types';
import { cn, officeCaseTone } from '@/shared/utils';

/** How long an edge keeps flowing after a message crossed it. */
const MESSAGE_FLOW_MS = 2600;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2;
const ZOOM_STEP = 1.2;
const FIT_MARGIN = 32;
/** A press that moves less than this is a click, not a drag. */
const DRAG_THRESHOLD_PX = 4;
/** Holding a node this long without moving opens its menu (touch has no right button). */
const LONG_PRESS_MS = 550;

type ChartView = { x: number; y: number; zoom: number };

const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/** Selected nodes use `outline`, which glass surfaces' own box-shadow cannot hide (a `ring` would be). */
const SELECTED_OUTLINE = 'outline outline-primary bg-primary/[0.06]';
const FOCUS_OUTLINE = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/** Border colour per status, set inline because glass surfaces own their border colour. */
const STATUS_BORDER: Record<OfficeNodeStatus, string> = {
  idle: 'var(--border)',
  running: 'var(--accent)',
  review: 'var(--text-dim)',
  done: 'color-mix(in srgb, var(--ok) 55%, transparent)',
  failed: 'color-mix(in srgb, var(--err) 60%, transparent)',
  blocked: 'color-mix(in srgb, var(--warn) 60%, transparent)',
};

type DivisionState = { status: OfficeNodeStatus; queued: number };

/**
 * Collapses a division's tasks in the selected case into one node state.
 * Live work wins (running, then review); a failure only shows when no
 * replacement task took it over.
 */
function deriveDivisionState(tasks: OfficeTask[], replacedTaskIds: ReadonlySet<string>): DivisionState {
  const count = (status: OfficeTask['status']) => tasks.filter((task) => task.status === status).length;
  const queued = count('queued');
  const failed = tasks.filter((task) => task.status === 'failed' && !replacedTaskIds.has(task.id)).length;
  let status: OfficeNodeStatus = 'idle';
  if (count('running') > 0) status = 'running';
  else if (count('review') > 0) status = 'review';
  else if (queued > 0) status = 'idle';
  else if (failed > 0) status = 'failed';
  else if (count('blocked') > 0) status = 'blocked';
  else if (tasks.length > 0 && count('done') > 0) status = 'done';
  return { status, queued };
}

/** What a pointer that went down on the canvas is doing. */
type Gesture =
  | { kind: 'pan'; pointerId: number; startX: number; startY: number; originX: number; originY: number }
  | { kind: 'node'; pointerId: number; divisionId: string; startX: number; startY: number; origin: CanvasPoint; moved: boolean }
  | { kind: 'skills'; pointerId: number; startX: number; startY: number; origin: CanvasPoint; moved: boolean }
  | { kind: 'connect'; pointerId: number; fromDivisionId: string }
  | { kind: 'pinch'; distance: number; zoom: number };

/** The right-click menu and what it was opened on. */
type MenuState =
  | { position: CanvasPoint; target: { kind: 'division'; divisionId: string } }
  | { position: CanvasPoint; target: { kind: 'flow'; fromDivisionId: string; toDivisionId: string } }
  | { position: CanvasPoint; target: { kind: 'spoke'; divisionId: string } }
  | { position: CanvasPoint; target: { kind: 'canvas'; at: CanvasPoint } }
  | { position: CanvasPoint; target: { kind: 'skills' } };

type OfficeCanvasProps = {
  officeId: string;
  projectName: string;
  divisions: OfficeDivision[];
  flow: OfficeFlowEdge[];
  caseItem: OfficeCase | null;
  tasks: OfficeTask[];
  messages: OfficeMessage[];
  selection: OfficeSelection;
  onSelect: (selection: OfficeSelection) => void;
  /** Tokens each division spent in the selected case. */
  usageByDivision?: ReadonlyMap<string, number>;
  actions: Pick<OfficeActions, 'addFlowEdge' | 'deleteFlowEdge' | 'updateDivision' | 'updateAgent'>;
  /** "Add an agent here" from the canvas menu; the position is in canvas pixels. */
  onAddDivisionAt: (position: CanvasPoint) => void;
  onDeleteDivision: (division: OfficeDivision) => void;
};

const readSkillsPosition = (officeId: string): CanvasPoint | null => {
  try {
    const raw = window.localStorage.getItem(`office-skills-position:${officeId}`);
    const parsed = raw ? JSON.parse(raw) as CanvasPoint : null;
    return parsed && Number.isFinite(parsed.x) && Number.isFinite(parsed.y) ? parsed : null;
  } catch {
    return null;
  }
};

/**
 * The workspace canvas, shown by the office module's OfficePage: the case,
 * the coordinator, every division as a node that can be dragged anywhere, the
 * flow arrows between divisions (drag from a node's handle onto another node
 * to add one), and the skills/audit layer. Right-click (or hold on touch)
 * opens a menu for the node, arrow or empty canvas under the pointer.
 */
export default function OfficeCanvas({
  officeId,
  projectName,
  divisions,
  flow,
  caseItem,
  tasks,
  messages,
  selection,
  onSelect,
  usageByDivision,
  actions,
  onAddDivisionAt,
  onDeleteDivision,
}: OfficeCanvasProps) {
  const { t } = useTranslation('office');
  const coordinator = divisions.find((division) => division.isCoordinator) ?? null;
  const audit = divisions.find((division) => division.isAudit) ?? null;
  const workers = useMemo(() => divisions.filter((division) => !division.isCoordinator && !division.isAudit), [divisions]);

  // ----- live traffic -----
  // Divisions a message just crossed to or from; their edge flows until the burst's timer clears them.
  const [flowingDivisionIds, setFlowingDivisionIds] = useState<ReadonlySet<string>>(() => new Set());
  const lastSeenMessageIdRef = useRef<number | null>(null);
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
    // The case's history arrives as the first non-empty batch; it is not traffic.
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
  const statusOf = (division: OfficeDivision): OfficeNodeStatus => {
    if (division.isCoordinator) return coordinatorStatus;
    if (division.isAudit) return auditStatus;
    return divisionStates.get(division.id)?.status ?? 'idle';
  };
  const skillCount = new Set(divisions.flatMap((division) => division.agent.skills)).size;

  // ----- positions -----
  const layout = useMemo(() => computeAutoLayout(divisions, flow), [divisions, flow]);
  // Positions being dragged, or dropped but not yet confirmed by the server's frame.
  const [pendingPositions, setPendingPositions] = useState<ReadonlyMap<string, CanvasPoint>>(() => new Map());
  // Where the skills node sits; it is not a division, so its place is remembered in this browser only.
  const [skillsPosition, setSkillsPosition] = useState<CanvasPoint | null>(() => readSkillsPosition(officeId));

  // A dropped node keeps its local position until the division comes back from the server with it.
  useEffect(() => {
    setPendingPositions((current) => {
      if (current.size === 0) {
        return current;
      }
      const next = new Map(current);
      for (const division of divisions) {
        const pending = next.get(division.id);
        if (pending && division.position && Math.round(division.position.x) === Math.round(pending.x)
          && Math.round(division.position.y) === Math.round(pending.y)) {
          next.delete(division.id);
        }
      }
      return next.size === current.size ? current : next;
    });
  }, [divisions]);

  const positionOf = useCallback((division: OfficeDivision): CanvasPoint => (
    pendingPositions.get(division.id) ?? division.position ?? layout.divisions.get(division.id) ?? { x: 0, y: 0 }
  ), [layout, pendingPositions]);

  const coordinatorPoint = coordinator ? positionOf(coordinator) : { x: 0, y: 110 };
  const casePoint = casePosition(coordinatorPoint);
  const skillsPoint = skillsPosition ?? layout.skills;

  const bounds = useMemo(() => {
    const coordinatorAt = coordinator ? positionOf(coordinator) : { x: 0, y: 110 };
    const caseAt = casePosition(coordinatorAt);
    const skillsAt = skillsPosition ?? layout.skills;
    const points: Array<CanvasPoint & { width: number; height: number }> = [
      { ...caseAt, width: CASE_WIDTH, height: CASE_HEIGHT },
      { ...skillsAt, width: NODE_WIDTH, height: NODE_HEIGHT },
      ...divisions.map((division) => ({ ...positionOf(division), width: NODE_WIDTH, height: NODE_HEIGHT })),
    ];
    const minX = Math.min(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxX = Math.max(...points.map((point) => point.x + point.width));
    const maxY = Math.max(...points.map((point) => point.y + point.height));
    return { minX, minY, width: maxX - minX, height: maxY - minY };
  }, [coordinator, divisions, layout, positionOf, skillsPosition]);

  // ----- zoom and pan -----
  const canvasRef = useRef<HTMLDivElement | null>(null);
  // Where the chart sits in the canvas and how far it is zoomed.
  const [view, setView] = useState<ChartView>({ x: 0, y: 0, zoom: 1 });
  // Once the user zooms or pans, resizing the canvas no longer refits the chart under them.
  const userMovedRef = useRef(false);
  const gestureRef = useRef<Gesture | null>(null);
  const pointersRef = useRef(new Map<number, CanvasPoint>());
  const longPressRef = useRef<number | null>(null);
  // A drag just ended on a node; the click the browser fires next must not select it.
  const suppressClickRef = useRef(false);
  // Only styles the canvas while it is being panned.
  const [isPanning, setIsPanning] = useState(false);
  // The node being dragged, for its lifted look.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // The loose end of an arrow being drawn from a node's handle, in canvas pixels.
  const [connectingTo, setConnectingTo] = useState<{ fromDivisionId: string; point: CanvasPoint } | null>(null);
  // "Connect to…" picked from a menu: the next node clicked becomes the arrow's target.
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);
  // The open right-click menu.
  const [menu, setMenu] = useState<MenuState | null>(null);
  // Error of the last canvas action (an arrow that would loop, a failed save).
  const [canvasError, setCanvasError] = useState<string | null>(null);

  const fitToCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const box = bounds;
    if (!canvas || canvas.clientWidth === 0 || canvas.clientHeight === 0) {
      return;
    }
    const zoom = clampZoom(Math.min(
      (canvas.clientWidth - FIT_MARGIN * 2) / box.width,
      (canvas.clientHeight - FIT_MARGIN * 2) / box.height,
      1,
    ));
    setView({
      zoom,
      x: (canvas.clientWidth - box.width * zoom) / 2 - box.minX * zoom,
      // Top-aligned: the case and coordinator are what the eye looks for first.
      y: FIT_MARGIN - box.minY * zoom,
    });
  }, [bounds]);

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

  // Wheel and trackpad pinch zoom around the cursor; React's wheel listener is passive.
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

  /** Screen (client) coordinates to canvas pixels. */
  const toCanvasPoint = useCallback((clientX: number, clientY: number): CanvasPoint => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return {
      x: (clientX - (rect?.left ?? 0) - view.x) / view.zoom,
      y: (clientY - (rect?.top ?? 0) - view.y) / view.zoom,
    };
  }, [view]);

  const report = (error: unknown) => {
    setCanvasError(error instanceof Error ? error.message : String(error));
  };

  const addArrow = (fromDivisionId: string, toDivisionId: string) => {
    if (fromDivisionId === toDivisionId) {
      return;
    }
    setCanvasError(null);
    actions.addFlowEdge(fromDivisionId, toDivisionId).catch(report);
  };

  const cancelLongPress = () => {
    if (longPressRef.current !== null) {
      window.clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  };

  const pinchDistance = () => {
    const [first, second] = [...pointersRef.current.values()];
    return Math.hypot(first.x - second.x, first.y - second.y);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') {
      return;
    }
    // A new press starts fresh: a drag whose trailing click never came must not eat this one.
    suppressClickRef.current = false;
    const target = event.target as Element;
    // Buttons inside nodes (chips, handles) and the toolbar keep their own clicks.
    if (target.closest('[data-canvas-control]')) {
      return;
    }
    // Pointer capture makes the browser send the trailing click to the canvas, so a
    // press on a node is only captured once it turns into a drag (see the move handler).
    const capture = () => event.currentTarget.setPointerCapture?.(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 2) {
      cancelLongPress();
      gestureRef.current = { kind: 'pinch', distance: pinchDistance(), zoom: view.zoom };
      capture();
      return;
    }

    const handle = target.closest<HTMLElement>('[data-connect-from]');
    if (handle) {
      const fromDivisionId = handle.dataset.connectFrom as string;
      gestureRef.current = { kind: 'connect', pointerId: event.pointerId, fromDivisionId };
      capture();
      setConnectingTo({ fromDivisionId, point: toCanvasPoint(event.clientX, event.clientY) });
      return;
    }

    const node = target.closest<HTMLElement>('[data-division-id]');
    if (node) {
      const division = divisions.find((candidate) => candidate.id === node.dataset.divisionId);
      if (division) {
        gestureRef.current = {
          kind: 'node', pointerId: event.pointerId, divisionId: division.id,
          startX: event.clientX, startY: event.clientY, origin: positionOf(division), moved: false,
        };
        if (event.pointerType !== 'mouse') {
          const { clientX, clientY } = event;
          longPressRef.current = window.setTimeout(() => {
            longPressRef.current = null;
            gestureRef.current = null;
            suppressClickRef.current = true;
            setMenu({ position: { x: clientX, y: clientY }, target: { kind: 'division', divisionId: division.id } });
          }, LONG_PRESS_MS);
        }
        return;
      }
    }
    if (target.closest('[data-skills-node]')) {
      gestureRef.current = {
        kind: 'skills', pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, origin: skillsPoint, moved: false,
      };
      return;
    }
    if (target.closest('[data-case-node], path[data-hit], [data-edge-chip]')) {
      return;
    }
    gestureRef.current = {
      kind: 'pan', pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: view.x, originY: view.y,
    };
    capture();
    setIsPanning(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) {
      return;
    }
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const gesture = gestureRef.current;
    if (!gesture) {
      return;
    }
    if (gesture.kind === 'pinch') {
      if (pointersRef.current.size === 2) {
        const rect = event.currentTarget.getBoundingClientRect();
        const [first, second] = [...pointersRef.current.values()];
        const target = clampZoom(gesture.zoom * (pinchDistance() / gesture.distance));
        zoomAt(target / view.zoom, (first.x + second.x) / 2 - rect.left, (first.y + second.y) / 2 - rect.top);
      }
      return;
    }
    if (gesture.pointerId !== event.pointerId) {
      return;
    }
    if (gesture.kind === 'pan') {
      userMovedRef.current = true;
      setView((current) => ({
        ...current,
        x: gesture.originX + event.clientX - gesture.startX,
        y: gesture.originY + event.clientY - gesture.startY,
      }));
      return;
    }
    if (gesture.kind === 'connect') {
      setConnectingTo({ fromDivisionId: gesture.fromDivisionId, point: toCanvasPoint(event.clientX, event.clientY) });
      return;
    }
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || (!gesture.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX)) {
      return;
    }
    cancelLongPress();
    if (!gesture.moved) {
      gesture.moved = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      // Moving a node is arranging the chart; stop refitting it under the user.
      userMovedRef.current = true;
      if (gesture.kind === 'node') {
        setDraggingId(gesture.divisionId);
      }
    }
    const next = { x: gesture.origin.x + dx / view.zoom, y: gesture.origin.y + dy / view.zoom };
    if (gesture.kind === 'node') {
      setPendingPositions((current) => new Map(current).set(gesture.divisionId, next));
    } else {
      setSkillsPosition(next);
    }
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    cancelLongPress();
    const gesture = gestureRef.current;
    if (gesture?.kind === 'pinch') {
      if (pointersRef.current.size < 2) {
        gestureRef.current = null;
      }
      return;
    }
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }
    gestureRef.current = null;
    setIsPanning(false);
    setDraggingId(null);

    if (gesture.kind === 'connect') {
      setConnectingTo(null);
      const node = document.elementFromPoint?.(event.clientX, event.clientY)?.closest<HTMLElement>('[data-division-id]');
      const toDivisionId = node?.dataset.divisionId;
      if (toDivisionId && event.type === 'pointerup') {
        addArrow(gesture.fromDivisionId, toDivisionId);
      }
      return;
    }
    if (gesture.kind === 'node' && gesture.moved) {
      suppressClickRef.current = true;
      const dropped = { x: gesture.origin.x + (event.clientX - gesture.startX) / view.zoom, y: gesture.origin.y + (event.clientY - gesture.startY) / view.zoom };
      setPendingPositions((current) => new Map(current).set(gesture.divisionId, dropped));
      actions.updateDivision(gesture.divisionId, { position: { x: Math.round(dropped.x), y: Math.round(dropped.y) } }).catch((error: unknown) => {
        setPendingPositions((current) => {
          const next = new Map(current);
          next.delete(gesture.divisionId);
          return next;
        });
        report(error);
      });
      return;
    }
    if (gesture.kind === 'skills' && gesture.moved) {
      suppressClickRef.current = true;
      try {
        window.localStorage.setItem(`office-skills-position:${officeId}`, JSON.stringify(skillsPoint));
      } catch {
        // The position simply is not remembered in private windows.
      }
    }
  };

  const handleCanvasKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      setConnectSourceId(null);
      return;
    }
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

  const openMenu = (event: ReactMouseEvent, target: MenuState['target']) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ position: { x: event.clientX, y: event.clientY }, target } as MenuState);
  };

  const handleNodeClick = (division: OfficeDivision) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (connectSourceId) {
      const from = connectSourceId;
      setConnectSourceId(null);
      addArrow(from, division.id);
      return;
    }
    onSelect({ type: 'division', divisionId: division.id });
  };

  // ----- menus -----
  const divisionMenuItems = (division: OfficeDivision) => {
    const open = (focus: OfficeAgentSection) => () => onSelect({ type: 'division', divisionId: division.id, focus });
    const isWorker = !division.isCoordinator && !division.isAudit;
    return [
      { key: 'agent', label: t('menu.openAgent'), icon: Bot, onSelect: open('agent') },
      { key: 'model', label: t('menu.model'), icon: Cpu, onSelect: open('model') },
      { key: 'role', label: t('menu.role'), icon: FileText, onSelect: open('role') },
      { key: 'tools', label: t('menu.tools'), icon: Wrench, onSelect: open('tools') },
      { key: 'skills', label: t('menu.skills'), icon: Sparkles, onSelect: open('skills') },
      ...(isWorker ? [
        { key: 'connect', label: t('menu.connectTo'), icon: Link2, onSelect: () => setConnectSourceId(division.id), showDividerBefore: true },
        { key: 'messages', label: t('menu.messages'), icon: MessageSquare, onSelect: () => onSelect({ type: 'messages', divisionId: division.id }) },
      ] : []),
      ...(!division.isCoordinator ? [{
        key: 'enabled',
        label: division.agent.enabled ? t('menu.disable') : t('menu.enable'),
        icon: Power,
        onSelect: () => { actions.updateAgent(division.agent.id, { enabled: !division.agent.enabled }).catch(report); },
        showDividerBefore: !isWorker,
      }] : []),
      ...(division.position ? [{
        key: 'reset', label: t('menu.resetPosition'), icon: RotateCcw,
        onSelect: () => { actions.updateDivision(division.id, { position: null }).catch(report); },
      }] : []),
      ...(isWorker ? [{
        key: 'delete', label: t('menu.deleteDivision'), icon: Trash2, isDanger: true, showDividerBefore: true,
        onSelect: () => onDeleteDivision(division),
      }] : []),
    ];
  };

  const menuItems = (() => {
    if (!menu) {
      return [];
    }
    const { target } = menu;
    if (target.kind === 'division') {
      const division = divisions.find((candidate) => candidate.id === target.divisionId);
      return division ? divisionMenuItems(division) : [];
    }
    if (target.kind === 'flow') {
      return [
        { key: 'details', label: t('menu.arrowDetails'), icon: ArrowRightLeft, onSelect: () => onSelect({ type: 'edge', ...target }) },
        {
          key: 'delete', label: t('menu.deleteArrow'), icon: Trash2, isDanger: true,
          onSelect: () => { actions.deleteFlowEdge(target.fromDivisionId, target.toDivisionId).catch(report); },
        },
      ];
    }
    if (target.kind === 'spoke') {
      return [{ key: 'messages', label: t('menu.messages'), icon: MessageSquare, onSelect: () => onSelect({ type: 'messages', divisionId: target.divisionId }) }];
    }
    if (target.kind === 'skills') {
      return [{ key: 'skills', label: t('menu.viewSkills'), icon: Sparkles, onSelect: () => onSelect({ type: 'skills' }) }];
    }
    return [
      { key: 'add', label: t('menu.addAgentHere'), icon: Plus, onSelect: () => onAddDivisionAt(target.at) },
      {
        key: 'layout', label: t('menu.autoLayout'), icon: LayoutGrid,
        onSelect: () => {
          setSkillsPosition(null);
          try {
            window.localStorage.removeItem(`office-skills-position:${officeId}`);
          } catch {
            // Nothing stored.
          }
          Promise.all(divisions.filter((division) => division.position)
            .map((division) => actions.updateDivision(division.id, { position: null })))
            .catch(report);
          userMovedRef.current = false;
        },
      },
      { key: 'fit', label: t('tree.fit'), icon: Maximize2, onSelect: () => { userMovedRef.current = false; fitToCanvas(); } },
    ];
  })();

  // ----- edges -----
  const workerIds = new Set(workers.map((division) => division.id));
  const flowEdges = flow.filter((edge) => workerIds.has(edge.fromDivisionId) && workerIds.has(edge.toDivisionId));
  const hasIncoming = new Set(flowEdges.map((edge) => edge.toDivisionId));
  // The coordinator hands work to the start of every flow branch and to divisions outside the flow.
  const spokeTargets = workers.filter((division) => !hasIncoming.has(division.id));
  const nodeSize = { width: NODE_WIDTH, height: NODE_HEIGHT };
  const selectedOutlineStyle = { outlineWidth: 2.5 / view.zoom, outlineOffset: 3 / view.zoom };
  const isSelectedDivision = (divisionId: string) =>
    (selection.type === 'division' || selection.type === 'messages') && selection.divisionId === divisionId;

  const renderNode = (division: OfficeDivision) => {
    const point = positionOf(division);
    const status = statusOf(division);
    const agent = division.agent;
    const statusLabel = t(`nodeStatus.${status}`);
    const hasModel = Boolean(agent.provider && agent.model);
    const queued = divisionStates.get(division.id)?.queued ?? 0;
    const tokens = usageByDivision?.get(division.id) ?? 0;
    const selected = isSelectedDivision(division.id);
    const isWorker = !division.isCoordinator && !division.isAudit;
    const dragging = draggingId === division.id;
    return (
      <div
        key={division.id}
        role="button"
        tabIndex={0}
        data-division-id={division.id}
        data-testid={`office-node-${division.slug}`}
        data-status={status}
        aria-pressed={selected}
        aria-label={`${division.name} · ${agent.name} · ${statusLabel}`}
        onClick={() => handleNodeClick(division)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleNodeClick(division);
          } else if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            setMenu({ position: { x: rect.left + 12, y: rect.top + 12 }, target: { kind: 'division', divisionId: division.id } });
          }
        }}
        onContextMenu={(event) => openMenu(event, { kind: 'division', divisionId: division.id })}
        className={cn(
          'office-node-enter glass-surface group absolute z-10 flex cursor-pointer flex-col gap-1 rounded-[12px] border px-2.5 py-2 text-left transition-colors hover:bg-card/80',
          FOCUS_OUTLINE,
          status === 'running' && 'office-node-running',
          selected && SELECTED_OUTLINE,
          !agent.enabled && 'opacity-60',
          dragging && 'cursor-grabbing shadow-lg',
          connectSourceId && connectSourceId !== division.id && isWorker && 'outline-dashed outline-1 outline-primary/60',
        )}
        style={{
          left: point.x,
          top: point.y,
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
          borderColor: STATUS_BORDER[status],
          ...(selected ? selectedOutlineStyle : {}),
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
              'max-w-[76px] truncate rounded-md border px-1 py-0.5 font-mono text-[9.5px] leading-none',
              hasModel ? 'border-border text-muted-foreground' : 'border-warn/60 text-warn',
            )}
            title={hasModel ? `${agent.provider} · ${agent.model}` : t('tree.noModel')}
          >
            {hasModel ? agent.model : t('tree.noModel')}
          </span>
          <OfficeStatusBadge tone={status} label={statusLabel} />
          {queued > 0 && <span className="shrink-0 text-[9.5px] text-muted-foreground">{t('tree.queued', { count: queued })}</span>}
          {tokens > 0 && (
            <span className="ml-auto shrink-0 font-mono text-[9.5px] text-muted-foreground" title={t('usage.nodeTitle', { count: tokens })} data-testid={`office-node-tokens-${division.slug}`}>
              {formatTokens(tokens)}
            </span>
          )}
        </span>
        {isWorker && (
          <span
            data-connect-from={division.id}
            role="presentation"
            title={t('tree.dragToConnect')}
            className={cn(
              'absolute -bottom-2 left-1/2 flex h-4 w-4 -translate-x-1/2 cursor-crosshair items-center justify-center rounded-full border-2 border-primary bg-background opacity-0 transition-opacity group-hover:opacity-100',
              (selected || connectingTo?.fromDivisionId === division.id) && 'opacity-100',
            )}
          >
            <span className="h-1 w-1 rounded-full bg-primary" />
          </span>
        )}
      </div>
    );
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
        onContextMenu={(event) => {
          if ((event.target as Element).closest('[data-division-id], path[data-hit], [data-skills-node]')) {
            return;
          }
          openMenu(event, { kind: 'canvas', at: toCanvasPoint(event.clientX, event.clientY) });
        }}
        className={cn(
          'office-canvas absolute inset-0 touch-none select-none focus-visible:outline-none',
          isPanning ? 'cursor-grabbing' : 'cursor-grab',
          connectSourceId && 'cursor-crosshair',
        )}
        style={{ backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${20 * view.zoom}px ${20 * view.zoom}px` }}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{ width: 1, height: 1, transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
          data-testid="office-tree"
          data-zoom={view.zoom.toFixed(2)}
        >
          <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={1} height={1} aria-hidden>
            <defs>
              <marker id={`office-arrow-${officeId}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--muted)" />
              </marker>
            </defs>

            {/* case → coordinator */}
            {coordinator && (
              <line
                x1={casePoint.x + CASE_WIDTH / 2}
                y1={casePoint.y + CASE_HEIGHT}
                x2={coordinatorPoint.x + NODE_WIDTH / 2}
                y2={coordinatorPoint.y}
                stroke={caseItem?.coordinatorBusy ? 'var(--accent)' : 'var(--border)'}
                strokeWidth={1.5}
                className={cn(caseItem?.coordinatorBusy && 'office-edge-flow')}
              />
            )}

            {/* coordinator → start of each branch */}
            {coordinator && spokeTargets.map((division) => {
              const state = divisionStates.get(division.id);
              const active = state?.status === 'running' || flowingDivisionIds.has(division.id);
              const selected = selection.type === 'messages' && selection.divisionId === division.id;
              const path = connectorPath(coordinatorPoint, nodeSize, positionOf(division), nodeSize);
              return (
                <g key={`spoke-${division.id}`}>
                  <path
                    d={path}
                    fill="none"
                    stroke={active || selected ? 'var(--accent)' : 'var(--border)'}
                    strokeWidth={selected ? 3 : active ? 1.75 : 1.5}
                    strokeDasharray={flowEdges.length > 0 ? '5 4' : undefined}
                    className={cn(active && 'office-edge-flow')}
                    data-testid={`office-edge-${division.slug}`}
                    data-active={active ? 'true' : 'false'}
                  />
                  <path
                    d={path}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={14}
                    data-hit
                    style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                    onClick={() => onSelect({ type: 'messages', divisionId: division.id })}
                    onContextMenu={(event) => openMenu(event, { kind: 'spoke', divisionId: division.id })}
                  />
                </g>
              );
            })}

            {/* flow arrows between divisions */}
            {flowEdges.map((edge) => {
              const from = divisions.find((division) => division.id === edge.fromDivisionId) as OfficeDivision;
              const to = divisions.find((division) => division.id === edge.toDivisionId) as OfficeDivision;
              const active = divisionStates.get(to.id)?.status === 'running' || flowingDivisionIds.has(to.id);
              const selected = selection.type === 'edge' && selection.fromDivisionId === from.id && selection.toDivisionId === to.id;
              const path = connectorPath(positionOf(from), nodeSize, positionOf(to), nodeSize);
              return (
                <g key={`flow-${from.id}-${to.id}`}>
                  <path
                    d={path}
                    fill="none"
                    stroke={active || selected ? 'var(--accent)' : 'color-mix(in srgb, var(--muted) 70%, transparent)'}
                    strokeWidth={selected ? 3 : 1.75}
                    markerEnd={`url(#office-arrow-${officeId})`}
                    className={cn(active && 'office-edge-flow')}
                    data-testid={`office-flow-${from.slug}-${to.slug}`}
                  />
                  <path
                    d={path}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={14}
                    data-hit
                    style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                    onClick={() => onSelect({ type: 'edge', fromDivisionId: from.id, toDivisionId: to.id })}
                    onContextMenu={(event) => openMenu(event, { kind: 'flow', fromDivisionId: from.id, toDivisionId: to.id })}
                  />
                </g>
              );
            })}

            {/* work under review travels to the audit layer */}
            {audit && workers.map((division) => {
              if (divisionStates.get(division.id)?.status !== 'review') {
                return null;
              }
              return (
                <path
                  key={`audit-${division.id}`}
                  d={connectorPath(positionOf(division), nodeSize, positionOf(audit), nodeSize)}
                  fill="none"
                  stroke="var(--text-dim)"
                  strokeWidth={1.25}
                  strokeDasharray="4 4"
                  className="office-edge-flow"
                />
              );
            })}

            {/* the arrow being drawn */}
            {connectingTo && (() => {
              const from = divisions.find((division) => division.id === connectingTo.fromDivisionId);
              if (!from) return null;
              const start = positionOf(from);
              return (
                <line
                  x1={start.x + NODE_WIDTH / 2}
                  y1={start.y + NODE_HEIGHT}
                  x2={connectingTo.point.x}
                  y2={connectingTo.point.y}
                  stroke="var(--accent)"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  markerEnd={`url(#office-arrow-${officeId})`}
                />
              );
            })()}
          </svg>

          {/* case card */}
          <button
            type="button"
            data-case-node
            data-testid="office-node-case"
            aria-pressed={selection.type === 'case'}
            onClick={() => onSelect({ type: 'case' })}
            className={cn(
              'office-node-enter glass-surface absolute z-10 flex flex-col justify-center gap-1 rounded-[12px] border px-3 text-left hover:bg-card/80',
              FOCUS_OUTLINE,
              selection.type === 'case' && SELECTED_OUTLINE,
            )}
            style={{
              left: casePoint.x,
              top: casePoint.y,
              width: CASE_WIDTH,
              height: CASE_HEIGHT,
              borderColor: STATUS_BORDER[caseItem ? officeCaseTone(caseItem.status) : 'idle'],
              ...(selection.type === 'case' ? selectedOutlineStyle : {}),
            }}
          >
            <span className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
              {caseItem ? t('tree.caseNode') : projectName}
            </span>
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-[13px] font-semibold text-foreground">{caseItem ? caseItem.title : t('tree.noCase')}</span>
              {caseItem && <OfficeStatusBadge tone={officeCaseTone(caseItem.status)} label={t(`status.${caseItem.status}`)} />}
            </span>
          </button>

          {divisions.map(renderNode)}

          {/* message-count chips on the coordinator → division spokes */}
          {coordinator && spokeTargets.map((division) => {
            const count = messageCounts.get(division.id) ?? 0;
            if (count === 0) {
              return null;
            }
            const target = positionOf(division);
            return (
              <button
                key={`messages-${division.id}`}
                type="button"
                data-edge-chip
                data-canvas-control
                onClick={() => onSelect({ type: 'messages', divisionId: division.id })}
                aria-label={t('tree.openMessages', { name: division.name })}
                title={t('tree.messages', { count })}
                className="glass-surface-strong absolute z-20 flex h-5 -translate-x-1/2 -translate-y-1/2 items-center gap-0.5 rounded-full border px-1.5 text-[10px] text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                style={{
                  left: (coordinatorPoint.x + target.x) / 2 + NODE_WIDTH / 2,
                  top: (coordinatorPoint.y + NODE_HEIGHT + target.y) / 2,
                }}
              >
                <MessageSquare className="h-3 w-3" />
                {count}
              </button>
            );
          })}

          {/* skills layer */}
          <button
            type="button"
            data-skills-node
            data-testid="office-node-skills"
            aria-pressed={selection.type === 'skills'}
            onClick={() => {
              if (suppressClickRef.current) {
                suppressClickRef.current = false;
                return;
              }
              onSelect({ type: 'skills' });
            }}
            onContextMenu={(event) => openMenu(event, { kind: 'skills' })}
            className={cn(
              'office-node-enter glass-surface absolute z-10 flex flex-col gap-1 rounded-[12px] border px-2.5 py-2 text-left hover:bg-card/80',
              FOCUS_OUTLINE,
              selection.type === 'skills' && SELECTED_OUTLINE,
            )}
            style={{
              left: skillsPoint.x,
              top: skillsPoint.y,
              width: NODE_WIDTH,
              height: NODE_HEIGHT,
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
        </div>
      </div>

      {connectSourceId && (
        <div className="glass-surface-strong absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border px-3 py-1.5 text-xs text-foreground" role="status">
          {t('tree.connectHint', { name: divisions.find((division) => division.id === connectSourceId)?.name ?? '' })}
          <button type="button" className="text-primary hover:underline" onClick={() => setConnectSourceId(null)}>{t('common.cancel')}</button>
        </div>
      )}
      {canvasError && (
        <div className="absolute left-3 top-3 z-30 flex max-w-sm items-start gap-2 rounded-[10px] border border-err/30 bg-background/95 px-3 py-2 text-xs text-err shadow-sm" role="alert">
          <span className="min-w-0 flex-1">{canvasError}</span>
          <button type="button" className="shrink-0 text-muted-foreground hover:text-foreground" onClick={() => setCanvasError(null)} aria-label={t('common.close')}>×</button>
        </div>
      )}

      <div
        data-canvas-control
        className="glass-surface-strong absolute bottom-3 right-3 z-30 flex items-center gap-0.5 rounded-[10px] border p-1"
        role="toolbar"
        aria-label={t('tree.controls')}
      >
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

      {menu && menuItems.length > 0 && (
        <ContextMenu position={menu.position} items={menuItems} ariaLabel={t('menu.label')} onClose={() => setMenu(null)} />
      )}
    </div>
  );
}
