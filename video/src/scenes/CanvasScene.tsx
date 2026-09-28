import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

import { DotGrid, Reveal, StatusMark, statusLabel, type Status } from '../parts';
import { C, EASE, FONT } from '../theme';

/** Length of this scene in frames. */
export const CANVAS_DURATION = 690;

const NODE_W = 250;
const NODE_H = 96;

type NodeSpec = {
  id: string;
  team: string;
  agent: string;
  model: string;
  x: number;
  y: number;
  /** [frame, status] changes, in order. */
  timeline: Array<[number, Status]>;
};

const NODES: NodeSpec[] = [
  { id: 'coord', team: 'Orchestrator', agent: 'Sekar', model: 'opus', x: 1010, y: 70, timeline: [[282, 'running'], [330, 'done'], [560, 'running'], [596, 'done']] },
  { id: 'planner', team: 'Planner', agent: 'Bima', model: 'opus', x: 1010, y: 220, timeline: [[330, 'running'], [384, 'done']] },
  { id: 'designer', team: 'Designer UI/UX', agent: 'Laras', model: 'sonnet', x: 640, y: 380, timeline: [[384, 'running'], [440, 'done']] },
  { id: 'backend', team: 'Backend', agent: 'Arya', model: 'sonnet', x: 1010, y: 380, timeline: [[384, 'running'], [462, 'done']] },
  { id: 'docs', team: 'Docs', agent: 'Tari', model: 'haiku', x: 1380, y: 380, timeline: [[384, 'running'], [424, 'done']] },
  { id: 'frontend', team: 'Frontend', agent: 'Nadia', model: 'sonnet', x: 640, y: 540, timeline: [[440, 'running'], [508, 'done']] },
  { id: 'security', team: 'Security', agent: 'Galih', model: 'sonnet', x: 1010, y: 540, timeline: [[462, 'running'], [516, 'done']] },
  { id: 'audit', team: 'QA / Audit', agent: 'Wira', model: 'sonnet', x: 1380, y: 540, timeline: [[424, 'running'], [540, 'done']] },
];

const EDGES: Array<[string, string]> = [
  ['coord', 'planner'],
  ['planner', 'designer'],
  ['planner', 'backend'],
  ['planner', 'docs'],
  ['designer', 'frontend'],
  ['backend', 'security'],
];

const byId = new Map(NODES.map((node) => [node.id, node]));

const statusAt = (node: NodeSpec, frame: number): Status => {
  let status: Status = 'idle';
  for (const [at, next] of node.timeline) {
    if (frame >= at) {
      status = next;
    }
  }
  return status;
};

const LIST = 'For the shoe shop:\n- product page\n- checkout flow\n- confirmation email';
const TYPE_START = 168;
const SEND_AT = 262;

type WorkItem = { title: string; timeline: Array<[number, Status]>; result?: string; resultAt?: number };

const ITEMS: WorkItem[] = [
  { title: 'product page', timeline: [[SEND_AT + 6, 'running'], [596, 'done']], result: 'Product page with gallery, sizes and stock. Audited.', resultAt: 600 },
  { title: 'checkout flow', timeline: [[SEND_AT + 12, 'queued'], [612, 'running']] },
  { title: 'confirmation email', timeline: [[SEND_AT + 18, 'queued']] },
];

const itemStatus = (item: WorkItem, frame: number): Status | null => {
  let status: Status | null = null;
  for (const [at, next] of item.timeline) {
    if (frame >= at) {
      status = next;
    }
  }
  return status;
};

const CAPTIONS: Array<{ from: number; to: number; title: string; body: string }> = [
  { from: 14, to: 158, title: 'Draw your team like a diagram.', body: 'Each node is an agent with its own role, model and skills. Arrows are the flow.' },
  { from: 166, to: 322, title: 'Hand out work any time.', body: 'A prompt or a whole list — to the orchestrator, or straight to one agent.' },
  { from: 330, to: 448, title: 'One team, one task at a time.', body: 'Every agent knows what else is running, so parallel work stays out of each other’s files.' },
  { from: 456, to: 572, title: 'Every result is audited.', body: 'Nothing counts as done until QA passes it. Failures are retried.' },
  { from: 580, to: CANVAS_DURATION, title: 'Lists run one after another.', body: 'The next item starts by itself when the one before it is finished.' },
];

