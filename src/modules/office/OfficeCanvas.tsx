import {
  ArrowRightLeft,
  Bot,
  ClipboardPaste,
  Copy,
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
  Send,
  Sparkles,
  Trash2,
  Unlink,
  Wrench,
  X,
  Zap,
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
  autoSkillPositions,
  connectorEnds,
  CASE_HEIGHT,
  CASE_WIDTH,
  casePosition,
  computeAutoLayout,
  connectorPath,
  formatTokens,
  NODE_HEIGHT,
  NODE_WIDTH,
  SKILL_HEIGHT,
  SKILL_WIDTH,
} from '@/modules/office/utils/officeCanvasLayout';
import type { CanvasPoint } from '@/modules/office/utils/officeCanvasLayout';
import { ContextMenu } from '@/shared/ui';
import type {
  OfficeActions,
  OfficeAgentSection,
  OfficeCase,
  OfficeDivision,
  OfficeFlowEdge,
  OfficeInstalledSkill,
  OfficeMessage,
  OfficeNodeStatus,
  OfficeSelection,
  OfficeSkillNode,
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
/**
 * A node in the Shift multi-selection gets a dashed frame around it, so it reads
 * differently from the one node open in the panel. A separate element, because
 * the nodes' glass surface owns box-shadow (which Tailwind rings use).
 */
const MarkedFrame = () => (
  <span aria-hidden data-marked-frame className="pointer-events-none absolute -inset-[5px] rounded-[15px] border-2 border-dashed border-primary" />
);
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

/** One end of a connection drawn on the canvas: an agent (division) or a skill node. */
type ConnectEnd = { kind: 'division' | 'skill'; id: string };

/** What a pointer that went down on the canvas is doing. */
type Gesture =
  | { kind: 'pan'; pointerId: number; startX: number; startY: number; originX: number; originY: number }
  | { kind: 'node'; pointerId: number; divisionId: string; startX: number; startY: number; origin: CanvasPoint; moved: boolean }
  | { kind: 'skill'; pointerId: number; nodeId: string; startX: number; startY: number; origin: CanvasPoint; moved: boolean }
  | { kind: 'connect'; pointerId: number; from: ConnectEnd }
  | { kind: 'marquee'; pointerId: number; start: CanvasPoint; base: ReadonlySet<string> }
  | { kind: 'reconnect'; pointerId: number; fromDivisionId: string; toDivisionId: string; end: 'from' | 'to' }
  | { kind: 'group'; pointerId: number; startX: number; startY: number; origins: ReadonlyMap<string, CanvasPoint>; moved: boolean; pressedKey: string }
  | { kind: 'pinch'; distance: number; zoom: number };

/** The right-click menu and what it was opened on. */
type MenuState =
  | { position: CanvasPoint; target: { kind: 'division'; divisionId: string } }
  | { position: CanvasPoint; target: { kind: 'flow'; fromDivisionId: string; toDivisionId: string } }
  | { position: CanvasPoint; target: { kind: 'spoke'; divisionId: string } }
  | { position: CanvasPoint; target: { kind: 'canvas'; at: CanvasPoint } }
  | { position: CanvasPoint; target: { kind: 'skill'; nodeId: string } }
  | { position: CanvasPoint; target: { kind: 'skillLink'; nodeId: string; divisionId: string } }
  | { position: CanvasPoint; target: { kind: 'marked' } };

/** Key of a node in the multi-selection and in the pending positions: a division id, or `skill:<id>`. */
const skillKey = (nodeId: string) => `skill:${nodeId}`;

/** Is a node's box fully inside the rectangle between two canvas points? Like a diagram editor, touching is not enough. */
const isInside = (point: CanvasPoint, width: number, height: number, a: CanvasPoint, b: CanvasPoint): boolean => (
  point.x >= Math.min(a.x, b.x) && point.x + width <= Math.max(a.x, b.x)
  && point.y >= Math.min(a.y, b.y) && point.y + height <= Math.max(a.y, b.y)
);

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
  actions: Pick<
    OfficeActions,
    'addFlowEdge' | 'deleteFlowEdge' | 'updateDivision' | 'updateAgent'
    | 'addSkillNode' | 'moveSkillNode' | 'deleteSkillNode' | 'linkSkill' | 'unlinkSkill'
  >;
  /** "Add an agent here" from the canvas menu; the position is in canvas pixels. */
  onAddDivisionAt: (position: CanvasPoint) => void;
  onDeleteDivision: (division: OfficeDivision) => void;
  /** Skills placed on the canvas; an agent linked to one has that skill. */
  skillNodes?: OfficeSkillNode[];
  /** Installed skills, for descriptions and to flag a node whose skill is not installed. */
  installedSkills?: OfficeInstalledSkill[];
  /** "Add skill here" from the canvas menu. */
  onAddSkillAt?: (position: CanvasPoint) => void;
  /** The skill copied with Ctrl+C (kept by the page, so it can be pasted into another workspace). */
  skillClipboard?: string | null;
  onCopySkill?: (skillName: string) => void;
  /** Answers the coordinator's open question (a note that un-parks the case). */
  onAnswerQuestion?: (text: string) => Promise<void>;
  /** Focuses the message box to the coordinator. */
  onMessageCoordinator?: () => void;
  /** "Quick task": a job straight to one team, without the coordinator. */
  onQuickTask?: (division: OfficeDivision) => void;
};

