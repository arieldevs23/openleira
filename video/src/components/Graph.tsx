import { Trail } from '@remotion/motion-blur';
import { Easing, interpolate, useCurrentFrame } from 'remotion';

import { beatPulse } from '../beats';
import { C, EASE_IN_OUT, EASE_OUT, FONT } from '../theme';

export type NodeState = 'idle' | 'running' | 'done';

export const NODE_W = 300;
export const NODE_H = 118;

export type GraphNode = { id: string; team: string; agent: string; model: string; x: number; y: number };

/** The default workspace flow, laid out on the right of the frame (canvas coordinates = frame pixels). */
export const NODES: GraphNode[] = [
  { id: 'orch', team: 'Orchestrator', agent: 'Sekar', model: 'opus', x: 1290, y: 110 },
  { id: 'planner', team: 'Planner', agent: 'Bima', model: 'opus', x: 1290, y: 292 },
  { id: 'designer', team: 'Designer', agent: 'Laras', model: 'sonnet', x: 1030, y: 474 },
  { id: 'backend', team: 'Backend', agent: 'Arya', model: 'sonnet', x: 1550, y: 474 },
  { id: 'frontend', team: 'Frontend', agent: 'Nadia', model: 'sonnet', x: 1030, y: 656 },
  { id: 'security', team: 'Security', agent: 'Galih', model: 'sonnet', x: 1550, y: 656 },
  { id: 'audit', team: 'QA / Audit', agent: 'Wira', model: 'sonnet', x: 1290, y: 838 },
];

export const EDGES: Array<[string, string]> = [
  ['orch', 'planner'],
  ['planner', 'designer'],
  ['planner', 'backend'],
  ['designer', 'frontend'],
  ['backend', 'security'],
  ['frontend', 'audit'],
  ['security', 'audit'],
];

export const nodeById = new Map(NODES.map((node) => [node.id, node]));

/** The curve of an arrow from the bottom of one node to the top of another. */
export const edgePath = (from: GraphNode, to: GraphNode): string => {
  const x1 = from.x;
  const y1 = from.y + NODE_H;
  const x2 = to.x;
  const y2 = to.y - 10;
  const mid = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`;
};

/** A point along the same cubic curve, for work tokens travelling on it. */
export const edgePoint = (from: GraphNode, to: GraphNode, t: number): { x: number; y: number } => {
  const x1 = from.x;
  const y1 = from.y + NODE_H;
  const x2 = to.x;
  const y2 = to.y - 10;
  const mid = (y1 + y2) / 2;
  const u = 1 - t;
  return {
    x: u * u * u * x1 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x2,
    y: u * u * u * y1 + 3 * u * u * t * mid + 3 * u * t * t * mid + t * t * t * y2,
  };
};

type NodeCardProps = {
  node: GraphNode;
  /** Local frame the card pops in on (a beat). */
  appearAt: number;
  state: NodeState;
  /** Global frame of the scene start, for the beat pulse. */
  start: number;
};

/** One team on the canvas: pops in with a soft overshoot-free spring, glows while it works. */
export function NodeCard({ node, appearAt, state, start }: NodeCardProps) {
  const frame = useCurrentFrame();
  const running = state === 'running';
  const pulse = running ? beatPulse(frame + start, 7) : 0;
  const breathing = running ? 0.5 + 0.5 * Math.sin(frame / 5) : 0;
  const border = running ? C.accent : state === 'done' ? `${C.ok}aa` : C.borderStrong;
  return (
    <div
      style={{
        position: 'absolute',
        left: node.x - NODE_W / 2,
        top: node.y,
        width: NODE_W,
        height: NODE_H,
        boxSizing: 'border-box',
        padding: '18px 22px',
        borderRadius: 12,
        backgroundColor: C.surface,
        border: `2px solid ${border}`,
        boxShadow: running
          ? `0 0 ${24 + breathing * 18 + pulse * 30}px ${C.accent}${Math.round(30 + pulse * 60).toString(16).padStart(2, '0')}, 0 20px 50px #000000aa`
          : '0 20px 50px #000000aa',
        fontFamily: FONT.ui,
        opacity: interpolate(frame, [appearAt, appearAt + 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        scale: interpolate(frame, [appearAt, appearAt + 16], [0.72, 1 + pulse * 0.025], {
          easing: Easing.spring({ damping: 200 }),
          output: 'perceptual-scale',
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        }),
        translate: interpolate(frame, [appearAt, appearAt + 16], ['0px 26px', '0px 0px'], {
          easing: EASE_OUT,
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        }),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 34, fontWeight: 600, color: C.text }}>{node.team}</span>
        <StateMark state={state} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
        <span style={{ fontSize: 24, color: C.muted }}>{node.agent}</span>
        <span style={{ fontSize: 18, color: C.textDim, border: `1px solid ${C.border}`, backgroundColor: C.surface2, borderRadius: 5, padding: '1px 9px' }}>{node.model}</span>
      </div>
    </div>
  );
}