function Node({ node, frame, index }: { node: NodeSpec; frame: number; index: number }) {
  const appear = interpolate(frame, [index * 6, index * 6 + 20], [0, 1], { easing: EASE, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const status = statusAt(node, frame);
  const running = status === 'running';
  const glow = running ? 0.35 + ((Math.sin(frame / 6) + 1) / 2) * 0.4 : 0;
  const borderColor = running ? C.accent : status === 'done' ? `${C.ok}99` : C.border;
  return (
    <div
      style={{
        position: 'absolute',
        left: node.x - NODE_W / 2,
        top: node.y,
        width: NODE_W,
        height: NODE_H,
        opacity: appear,
        transform: `scale(${0.96 + appear * 0.04})`,
        background: C.surface,
        border: `1.5px solid ${borderColor}`,
        borderRadius: 10,
        boxShadow: running ? `0 0 0 ${4 + glow * 6}px ${C.accent}${Math.round(glow * 40).toString(16).padStart(2, '0')}` : '0 12px 30px #00000066',
        padding: '14px 16px',
        boxSizing: 'border-box',
        fontFamily: FONT.ui,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 21, fontWeight: 600, color: C.text }}>
        {node.team}
      </div>
      <div style={{ fontSize: 16, color: C.muted, marginTop: 2 }}>{node.agent}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
        <span style={{ fontSize: 13, color: C.textDim, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 4, padding: '1px 7px' }}>{node.model}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 14, color: running ? C.text : C.muted }}>
          <StatusMark status={status} size={11} />
          {statusLabel[status]}
        </span>
      </div>
    </div>
  );
}