/**
 * The workspace canvas, shown by the office module's OfficePage: the case,
 * the coordinator, every division as a node that can be dragged anywhere, the
 * flow arrows between divisions (drag from a node's handle onto another node
 * to add one), the audit layer, and skill nodes (an agent linked to a skill
 * node has that skill; Ctrl+C / Ctrl+V copies a skill node). Shift+drag on
 * empty canvas selects the nodes inside a rectangle and Shift+click adds or
 * removes one; the selection moves together. Right-click (or
 * hold on touch) opens a menu for the node, line or empty canvas under the
 * pointer. An open question from the coordinator is shown next to it.
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
  skillNodes = [],
  installedSkills = [],
  onAddSkillAt,
  skillClipboard = null,
  onCopySkill,
  onAnswerQuestion,
  onMessageCoordinator,
  onQuickTask,
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

  // ----- positions -----
  const layout = useMemo(() => computeAutoLayout(divisions, flow), [divisions, flow]);
  // Positions being dragged, or dropped but not yet confirmed by the server's frame.
  const [pendingPositions, setPendingPositions] = useState<ReadonlyMap<string, CanvasPoint>>(() => new Map());

  // A dropped node keeps its local position until the division comes back from the server with it.
  useEffect(() => {
    setPendingPositions((current) => {
      if (current.size === 0) {
        return current;
      }
      const next = new Map(current);
      const saved = [
        ...divisions.map((division) => [division.id, division.position] as const),
        ...skillNodes.map((node) => [`skill:${node.id}`, node.position] as const),
      ];
      for (const [key, position] of saved) {
        const pending = next.get(key);
        if (pending && position && Math.round(position.x) === Math.round(pending.x) && Math.round(position.y) === Math.round(pending.y)) {
          next.delete(key);
        }
      }
      return next.size === current.size ? current : next;
    });
  }, [divisions, skillNodes]);

  const positionOf = useCallback((division: OfficeDivision): CanvasPoint => (
    pendingPositions.get(division.id) ?? division.position ?? layout.divisions.get(division.id) ?? { x: 0, y: 0 }
  ), [layout, pendingPositions]);

  const autoSkills = useMemo(
    () => autoSkillPositions(layout.skills, skillNodes.filter((node) => !node.position).map((node) => node.id)),
    [layout, skillNodes],
  );
  const skillPositionOf = useCallback((node: OfficeSkillNode): CanvasPoint => (
    pendingPositions.get(`skill:${node.id}`) ?? node.position ?? autoSkills.get(node.id) ?? layout.skills
  ), [autoSkills, layout, pendingPositions]);

  const coordinatorPoint = coordinator ? positionOf(coordinator) : { x: 0, y: 110 };
  const casePoint = casePosition(coordinatorPoint);

  const bounds = useMemo(() => {
    const coordinatorAt = coordinator ? positionOf(coordinator) : { x: 0, y: 110 };
    const caseAt = casePosition(coordinatorAt);
    const points: Array<CanvasPoint & { width: number; height: number }> = [
      { ...caseAt, width: CASE_WIDTH, height: CASE_HEIGHT },
      ...skillNodes.map((node) => ({ ...skillPositionOf(node), width: SKILL_WIDTH, height: SKILL_HEIGHT })),
      ...divisions.map((division) => ({ ...positionOf(division), width: NODE_WIDTH, height: NODE_HEIGHT })),
    ];
    const minX = Math.min(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxX = Math.max(...points.map((point) => point.x + point.width));
    const maxY = Math.max(...points.map((point) => point.y + point.height));
    return { minX, minY, width: maxX - minX, height: maxY - minY };
  }, [coordinator, divisions, positionOf, skillNodes, skillPositionOf]);

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
  // Nodes picked with Shift (a rectangle or Shift+click), moved and deleted together; keys as in pendingPositions.
  const [marked, setMarked] = useState<ReadonlySet<string>>(() => new Set());
  // An arrow end being dragged off its node: the arrow, which end, and where the pointer is.
  const [reconnecting, setReconnecting] = useState<{ fromDivisionId: string; toDivisionId: string; end: 'from' | 'to'; point: CanvasPoint } | null>(null);
  // The skill line picked with a click, so Delete can cut it.
  const [selectedLink, setSelectedLink] = useState<{ nodeId: string; divisionId: string } | null>(null);
  // A picked skill line only stays picked while its skill is the selection.
  useEffect(() => {
    if (selection.type !== 'skill') {
      setSelectedLink(null);
    }
  }, [selection.type]);
  // The Shift+drag selection rectangle, in canvas pixels.
  const [marquee, setMarquee] = useState<{ from: CanvasPoint; to: CanvasPoint } | null>(null);
  // The loose end of a line being drawn from a node's handle, in canvas pixels.
  const [connectingTo, setConnectingTo] = useState<{ from: ConnectEnd; point: CanvasPoint } | null>(null);
  // "Connect to…" picked from a menu: the next node clicked becomes the line's other end.
  const [connectSource, setConnectSource] = useState<ConnectEnd | null>(null);
  // Where the pointer last was on the canvas, in canvas pixels; Ctrl+V pastes a skill there.
  const lastPointerRef = useRef<CanvasPoint | null>(null);
  // The open right-click menu.
  const [menu, setMenu] = useState<MenuState | null>(null);
  // Error of the last canvas action (an arrow that would loop, a failed save).
  const [canvasError, setCanvasError] = useState<string | null>(null);
  // The answer being typed into the question bubble.
  const [answer, setAnswer] = useState('');
  // The answer is being sent.
  const [isAnswering, setIsAnswering] = useState(false);
  // The question bubble folded into a chip, so it does not cover the nodes behind it.
  const [isQuestionFolded, setIsQuestionFolded] = useState(false);

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

  /**
   * Joins two ends drawn on the canvas: agent to agent is a flow arrow, agent
   * and skill (either way round) gives the agent that skill.
   */
  const connectEnds = (from: ConnectEnd, to: ConnectEnd) => {
    if (from.kind === to.kind && from.id === to.id) {
      return;
    }
    setCanvasError(null);
    if (from.kind === 'division' && to.kind === 'division') {
      actions.addFlowEdge(from.id, to.id).catch(report);
    } else if (from.kind !== to.kind) {
      const skill = from.kind === 'skill' ? from : to;
      const division = from.kind === 'division' ? from : to;
      actions.linkSkill(skill.id, division.id).catch(report);
    }
  };

  /** The node under a screen point: an agent or a skill node. */
  const endAt = (clientX: number, clientY: number): ConnectEnd | null => {
    const element = document.elementFromPoint?.(clientX, clientY);
    const division = element?.closest<HTMLElement>('[data-division-id]')?.dataset.divisionId;
    if (division) return { kind: 'division', id: division };
    const skill = element?.closest<HTMLElement>('[data-skill-node-id]')?.dataset.skillNodeId;
    return skill ? { kind: 'skill', id: skill } : null;
  };

  const pasteSkill = (at: CanvasPoint | null) => {
    if (!skillClipboard) {
      return;
    }
    const position = at ?? { x: layout.skills.x, y: layout.skills.y + NODE_HEIGHT + 36 };
    setCanvasError(null);
    actions.addSkillNode({ skillName: skillClipboard, position: { x: Math.round(position.x), y: Math.round(position.y) } })
      .then((node) => onSelect({ type: 'skill', nodeId: node.id }))
      .catch(report);
  };

  /** Every node fully inside the rectangle, as multi-selection keys. */
  const keysInRectangle = (a: CanvasPoint, b: CanvasPoint): string[] => [
    ...divisions.filter((division) => isInside(positionOf(division), NODE_WIDTH, NODE_HEIGHT, a, b)).map((division) => division.id),
    ...skillNodes.filter((node) => isInside(skillPositionOf(node), SKILL_WIDTH, SKILL_HEIGHT, a, b)).map((node) => skillKey(node.id)),
  ];

  const toggleMarked = (key: string) => {
    setMarked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const clearMarked = () => setMarked((current) => (current.size === 0 ? current : new Set()));

  /** Where a node is now, by multi-selection key. */
  const positionOfKey = (key: string): CanvasPoint | null => {
    if (key.startsWith('skill:')) {
      const node = skillNodes.find((candidate) => skillKey(candidate.id) === key);
      return node ? skillPositionOf(node) : null;
    }
    const division = divisions.find((candidate) => candidate.id === key);
    return division ? positionOf(division) : null;
  };

  /** Saves a dropped node's position; on failure it snaps back and the error is shown. */
  const savePosition = (key: string, dropped: CanvasPoint) => {
    const position = { x: Math.round(dropped.x), y: Math.round(dropped.y) };
    const save = key.startsWith('skill:')
      ? actions.moveSkillNode(key.slice('skill:'.length), position)
      : actions.updateDivision(key, { position });
    save.catch((error: unknown) => {
      setPendingPositions((current) => {
        const next = new Map(current);
        next.delete(key);
        return next;
      });
      report(error);
    });
  };

  /** Deletes the marked skill nodes; teams are deleted one by one from their own menu, with a confirmation. */
  const deleteMarkedSkills = () => {
    const nodeIds = [...marked].filter((key) => key.startsWith('skill:')).map((key) => key.slice('skill:'.length));
    if (nodeIds.length === 0) {
      return;
    }
    setCanvasError(null);
    Promise.all(nodeIds.map((nodeId) => actions.deleteSkillNode(nodeId))).catch(report);
    setMarked((current) => new Set([...current].filter((key) => !key.startsWith('skill:'))));
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

    // Dragging an end of the selected arrow detaches it; dropping it on another team reconnects it.
    const edgeEnd = target.closest<SVGElement>('[data-edge-end]');
    if (edgeEnd) {
      const fromDivisionId = edgeEnd.dataset.edgeFrom as string;
      const toDivisionId = edgeEnd.dataset.edgeTo as string;
      const end = edgeEnd.dataset.edgeEnd === 'from' ? 'from' : 'to';
      gestureRef.current = { kind: 'reconnect', pointerId: event.pointerId, fromDivisionId, toDivisionId, end };
      capture();
      setReconnecting({ fromDivisionId, toDivisionId, end, point: toCanvasPoint(event.clientX, event.clientY) });
      return;
    }

    const handle = target.closest<HTMLElement>('[data-connect-from]');
    if (handle) {
      const from: ConnectEnd = { kind: handle.dataset.connectKind === 'skill' ? 'skill' : 'division', id: handle.dataset.connectFrom as string };
      gestureRef.current = { kind: 'connect', pointerId: event.pointerId, from };
      capture();
      setConnectingTo({ from, point: toCanvasPoint(event.clientX, event.clientY) });
      return;
    }

    // Pressing a node that is part of a multi-selection drags the whole selection.
    const pressedElement = target.closest<HTMLElement>('[data-division-id], [data-skill-node-id]');
    const pressedKey = pressedElement?.dataset.divisionId ?? (pressedElement?.dataset.skillNodeId ? skillKey(pressedElement.dataset.skillNodeId) : null);
    if (pressedKey && marked.has(pressedKey) && marked.size > 1 && !event.shiftKey) {
      const origins = new Map<string, CanvasPoint>();
      for (const key of marked) {
        const point = positionOfKey(key);
        if (point) origins.set(key, point);
      }
      gestureRef.current = { kind: 'group', pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, origins, moved: false, pressedKey };
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
    const skillElement = target.closest<HTMLElement>('[data-skill-node-id]');
    const skillNode = skillElement ? skillNodes.find((node) => node.id === skillElement.dataset.skillNodeId) : undefined;
    if (skillNode) {
      gestureRef.current = {
        kind: 'skill', pointerId: event.pointerId, nodeId: skillNode.id,
        startX: event.clientX, startY: event.clientY, origin: skillPositionOf(skillNode), moved: false,
      };
      if (event.pointerType !== 'mouse') {
        const { clientX, clientY } = event;
        longPressRef.current = window.setTimeout(() => {
          longPressRef.current = null;
          gestureRef.current = null;
          suppressClickRef.current = true;
          setMenu({ position: { x: clientX, y: clientY }, target: { kind: 'skill', nodeId: skillNode.id } });
        }, LONG_PRESS_MS);
      }
      return;
    }
    if (target.closest('[data-case-node], path[data-hit], [data-edge-chip]')) {
      return;
    }
    // Shift+drag on empty canvas draws a selection rectangle instead of panning.
    if (event.shiftKey) {
      // Shift+press would otherwise extend the page's text selection across the panels.
      event.preventDefault();
      window.getSelection?.()?.removeAllRanges();
      const start = toCanvasPoint(event.clientX, event.clientY);
      gestureRef.current = { kind: 'marquee', pointerId: event.pointerId, start, base: marked };
      capture();
      setMarquee({ from: start, to: start });
      return;
    }
    gestureRef.current = {
      kind: 'pan', pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: view.x, originY: view.y,
    };
    capture();
    setIsPanning(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    lastPointerRef.current = toCanvasPoint(event.clientX, event.clientY);
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
      setConnectingTo({ from: gesture.from, point: toCanvasPoint(event.clientX, event.clientY) });
      return;
    }
    if (gesture.kind === 'reconnect') {
      setReconnecting({ fromDivisionId: gesture.fromDivisionId, toDivisionId: gesture.toDivisionId, end: gesture.end, point: toCanvasPoint(event.clientX, event.clientY) });
      return;
    }
    if (gesture.kind === 'marquee') {
      const to = toCanvasPoint(event.clientX, event.clientY);
      setMarquee({ from: gesture.start, to });
      setMarked(new Set([...gesture.base, ...keysInRectangle(gesture.start, to)]));
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
      setDraggingId(gesture.kind === 'node' ? gesture.divisionId : gesture.kind === 'group' ? gesture.pressedKey : `skill:${gesture.nodeId}`);
    }
    if (gesture.kind === 'group') {
      setPendingPositions((current) => {
        const next = new Map(current);
        for (const [key, origin] of gesture.origins) {
          next.set(key, { x: origin.x + dx / view.zoom, y: origin.y + dy / view.zoom });
        }
        return next;
      });
      return;
    }
    const next = { x: gesture.origin.x + dx / view.zoom, y: gesture.origin.y + dy / view.zoom };
    const key = gesture.kind === 'node' ? gesture.divisionId : `skill:${gesture.nodeId}`;
    setPendingPositions((current) => new Map(current).set(key, next));
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
      const to = endAt(event.clientX, event.clientY);
      if (to && event.type === 'pointerup') {
        connectEnds(gesture.from, to);
      }
      return;
    }
    if (gesture.kind === 'marquee') {
      setMarquee(null);
      return;
    }
    if (gesture.kind === 'reconnect') {
      setReconnecting(null);
      if (event.type !== 'pointerup') {
        return;
      }
      const dropped = endAt(event.clientX, event.clientY);
      const keep = gesture.end === 'from' ? gesture.toDivisionId : gesture.fromDivisionId;
      const moved = gesture.end === 'from' ? gesture.fromDivisionId : gesture.toDivisionId;
      if (dropped?.kind === 'division' && dropped.id === moved) {
        return;
      }
      setCanvasError(null);
      // Off every node: the arrow is cut. On another team: it is cut and drawn again to that team.
      const next = dropped?.kind === 'division' && dropped.id !== keep
        ? (gesture.end === 'from' ? [dropped.id, keep] as const : [keep, dropped.id] as const)
        : null;
      actions.deleteFlowEdge(gesture.fromDivisionId, gesture.toDivisionId)
        .then(() => (next ? actions.addFlowEdge(next[0], next[1]) : undefined))
        .then(() => {
          onSelect(next ? { type: 'edge', fromDivisionId: next[0], toDivisionId: next[1] } : { type: 'case' });
        })
        .catch(report);
      return;
    }
    if (gesture.kind === 'pan') {
      // A plain click on empty canvas (no drag) drops the multi-selection.
      if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) < DRAG_THRESHOLD_PX) {
        clearMarked();
      }
      return;
    }
    if (gesture.kind === 'group') {
      if (!gesture.moved) {
        return;
      }
      suppressClickRef.current = true;
      const dx = (event.clientX - gesture.startX) / view.zoom;
      const dy = (event.clientY - gesture.startY) / view.zoom;
      const dropped = new Map([...gesture.origins].map(([key, origin]) => [key, { x: origin.x + dx, y: origin.y + dy }]));
      setPendingPositions((current) => new Map([...current, ...dropped]));
      for (const [key, point] of dropped) {
        savePosition(key, point);
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
    if (gesture.kind === 'skill' && gesture.moved) {
      suppressClickRef.current = true;
      const key = `skill:${gesture.nodeId}`;
      const dropped = { x: gesture.origin.x + (event.clientX - gesture.startX) / view.zoom, y: gesture.origin.y + (event.clientY - gesture.startY) / view.zoom };
      setPendingPositions((current) => new Map(current).set(key, dropped));
      actions.moveSkillNode(gesture.nodeId, { x: Math.round(dropped.x), y: Math.round(dropped.y) }).catch((error: unknown) => {
        setPendingPositions((current) => {
          const next = new Map(current);
          next.delete(key);
          return next;
        });
        report(error);
      });
    }
  };

  const handleCanvasKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      setConnectSource(null);
      clearMarked();
      return;
    }
    // Ctrl/Cmd+C copies the selected skill node, Ctrl/Cmd+V places a copy where the pointer is.
    const isShortcut = (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey;
    const inField = (event.target as Element).closest('input, textarea, [contenteditable="true"]');
    if (isShortcut && !inField && event.key.toLowerCase() === 'c' && selection.type === 'skill') {
      const node = skillNodes.find((candidate) => candidate.id === selection.nodeId);
      if (node) {
        event.preventDefault();
        onCopySkill?.(node.skillName);
      }
      return;
    }
    // Ctrl/Cmd+A picks every node, like a diagram editor.
    if (isShortcut && !inField && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      setMarked(new Set([...divisions.map((division) => division.id), ...skillNodes.map((node) => skillKey(node.id))]));
      return;
    }
    if (!inField && (event.key === 'Delete' || event.key === 'Backspace') && selection.type === 'edge' && marked.size === 0) {
      event.preventDefault();
      setCanvasError(null);
      actions.deleteFlowEdge(selection.fromDivisionId, selection.toDivisionId).then(() => onSelect({ type: 'case' })).catch(report);
      return;
    }
    if (!inField && (event.key === 'Delete' || event.key === 'Backspace') && selectedLink && marked.size === 0) {
      event.preventDefault();
      setCanvasError(null);
      actions.unlinkSkill(selectedLink.nodeId, selectedLink.divisionId).catch(report);
      setSelectedLink(null);
      return;
    }
    if (!inField && (event.key === 'Delete' || event.key === 'Backspace') && marked.size > 0) {
      event.preventDefault();
      deleteMarkedSkills();
      return;
    }
    if (isShortcut && !inField && event.key.toLowerCase() === 'v' && skillClipboard) {
      event.preventDefault();
      pasteSkill(lastPointerRef.current);
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

  const handleNodeClick = (division: OfficeDivision, withShift = false) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (withShift) {
      toggleMarked(division.id);
      return;
    }
    clearMarked();
    setSelectedLink(null);
    if (connectSource) {
      const from = connectSource;
      setConnectSource(null);
      connectEnds(from, { kind: 'division', id: division.id });
      return;
    }
    onSelect({ type: 'division', divisionId: division.id });
  };

  const handleSkillClick = (node: OfficeSkillNode, withShift = false) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (withShift) {
      toggleMarked(skillKey(node.id));
      return;
    }
    clearMarked();
    setSelectedLink(null);
    if (connectSource) {
      const from = connectSource;
      setConnectSource(null);
      connectEnds(from, { kind: 'skill', id: node.id });
      return;
    }
    onSelect({ type: 'skill', nodeId: node.id });
  };

  // ----- the coordinator's open question -----
  const openQuestion = caseItem?.status === 'waiting_user' && caseItem.waitingReason === 'question'
    ? [...messages].reverse().find((message) => message.kind === 'question') ?? null
    : null;

  const sendAnswer = async () => {
    const text = answer.trim();
    if (!text || !onAnswerQuestion || isAnswering) {
      return;
    }
    setIsAnswering(true);
    setCanvasError(null);
    try {
      await onAnswerQuestion(text);
      setAnswer('');
    } catch (error) {
      report(error);
    } finally {
      setIsAnswering(false);
    }
  };

  // ----- menus -----
  const caseIsOpen = Boolean(caseItem && caseItem.status !== 'done' && caseItem.status !== 'failed');

  const divisionMenuItems = (division: OfficeDivision) => {
    const open = (focus: OfficeAgentSection) => () => onSelect({ type: 'division', divisionId: division.id, focus });
    const isWorker = !division.isCoordinator && !division.isAudit;
    return [
      { key: 'agent', label: t('menu.openAgent'), icon: Bot, onSelect: open('agent') },
      { key: 'model', label: t('menu.model'), icon: Cpu, onSelect: open('model') },
      { key: 'role', label: t('menu.role'), icon: FileText, onSelect: open('role') },
      { key: 'tools', label: t('menu.tools'), icon: Wrench, onSelect: open('tools') },
      ...(isWorker && onQuickTask ? [{
        key: 'quick', label: t('menu.quickTask'), icon: Zap, onSelect: () => onQuickTask(division), showDividerBefore: true,
      }] : []),
      ...(division.isCoordinator && caseIsOpen && onMessageCoordinator ? [{
        key: 'message', label: t('menu.messageCoordinator'), icon: Send, onSelect: onMessageCoordinator, showDividerBefore: true,
      }] : []),
      {
        key: 'connect', label: isWorker ? t('menu.connectTo') : t('menu.connectSkill'), icon: Link2,
        onSelect: () => setConnectSource({ kind: 'division', id: division.id }), showDividerBefore: true,
      },
      ...(isWorker ? [
        { key: 'messages', label: t('menu.messages'), icon: MessageSquare, onSelect: () => onSelect({ type: 'messages', divisionId: division.id }) },
      ] : []),
      ...(!division.isCoordinator ? [{
        key: 'enabled',
        label: division.agent.enabled ? t('menu.disable') : t('menu.enable'),
        icon: Power,
        onSelect: () => { actions.updateAgent(division.agent.id, { enabled: !division.agent.enabled }).catch(report); },
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
    if (target.kind === 'skill') {
      const node = skillNodes.find((candidate) => candidate.id === target.nodeId);
      if (!node) return [];
      return [
        { key: 'open', label: t('menu.viewSkill'), icon: Sparkles, onSelect: () => onSelect({ type: 'skill', nodeId: node.id }) },
        { key: 'connect', label: t('menu.connectAgent'), icon: Link2, onSelect: () => setConnectSource({ kind: 'skill', id: node.id }) },
        { key: 'copy', label: t('menu.copySkill'), icon: Copy, onSelect: () => onCopySkill?.(node.skillName) },
        ...(node.position ? [{
          key: 'reset', label: t('menu.resetPosition'), icon: RotateCcw,
          onSelect: () => { actions.moveSkillNode(node.id, null).catch(report); },
        }] : []),
        {
          key: 'delete', label: t('menu.deleteSkill'), icon: Trash2, isDanger: true, showDividerBefore: true,
          onSelect: () => { actions.deleteSkillNode(node.id).catch(report); },
        },
      ];
    }
    if (target.kind === 'marked') {
      const markedSkills = [...marked].filter((key) => key.startsWith('skill:')).length;
      return [
        {
          key: 'reset', label: t('menu.resetMarked', { count: marked.size }), icon: RotateCcw,
          onSelect: () => {
            Promise.all([...marked].map((key) => (key.startsWith('skill:')
              ? actions.moveSkillNode(key.slice('skill:'.length), null)
              : actions.updateDivision(key, { position: null })))).catch(report);
          },
        },
        { key: 'clear', label: t('menu.clearMarked'), icon: X, onSelect: clearMarked },
        ...(markedSkills > 0 ? [{
          key: 'delete', label: t('menu.deleteMarkedSkills', { count: markedSkills }), icon: Trash2, isDanger: true, showDividerBefore: true,
          onSelect: deleteMarkedSkills,
        }] : []),
      ];
    }
    if (target.kind === 'skillLink') {
      return [{
        key: 'unlink', label: t('menu.unlinkSkill'), icon: Unlink, isDanger: true,
        onSelect: () => { actions.unlinkSkill(target.nodeId, target.divisionId).catch(report); },
      }];
    }
    return [
      { key: 'add', label: t('menu.addAgentHere'), icon: Plus, onSelect: () => onAddDivisionAt(target.at) },
      ...(onAddSkillAt ? [{ key: 'skill', label: t('menu.addSkillHere'), icon: Sparkles, onSelect: () => onAddSkillAt(target.at) }] : []),
      ...(skillClipboard ? [{
        key: 'paste', label: t('menu.pasteSkill', { name: skillClipboard }), icon: ClipboardPaste, onSelect: () => pasteSkill(target.at),
      }] : []),
      ...(caseIsOpen && onMessageCoordinator ? [{
        key: 'message', label: t('menu.messageCoordinator'), icon: Send, onSelect: onMessageCoordinator, showDividerBefore: true,
      }] : []),
      {
        key: 'layout', label: t('menu.autoLayout'), icon: LayoutGrid, showDividerBefore: true,
        onSelect: () => {
          Promise.all([
            ...divisions.filter((division) => division.position).map((division) => actions.updateDivision(division.id, { position: null })),
            ...skillNodes.filter((node) => node.position).map((node) => actions.moveSkillNode(node.id, null)),
          ]).catch(report);
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
        data-marked={marked.has(division.id) ? 'true' : undefined}
        aria-pressed={selected}
        aria-label={`${division.name} · ${agent.name} · ${statusLabel}`}
        onClick={(event) => handleNodeClick(division, event.shiftKey)}
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
        onContextMenu={(event) => openMenu(event, marked.size > 1 && marked.has(division.id) ? { kind: 'marked' } : { kind: 'division', divisionId: division.id })}
        className={cn(
          'office-node-enter glass-surface group absolute z-10 flex cursor-pointer flex-col gap-1 rounded-[12px] border px-2.5 py-2 text-left transition-colors hover:bg-card/80',
          FOCUS_OUTLINE,
          status === 'running' && 'office-node-running',
          selected && SELECTED_OUTLINE,
          !agent.enabled && 'opacity-60',
          dragging && 'cursor-grabbing shadow-lg',
          connectSource && !(connectSource.kind === 'division' && connectSource.id === division.id)
            && (isWorker || connectSource.kind === 'skill') && 'outline-dashed outline-1 outline-primary/60',
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
        {marked.has(division.id) && <MarkedFrame />}
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
              hasModel ? 'border-border text-muted-foreground' : 'border-amber-400/60 text-amber-700 dark:text-amber-300',
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
        <span
          data-connect-from={division.id}
          data-connect-kind="division"
          role="presentation"
          title={isWorker ? t('tree.dragToConnect') : t('tree.dragToSkill')}
          className={cn(
            'absolute -bottom-2 left-1/2 flex h-4 w-4 -translate-x-1/2 cursor-crosshair items-center justify-center rounded-full border-2 border-primary bg-background opacity-0 transition-opacity group-hover:opacity-100',
            (selected || (connectingTo?.from.kind === 'division' && connectingTo.from.id === division.id)) && 'opacity-100',
          )}
        >
          <span className="h-1 w-1 rounded-full bg-primary" />
        </span>
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
          if ((event.target as Element).closest('[data-division-id], path[data-hit], [data-skill-node-id], [data-canvas-control]')) {
            return;
          }
          openMenu(event, { kind: 'canvas', at: toCanvasPoint(event.clientX, event.clientY) });
        }}
        className={cn(
          'office-canvas absolute inset-0 touch-none select-none focus-visible:outline-none',
          isPanning ? 'cursor-grabbing' : 'cursor-grab',
          connectSource && 'cursor-crosshair',
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
                <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--muted-foreground))" />
              </marker>
            </defs>

            {/* case → coordinator */}
            {coordinator && (
              <line
                x1={casePoint.x + CASE_WIDTH / 2}
                y1={casePoint.y + CASE_HEIGHT}
                x2={coordinatorPoint.x + NODE_WIDTH / 2}
                y2={coordinatorPoint.y}
                stroke={caseItem?.coordinatorBusy ? 'hsl(var(--primary))' : 'hsl(var(--border))'}
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
                    stroke={active || selected ? 'hsl(var(--primary))' : 'hsl(var(--border))'}
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
              if (reconnecting && reconnecting.fromDivisionId === from.id && reconnecting.toDivisionId === to.id) {
                return null;
              }
              const path = connectorPath(positionOf(from), nodeSize, positionOf(to), nodeSize);
              const ends = connectorEnds(positionOf(from), nodeSize, positionOf(to), nodeSize);
              return (
                <g key={`flow-${from.id}-${to.id}`}>
                  <path
                    d={path}
                    fill="none"
                    stroke={active || selected ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.7)'}
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
                    onClick={() => { setSelectedLink(null); onSelect({ type: 'edge', fromDivisionId: from.id, toDivisionId: to.id }); }}
                    onContextMenu={(event) => openMenu(event, { kind: 'flow', fromDivisionId: from.id, toDivisionId: to.id })}
                  />
                  {selected && (['from', 'to'] as const).map((end) => {
                    const at = end === 'from' ? ends.start : ends.end;
                    return (
                      <circle
                        key={end}
                        cx={at.x}
                        cy={at.y}
                        r={6 / view.zoom + 2}
                        data-edge-end={end}
                        data-edge-from={from.id}
                        data-edge-to={to.id}
                        data-testid={`office-flow-end-${end}-${from.slug}-${to.slug}`}
                        fill="hsl(var(--background))"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        style={{ pointerEvents: 'all', cursor: 'move' }}
                      >
                        <title>{t('tree.dragArrowEnd')}</title>
                      </circle>
                    );
                  })}
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
                  stroke="hsl(var(--navy))"
                  strokeWidth={1.25}
                  strokeDasharray="4 4"
                  className="office-edge-flow"
                />
              );
            })}

            {/* the arrow being drawn */}
            {/* skill links: an agent linked to a skill node has that skill */}
            {skillNodes.flatMap((node) => node.divisionIds.map((divisionId) => {
              const division = divisions.find((candidate) => candidate.id === divisionId);
              if (!division) return null;
              const path = connectorPath(positionOf(division), nodeSize, skillPositionOf(node), { width: SKILL_WIDTH, height: SKILL_HEIGHT });
              const selected = (selection.type === 'skill' && selection.nodeId === node.id)
                || (selectedLink?.nodeId === node.id && selectedLink.divisionId === divisionId);
              return (
                <g key={`skill-link-${node.id}-${divisionId}`}>
                  <path
                    d={path}
                    fill="none"
                    stroke="rgb(139 92 246 / 0.7)"
                    strokeWidth={selected ? 2.5 : 1.25}
                    strokeDasharray="3 4"
                    data-testid={`office-skill-link-${node.skillName}-${division.slug}`}
                  />
                  <path
                    d={path}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={12}
                    data-hit
                    style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                    onClick={() => { setSelectedLink({ nodeId: node.id, divisionId }); onSelect({ type: 'skill', nodeId: node.id }); }}
                    onContextMenu={(event) => openMenu(event, { kind: 'skillLink', nodeId: node.id, divisionId })}
                  />
                </g>
              );
            }))}

            {/* an arrow end being dragged to another team */}
            {reconnecting && (() => {
              const from = divisions.find((division) => division.id === reconnecting.fromDivisionId);
              const to = divisions.find((division) => division.id === reconnecting.toDivisionId);
              if (!from || !to) return null;
              const ends = connectorEnds(positionOf(from), nodeSize, positionOf(to), nodeSize);
              const start = reconnecting.end === 'from' ? reconnecting.point : ends.start;
              const end = reconnecting.end === 'to' ? reconnecting.point : ends.end;
              return (
                <line
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  markerEnd={`url(#office-arrow-${officeId})`}
                  data-testid="office-reconnect-line"
                />
              );
            })()}

            {/* the line being drawn */}
            {connectingTo && (() => {
              let start: CanvasPoint | null = null;
              if (connectingTo.from.kind === 'division') {
                const from = divisions.find((division) => division.id === connectingTo.from.id);
                start = from ? { x: positionOf(from).x + NODE_WIDTH / 2, y: positionOf(from).y + NODE_HEIGHT } : null;
              } else {
                const from = skillNodes.find((node) => node.id === connectingTo.from.id);
                start = from ? { x: skillPositionOf(from).x + SKILL_WIDTH / 2, y: skillPositionOf(from).y } : null;
              }
              if (!start) return null;
              return (
                <line
                  x1={start.x}
                  y1={start.y}
                  x2={connectingTo.point.x}
                  y2={connectingTo.point.y}
                  stroke="hsl(var(--primary))"
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

          {/* skill nodes */}
          {skillNodes.map((node) => {
            const point = skillPositionOf(node);
            const installed = installedSkills.find((skill) => skill.name === node.skillName);
            const selected = selection.type === 'skill' && selection.nodeId === node.id;
            return (
              <div
                key={node.id}
                role="button"
                tabIndex={0}
                data-skill-node-id={node.id}
                data-testid={`office-skill-node-${node.skillName}`}
                data-marked={marked.has(skillKey(node.id)) ? 'true' : undefined}
                aria-pressed={selected}
                aria-label={t('tree.skillNode', { name: node.skillName, count: node.divisionIds.length })}
                onClick={(event) => handleSkillClick(node, event.shiftKey)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleSkillClick(node);
                  }
                }}
                onContextMenu={(event) => openMenu(event, marked.size > 1 && marked.has(skillKey(node.id)) ? { kind: 'marked' } : { kind: 'skill', nodeId: node.id })}
                title={installed?.description || undefined}
                className={cn(
                  'office-node-enter glass-surface group absolute z-10 flex cursor-pointer flex-col justify-center gap-0.5 rounded-[12px] border border-violet-400/50 px-2.5 text-left hover:bg-card/80',
                  FOCUS_OUTLINE,
                  selected && SELECTED_OUTLINE,
                  draggingId === `skill:${node.id}` && 'cursor-grabbing shadow-lg',
                  connectSource?.kind === 'division' && 'outline-dashed outline-1 outline-violet-500/60',
                )}
                style={{ left: point.x, top: point.y, width: SKILL_WIDTH, height: SKILL_HEIGHT, ...(selected ? selectedOutlineStyle : {}) }}
              >
                {marked.has(skillKey(node.id)) && <MarkedFrame />}
                <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] font-semibold text-foreground">
                  <Sparkles className="h-3.5 w-3.5 shrink-0 text-violet-500" />
                  <span className="truncate">{node.skillName}</span>
                </span>
                <span className={cn('truncate text-[10.5px]', installed || installedSkills.length === 0 ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-300')}>
                  {installed || installedSkills.length === 0 ? t('tree.skillAgents', { count: node.divisionIds.length }) : t('tree.skillMissing')}
                </span>
                <span
                  data-connect-from={node.id}
                  data-connect-kind="skill"
                  role="presentation"
                  title={t('tree.dragSkillToAgent')}
                  className={cn(
                    'absolute -top-2 left-1/2 flex h-4 w-4 -translate-x-1/2 cursor-crosshair items-center justify-center rounded-full border-2 border-violet-500 bg-background opacity-0 transition-opacity group-hover:opacity-100',
                    selected && 'opacity-100',
                  )}
                >
                  <span className="h-1 w-1 rounded-full bg-violet-500" />
                </span>
              </div>
            );
          })}

          {marquee && (
            <div
              aria-hidden
              data-testid="office-marquee"
              className="pointer-events-none absolute z-30 rounded-[4px] border border-primary bg-primary/10"
              style={{
                left: Math.min(marquee.from.x, marquee.to.x),
                top: Math.min(marquee.from.y, marquee.to.y),
                width: Math.abs(marquee.to.x - marquee.from.x),
                height: Math.abs(marquee.to.y - marquee.from.y),
                borderWidth: 1 / view.zoom,
              }}
            />
          )}
        </div>
      </div>

      {openQuestion && coordinator && isQuestionFolded && (
        <button
          type="button"
          data-canvas-control
          data-testid="office-question-chip"
          onClick={() => setIsQuestionFolded(false)}
          className="absolute z-20 flex items-center gap-1.5 rounded-full border-2 border-amber-400/70 bg-background px-2.5 py-1 text-[11px] font-medium text-amber-700 shadow-sm dark:text-amber-300"
          style={{
            left: Math.max(12, view.x + (coordinatorPoint.x + NODE_WIDTH + 12) * view.zoom),
            top: Math.max(12, view.y + coordinatorPoint.y * view.zoom),
          }}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          {t('question.chip')}
        </button>
      )}
      {openQuestion && coordinator && !isQuestionFolded && (
        <div
          data-canvas-control
          data-testid="office-question-bubble"
          role="group"
          aria-label={t('question.label')}
          className="glass-surface-strong absolute z-20 w-[min(320px,calc(100%-24px))] rounded-[14px] border-2 border-amber-400/70 p-3 shadow-lg"
          style={{
            left: Math.min(
              Math.max(12, view.x + (coordinatorPoint.x + NODE_WIDTH + 18) * view.zoom),
              Math.max(12, (canvasRef.current?.clientWidth ?? 800) - 332),
            ),
            top: Math.max(12, view.y + coordinatorPoint.y * view.zoom - 8),
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <span className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            <MessageSquare className="h-3.5 w-3.5" />
            <span className="flex-1">{t('question.title', { name: coordinator.agent.name })}</span>
            <button
              type="button"
              onClick={() => setIsQuestionFolded(true)}
              className="rounded-md p-0.5 text-muted-foreground hover:text-foreground"
              aria-label={t('question.fold')}
              title={t('question.fold')}
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
          </span>
          <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-[13px] leading-snug text-foreground">{String(openQuestion.payload.text ?? '')}</p>
          {onAnswerQuestion && (
            <form
              className="mt-2 flex items-end gap-1.5"
              onSubmit={(event) => {
                event.preventDefault();
                void sendAnswer();
              }}
            >
              <textarea
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                    event.preventDefault();
                    void sendAnswer();
                  }
                }}
                rows={2}
                placeholder={t('question.placeholder')}
                aria-label={t('question.placeholder')}
                className="min-h-10 flex-1 resize-y rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                type="submit"
                disabled={!answer.trim() || isAnswering}
                aria-label={t('question.send')}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </form>
          )}
        </div>
      )}

      {connectSource && (
        <div className="glass-surface-strong absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border px-3 py-1.5 text-xs text-foreground" role="status">
          {connectSource.kind === 'skill'
            ? t('tree.connectSkillHint', { name: skillNodes.find((node) => node.id === connectSource.id)?.skillName ?? '' })
            : t('tree.connectHint', { name: divisions.find((division) => division.id === connectSource.id)?.name ?? '' })}
          <button type="button" className="text-primary hover:underline" onClick={() => setConnectSource(null)}>{t('common.cancel')}</button>
        </div>
      )}
      {canvasError && (
        <div className="absolute left-3 top-3 z-30 flex max-w-sm items-start gap-2 rounded-[10px] border border-red-500/30 bg-background/95 px-3 py-2 text-xs text-red-700 shadow-sm dark:text-red-300" role="alert">
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