/** Status by shape (DESIGN.md §2): hollow = idle, ring = running, filled = done. */
function StateMark({ state }: { state: NodeState }) {
  const frame = useCurrentFrame();
  if (state === 'done') {
    return <span style={{ width: 20, height: 20, borderRadius: '50%', backgroundColor: C.ok }} />;
  }
  if (state === 'running') {
    const wave = (frame % 24) / 24;
    return (
      <span style={{ position: 'relative', width: 20, height: 20 }}>
        <span style={{ position: 'absolute', inset: -12 * wave, borderRadius: '50%', border: `2px solid ${C.accent}`, opacity: 1 - wave }} />
        <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `3px solid ${C.accent}` }} />
      </span>
    );
  }
  return <span style={{ width: 20, height: 20, borderRadius: '50%', border: `3px solid ${C.borderStrong}` }} />;
}

type EdgeLineProps = {
  from: GraphNode;
  to: GraphNode;
  /** Local frames over which the line draws itself. */
  drawFrom: number;
  drawTo: number;
  active: boolean;
};

/** A flow arrow that draws itself in, and shows moving dashes while work flows along it. */
export function EdgeLine({ from, to, drawFrom, drawTo, active }: EdgeLineProps) {
  const frame = useCurrentFrame();
  const d = edgePath(from, to);
  const draw = interpolate(frame, [drawFrom, drawTo], [0, 1], { easing: EASE_IN_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <g>
      <path d={d} fill="none" stroke={active ? C.accent : C.borderStrong} strokeWidth={active ? 3 : 2.5} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - draw} />
      {active && <path d={d} fill="none" stroke={C.text} strokeWidth={3} strokeDasharray="12 18" strokeDashoffset={-frame * 2.2} opacity={0.55} />}
      <path
        d={`M ${to.x - 9} ${to.y - 22} L ${to.x} ${to.y - 8} L ${to.x + 9} ${to.y - 22} Z`}
        fill={active ? C.accent : C.borderStrong}
        opacity={interpolate(draw, [0.85, 1], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
      />
    </g>
  );
}

type TokenProps = { from: GraphNode; to: GraphNode; leaveAt: number; arriveAt: number };

/** A glowing spark carrying work along one arrow, with a light trail behind it. */
export function Token({ from, to, leaveAt, arriveAt }: TokenProps) {
  return (
    <Trail layers={6} lagInFrames={0.6} trailOpacity={0.55}>
      <TokenDot from={from} to={to} leaveAt={leaveAt} arriveAt={arriveAt} />
    </Trail>
  );
}

function TokenDot({ from, to, leaveAt, arriveAt }: TokenProps) {
  const frame = useCurrentFrame();
  if (frame < leaveAt || frame > arriveAt + 4) {
    return null;
  }
  const t = interpolate(frame, [leaveAt, arriveAt], [0, 1], { easing: EASE_IN_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const point = edgePoint(from, to, t);
  return (
    <div
      style={{
        position: 'absolute',
        left: point.x - 9,
        top: point.y - 9,
        width: 18,
        height: 18,
        borderRadius: '50%',
        backgroundColor: C.text,
        boxShadow: `0 0 18px 6px ${C.accent}aa, 0 0 50px 16px ${C.accent}44`,
        opacity: interpolate(frame, [arriveAt, arriveAt + 4], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
      }}
    />
  );
}
