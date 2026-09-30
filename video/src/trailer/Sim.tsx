import { Trail } from '@remotion/motion-blur';
import { interpolatePaths } from '@remotion/paths';
import { Easing, interpolate, useCurrentFrame } from 'remotion';

import { C, EASE_IN, EASE_IN_OUT, EASE_OUT, FONT } from '../theme';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

// ----- the work chat -----

type ChatProps = { enterAt: number; typeAt: number; sendAt: number; exitAt: number; text: string };

/** A simplified work chat: "to: Orchestrator", the prompt typed in, and send. */
export function SimChat({ enterAt, typeAt, sendAt, exitAt, text }: ChatProps) {
  const frame = useCurrentFrame();
  const count = Math.max(0, Math.min(text.length, Math.floor((frame - typeAt) * 1.1)));
  const sent = frame >= sendAt;
  return (
    <div
      style={{
        width: 1180,
        boxSizing: 'border-box',
        padding: '30px 34px',
        borderRadius: 20,
        backgroundColor: `${C.surface}ee`,
        border: `2px solid ${C.borderStrong}`,
        boxShadow: `0 40px 120px #000000cc, 0 0 ${interpolate(frame, [sendAt, sendAt + 4, sendAt + 24], [0, 70, 0], clamp)}px ${C.accent}88`,
        fontFamily: FONT.ui,
        opacity: Math.min(interpolate(frame, [enterAt, enterAt + 10], [0, 1], clamp), interpolate(frame, [exitAt - 10, exitAt], [1, 0], clamp)),
        translate: interpolate(frame, [enterAt, enterAt + 16, exitAt - 10, exitAt], ['0px 80px', '0px 0px', '0px 0px', '0px -40px'], { ...clamp, easing: EASE_OUT }),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 32, color: C.muted }}>
        ke
        <span style={{ color: C.text, backgroundColor: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: '4px 16px' }}>Orchestrator</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 22, marginTop: 22 }}>
        <div style={{ flex: 1, minHeight: 84, display: 'flex', alignItems: 'center', fontSize: 50, color: C.text, overflow: 'hidden' }}>
          <span
            style={{
              opacity: interpolate(frame, [sendAt, sendAt + 8], [1, 0], clamp),
              translate: interpolate(frame, [sendAt, sendAt + 10], ['0px 0px', '0px -50px'], { ...clamp, easing: EASE_IN }),
              whiteSpace: 'pre',
            }}
          >
            {text.slice(0, count)}
          </span>
          {!sent && frame >= typeAt && <span style={{ width: 4, height: 54, backgroundColor: C.accent, marginLeft: 4, opacity: count < text.length || Math.floor(frame / 12) % 2 === 0 ? 1 : 0 }} />}
        </div>
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: 16,
            backgroundColor: C.accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            scale: interpolate(frame, [sendAt - 3, sendAt, sendAt + 8], [1, 0.84, 1], clamp),
          }}
        >
          <svg width={46} height={46} viewBox="0 0 24 24" fill="none" stroke={C.bg} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2 11 13" />
            <path d="M22 2 15 22 11 13 2 9Z" />
          </svg>
        </div>
      </div>
    </div>
  );
}

// ----- the small team graph -----

export type NodeState = 'nunggu' | 'jalan' | 'dicek' | 'beres';

export const NODE_W = 380;
export const NODE_H = 124;

export type SimNode = { id: string; team: string; agent: string; x: number; y: number };

export const SIM_NODES: SimNode[] = [
  { id: 'orch', team: 'Orchestrator', agent: 'Sekar', x: 960, y: 330 },
  { id: 'fe', team: 'Frontend', agent: 'Nadia', x: 620, y: 560 },
  { id: 'be', team: 'Backend', agent: 'Arya', x: 1300, y: 560 },
  { id: 'qa', team: 'QA', agent: 'Wira', x: 960, y: 790 },
];

export const SIM_EDGES: Array<[string, string]> = [['orch', 'fe'], ['orch', 'be'], ['fe', 'qa'], ['be', 'qa']];

export const simNode = (id: string) => SIM_NODES.find((node) => node.id === id)!;

const edgeGeometry = (from: SimNode, to: SimNode) => {
  const x1 = from.x;
  const y1 = from.y + NODE_H;
  const x2 = to.x;
  const y2 = to.y - 12;
  const mid = (y1 + y2) / 2;
  return { x1, y1, x2, y2, mid };
};

const pointOn = (from: SimNode, to: SimNode, t: number) => {
  const { x1, y1, x2, y2, mid } = edgeGeometry(from, to);
  const u = 1 - t;
  return {
    x: u * u * u * x1 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x2,
    y: u * u * u * y1 + 3 * u * u * t * mid + 3 * u * t * t * mid + t * t * t * y2,
  };
};