function Edge({ from, to, frame, index }: { from: NodeSpec; to: NodeSpec; frame: number; index: number }) {
  const x1 = from.x;
  const y1 = from.y + NODE_H;
  const x2 = to.x;
  const y2 = to.y;
  const mid = (y1 + y2) / 2;
  const d = `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2 - 8}`;
  const draw = interpolate(frame, [40 + index * 7, 76 + index * 7], [0, 1], { easing: EASE, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const active = statusAt(to, frame) === 'running';
  return (
    <g>
      <path d={d} fill="none" stroke={active ? C.accent : C.borderStrong} strokeWidth={active ? 2.5 : 2} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - draw} />
      {active && (
        <path d={d} fill="none" stroke={C.text} strokeWidth={2.5} strokeDasharray="10 14" strokeDashoffset={-frame * 1.6} opacity={0.8} />
      )}
      <path d={`M ${x2 - 7} ${y2 - 12} L ${x2} ${y2 - 1} L ${x2 + 7} ${y2 - 12} Z`} fill={active ? C.accent : C.borderStrong} opacity={draw} />
    </g>
  );
}

function Dock({ frame }: { frame: number }) {
  const slide = interpolate(frame, [122, 150], [1, 0], { easing: EASE, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const typed = frame < SEND_AT ? LIST.slice(0, Math.max(0, Math.floor((frame - TYPE_START) * 0.85))) : '';
  const isListShown = typed.split('\n').filter((line) => line.startsWith('- ')).length >= 2;
  const sendPress = interpolate(frame, [SEND_AT - 6, SEND_AT, SEND_AT + 6], [1, 0.9, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const cursorOn = Math.floor(frame / 15) % 2 === 0;

  return (
    <div
      style={{
        position: 'absolute',
        left: 460,
        width: 1100,
        bottom: 40,
        transform: `translateY(${slide * 420}px)`,
        fontFamily: FONT.ui,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
        {ITEMS.map((item, index) => {
          const status = itemStatus(item, frame);
          if (!status) {
            return null;
          }
          const appear = interpolate(frame, [item.timeline[0][0], item.timeline[0][0] + 14], [0, 1], { easing: EASE, extrapolateRight: 'clamp' });
          const showResult = item.resultAt !== undefined && frame >= item.resultAt;
          return (
            <div key={item.title} style={{ opacity: appear, transform: `translateY(${(1 - appear) * 12}px)`, display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ background: C.accent, color: C.bg, borderRadius: 10, padding: '8px 14px', fontSize: 19, fontWeight: 500 }}>
                <span style={{ opacity: 0.7, fontSize: 14, marginRight: 8 }}>You → Sekar · #{index + 1}</span>
                {item.title}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: C.surface, border: `1px solid ${status === 'running' ? C.accent : C.border}`, borderRadius: 10, padding: '8px 14px', fontSize: 17, color: C.textDim }}>
                <StatusMark status={status} size={11} />
                <span style={{ color: C.text, fontWeight: 600 }}>{statusLabel[status]}</span>
                {showResult && <span style={{ color: C.muted }}>· {item.result}</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ background: C.surface, border: `1px solid ${C.borderStrong}`, borderRadius: 12, padding: 16, boxShadow: '0 24px 60px #000000aa' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 16, color: C.muted, marginBottom: 10 }}>
          <span>To</span>
          <span style={{ color: C.text, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 5, padding: '3px 10px' }}>Sekar · plans it across the teams</span>
          {isListShown && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.textDim }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, background: C.accent, display: 'inline-block' }} />
              send as 3 separate items, one after another
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
          <div style={{ flex: 1, minHeight: 112, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '10px 14px', fontSize: 20, color: C.text, whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
            {typed || (frame >= SEND_AT ? <span style={{ color: C.muted }}>Prompt or list of work for the orchestrator…</span> : '')}
            {frame >= TYPE_START && frame < SEND_AT && cursorOn && <span style={{ borderLeft: `2px solid ${C.accent}`, marginLeft: 1 }} />}
          </div>
          <div style={{ width: 56, height: 56, borderRadius: 8, background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${sendPress})` }}>
            <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={C.bg} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2 11 13" />
              <path d="M22 2 15 22 11 13 2 9Z" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The Node Design canvas: the team appears, work is handed out from the chat dock and flows through the teams. */
export function CanvasScene() {
  const frame = useCurrentFrame();
  const zoom = interpolate(frame, [0, CANVAS_DURATION], [1.03, 1], { extrapolateRight: 'clamp' });
  const fadeOut = interpolate(frame, [CANVAS_DURATION - 14, CANVAS_DURATION], [1, 0], { extrapolateLeft: 'clamp' });

  return (
    <AbsoluteFill style={{ background: C.bg, opacity: fadeOut }}>
      <DotGrid opacity={0.55} />
      <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
          {EDGES.map(([from, to], index) => (
            <Edge key={`${from}-${to}`} from={byId.get(from) as NodeSpec} to={byId.get(to) as NodeSpec} frame={frame} index={index} />
          ))}
        </svg>
        {NODES.map((node, index) => (
          <Node key={node.id} node={node} frame={frame} index={index} />
        ))}
      </AbsoluteFill>

      <div style={{ position: 'absolute', top: 44, right: 56, display: 'flex', gap: 4, padding: 4, borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, fontFamily: FONT.ui, fontSize: 17 }}>
        <span style={{ padding: '6px 14px', color: C.muted }}>Chat</span>
        <span style={{ padding: '6px 14px', color: C.text, background: C.surface3, borderRadius: 6, fontWeight: 600 }}>Node Design</span>
      </div>

      {CAPTIONS.map((caption) => (
        <Reveal key={caption.title} from={caption.from} to={caption.to} style={{ position: 'absolute', left: 64, top: 300, width: 400 }}>
          <div style={{ fontFamily: FONT.title, fontWeight: 700, fontSize: 46, lineHeight: 1.12, color: C.text }}>{caption.title}</div>
          <div style={{ fontFamily: FONT.ui, fontSize: 21, lineHeight: 1.5, color: C.textDim, marginTop: 16 }}>{caption.body}</div>
        </Reveal>
      ))}

      <Dock frame={frame} />
    </AbsoluteFill>
  );
}
