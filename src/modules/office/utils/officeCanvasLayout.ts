import type { OfficeDivision, OfficeFlowEdge } from '@/shared/types';

/** Size of every agent node on the canvas, in canvas pixels. */
export const NODE_WIDTH = 176;
export const NODE_HEIGHT = 96;
/** A skill node: smaller than an agent node. */
export const SKILL_WIDTH = 152;
export const SKILL_HEIGHT = 52;
const SKILL_GAP = 16;

/** The case card that sits above the coordinator. */
export const CASE_WIDTH = 248;
export const CASE_HEIGHT = 58;

const COLUMN_GAP = 28;
const ROW_GAP = 64;
const COORDINATOR_Y = 110;
const CASE_GAP = 44;

/** Top-left corner of a node on the canvas. */
export type CanvasPoint = { x: number; y: number };

/** Where the automatic layout puts every node that the user has not dragged. */
export type CanvasLayout = {
  divisions: Map<string, CanvasPoint>;
  skills: CanvasPoint;
};

/**
 * Row of each worker division in the automatic layout: the longest chain of
 * flow arrows leading to it. Divisions outside the flow sit on the first row
 * next to the flow's starting points.
 */
export function flowRows(workers: OfficeDivision[], flow: Pick<OfficeFlowEdge, 'fromDivisionId' | 'toDivisionId'>[]): Map<string, number> {
  const ids = new Set(workers.map((division) => division.id));
  const incoming = new Map<string, string[]>();
  for (const edge of flow) {
    if (ids.has(edge.fromDivisionId) && ids.has(edge.toDivisionId)) {
      incoming.set(edge.toDivisionId, [...(incoming.get(edge.toDivisionId) ?? []), edge.fromDivisionId]);
    }
  }
  const rows = new Map<string, number>();
  const visiting = new Set<string>();
  const rowOf = (id: string): number => {
    const known = rows.get(id);
    if (known !== undefined) {
      return known;
    }
    // The server keeps the flow free of loops; this guard only protects against a stale frame.
    if (visiting.has(id)) {
      return 0;
    }
    visiting.add(id);
    const row = Math.max(-1, ...(incoming.get(id) ?? []).map(rowOf)) + 1;
    visiting.delete(id);
    rows.set(id, row);
    return row;
  };
  workers.forEach((division) => rowOf(division.id));
  return rows;
}

/**
 * The automatic layout: coordinator on top, worker divisions in rows that
 * follow the flow (a division sits below every division it waits for), and
 * the audit and skills layer underneath.
 */
export function computeAutoLayout(divisions: OfficeDivision[], flow: Pick<OfficeFlowEdge, 'fromDivisionId' | 'toDivisionId'>[]): CanvasLayout {
  const coordinator = divisions.find((division) => division.isCoordinator) ?? null;
  const audit = divisions.find((division) => division.isAudit) ?? null;
  const workers = divisions.filter((division) => !division.isCoordinator && !division.isAudit);
  const rows = flowRows(workers, flow);

  const byRow = new Map<number, OfficeDivision[]>();
  for (const division of workers) {
    const row = rows.get(division.id) ?? 0;
    byRow.set(row, [...(byRow.get(row) ?? []), division]);
  }
  const rowCount = Math.max(1, byRow.size === 0 ? 1 : Math.max(...byRow.keys()) + 1);
  const widest = Math.max(2, ...[...byRow.values()].map((row) => row.length));
  const centerX = (widest * NODE_WIDTH + (widest - 1) * COLUMN_GAP) / 2;

  const positions = new Map<string, CanvasPoint>();
  if (coordinator) {
    positions.set(coordinator.id, { x: centerX - NODE_WIDTH / 2, y: COORDINATOR_Y });
  }
  const firstRowY = COORDINATOR_Y + NODE_HEIGHT + ROW_GAP;
  for (const [row, members] of byRow) {
    const rowWidth = members.length * NODE_WIDTH + (members.length - 1) * COLUMN_GAP;
    members.forEach((division, index) => {
      positions.set(division.id, {
        x: centerX - rowWidth / 2 + index * (NODE_WIDTH + COLUMN_GAP),
        y: firstRowY + row * (NODE_HEIGHT + ROW_GAP),
      });
    });
  }
  const layerY = firstRowY + rowCount * (NODE_HEIGHT + ROW_GAP) + 12;
  if (audit) {
    positions.set(audit.id, { x: centerX + COLUMN_GAP / 2, y: layerY });
  }
  return { divisions: positions, skills: { x: centerX - COLUMN_GAP / 2 - NODE_WIDTH, y: layerY } };
}

/** Where the case card goes: centred above the coordinator, wherever the coordinator was dragged. */
export function casePosition(coordinator: CanvasPoint): CanvasPoint {
  return { x: coordinator.x + NODE_WIDTH / 2 - CASE_WIDTH / 2, y: coordinator.y - CASE_HEIGHT - CASE_GAP };
}

/** A smooth connector from the bottom of one box to the top of another (or sideways when they share a row). */
export function connectorPath(from: CanvasPoint, fromSize: { width: number; height: number }, to: CanvasPoint, toSize: { width: number; height: number }): string {
  const startX = from.x + fromSize.width / 2;
  const endX = to.x + toSize.width / 2;
  const goesDown = to.y >= from.y + fromSize.height - 8;
  if (goesDown) {
    const startY = from.y + fromSize.height;
    const endY = to.y;
    const bend = Math.max(24, (endY - startY) / 2);
    return `M ${startX} ${startY} C ${startX} ${startY + bend}, ${endX} ${endY - bend}, ${endX} ${endY}`;
  }
  // Side by side or upwards: leave from the side facing the target and loop into its top.
  const leavesRight = endX >= startX;
  const sx = leavesRight ? from.x + fromSize.width : from.x;
  const sy = from.y + fromSize.height / 2;
  const endY = to.y;
  const reach = Math.max(40, Math.abs(endX - sx) / 2);
  return `M ${sx} ${sy} C ${sx + (leavesRight ? reach : -reach)} ${sy}, ${endX} ${endY - 60}, ${endX} ${endY}`;
}

/** Compact token count for node chips: 950, 12.3k, 1.2M. */
export function formatTokens(value: number): string {
  if (value < 1000) {
    return String(Math.round(value));
  }
  if (value < 1_000_000) {
    return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`;
  }
  return `${(value / 1_000_000).toFixed(1)}M`;
}

/**
 * Where skill nodes the user has not dragged go: one row under the audit
 * layer, starting at the layout's skills anchor, in the order they were added.
 */
export function autoSkillPositions(anchor: CanvasPoint, nodeIds: string[]): Map<string, CanvasPoint> {
  return new Map(nodeIds.map((id, index) => [id, { x: anchor.x + index * (SKILL_WIDTH + SKILL_GAP), y: anchor.y + NODE_HEIGHT + 36 }]));
}