/** One arrow of the flow, drawing itself in; moving dashes while work travels on it. */
export function SimEdge({ from, to, drawAt, active }: { from: SimNode; to: SimNode; drawAt: number; active: boolean }) {
  const frame = useCurrentFrame();
  const { x1, y1, x2, y2, mid } = edgeGeometry(from, to);
  const d = `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`;
  const draw = interpolate(frame, [drawAt, drawAt + 14], [0, 1], { ...clamp, easing: EASE_IN_OUT });
  return (
    <g>
      <path d={d} fill="none" stroke={active ? C.accent : C.borderStrong} strokeWidth={active ? 4 : 3} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - draw} />
      {active && <path d={d} fill="none" stroke={C.text} strokeWidth={4} strokeDasharray="14 20" strokeDashoffset={-frame * 2.4} opacity={0.6} />}
      <path d={`M ${x2 - 11} ${y2 - 14} L ${x2} ${y2 + 2} L ${x2 + 11} ${y2 - 14} Z`} fill={active ? C.accent : C.borderStrong} opacity={interpolate(draw, [0.8, 1], [0, 1], clamp)} />
    </g>
  );
}

/** A spark carrying work along an arrow, with a light trail. */
export function Spark({ from, to, leaveAt, arriveAt }: { from: SimNode; to: SimNode; leaveAt: number; arriveAt: number }) {
  return (
    <Trail layers={6} lagInFrames={0.7} trailOpacity={0.55}>
      <SparkDot from={from} to={to} leaveAt={leaveAt} arriveAt={arriveAt} />
    </Trail>
  );
}

function SparkDot({ from, to, leaveAt, arriveAt }: { from: SimNode; to: SimNode; leaveAt: number; arriveAt: number }) {
  const frame = useCurrentFrame();
  if (frame < leaveAt || frame > arriveAt + 4) {
    return null;
  }
  const point = pointOn(from, to, interpolate(frame, [leaveAt, arriveAt], [0, 1], { ...clamp, easing: EASE_IN_OUT }));
  return (
    <div
      style={{
        position: 'absolute',
        left: point.x - 11,
        top: point.y - 11,
        width: 22,
        height: 22,
        borderRadius: '50%',
        backgroundColor: C.text,
        boxShadow: `0 0 20px 8px ${C.accent}aa, 0 0 60px 20px ${C.accent}44`,
        opacity: interpolate(frame, [arriveAt, arriveAt + 4], [1, 0], clamp),
      }}
    />
  );
}

const CIRCLE = 'M 12 3 C 17 3 21 7 21 12 C 21 17 17 21 12 21 C 7 21 3 17 3 12 C 3 7 7 3 12 3 Z';
const CHECK = 'M 4 12.5 C 5.5 14 7 15.5 9.5 18 C 12.5 14.5 16 10 20.5 5.5 C 20.5 5.5 20.5 5.5 20.5 5.5 C 20.5 5.5 20.5 5.5 20.5 5.5 Z';

/** One team: pops in, glows while it works, and its mark morphs from a ring into a check when it is done. */
export function SimNodeCard({ node, appearAt, state, doneAt }: { node: SimNode; appearAt: number; state: NodeState; doneAt?: number }) {
  const frame = useCurrentFrame();
  const working = state === 'jalan' || state === 'dicek';
  const glow = working ? 0.5 + 0.5 * Math.sin(frame / 4) : 0;
  const border = working ? C.accent : state === 'beres' ? `${C.ok}cc` : C.borderStrong;
  return (
    <div
      style={{
        position: 'absolute',
        left: node.x - NODE_W / 2,
        top: node.y,
        width: NODE_W,
        height: NODE_H,
        boxSizing: 'border-box',
        padding: '20px 26px',
        borderRadius: 16,
        backgroundColor: C.surface,
        border: `2px solid ${border}`,
        boxShadow: working ? `0 0 ${30 + glow * 30}px ${C.accent}55, 0 24px 60px #000000aa` : '0 24px 60px #000000aa',
        fontFamily: FONT.ui,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        opacity: interpolate(frame, [appearAt, appearAt + 6], [0, 1], clamp),
        scale: interpolate(frame, [appearAt, appearAt + 16], [0.5, 1], { ...clamp, easing: Easing.spring({ damping: 12, mass: 0.7 }) }),
      }}
    >
      <div>
        <div style={{ fontSize: 40, fontWeight: 600, color: C.text }}>{node.team}</div>
        <div style={{ fontSize: 26, color: C.muted, marginTop: 4 }}>
          {node.agent} · <span style={{ color: working ? C.text : state === 'beres' ? C.ok : C.muted }}>{state}</span>
        </div>
      </div>
      <svg width={52} height={52} viewBox="0 0 24 24" style={{ overflow: 'visible' }}>
        {doneAt !== undefined && frame >= doneAt ? (
          <path
            d={interpolatePaths(frame, [doneAt, doneAt + 12], [CIRCLE, CHECK], { easing: EASE_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
            fill="none"
            stroke={C.ok}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <circle cx={12} cy={12} r={9} fill="none" stroke={working ? C.accent : C.borderStrong} strokeWidth={2.4} strokeDasharray={working ? '4 3' : undefined} style={{ rotate: working ? `${frame * 6}deg` : '0deg', transformOrigin: '12px 12px' }} />
        )}
      </svg>
    </div>
  );
}
