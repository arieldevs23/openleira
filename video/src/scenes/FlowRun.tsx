import { CameraMotionBlur } from '@remotion/motion-blur';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

import { beatFrame, SCENE_START } from '../beats';
import { Backdrop } from '../components/Backdrop';
import { EDGES, EdgeLine, NODES, NodeCard, nodeById, Token, type NodeState } from '../components/Graph';
import { C, EASE_IN_OUT, EASE_OUT, FONT } from '../theme';

const local = (beat: number) => beatFrame(beat) - SCENE_START.flow;

// Each hop leaves on one beat and arrives on the next.
const B = [local(32), local(33), local(34), local(35), local(36), local(37), local(38), local(39)];
const ALL_DONE = B[7];

/** When each team is running and when it is done. */
const STATES: Record<string, Array<[number, NodeState]>> = {
  orch: [[B[0], 'running'], [B[1], 'done']],
  planner: [[B[1], 'running'], [B[2], 'done']],
  designer: [[B[3], 'running'], [B[4], 'done']],
  backend: [[B[3], 'running'], [B[4] + 8, 'done']],
  frontend: [[B[5], 'running'], [B[6], 'done']],
  security: [[B[5] + 4, 'running'], [B[6], 'done']],
  audit: [[B[6] + 6, 'running'], [ALL_DONE, 'done']],
};

const TOKENS: Array<{ from: string; to: string; leave: number; arrive: number }> = [
  { from: 'orch', to: 'planner', leave: B[0] + 4, arrive: B[1] },
  { from: 'planner', to: 'designer', leave: B[2], arrive: B[3] },
  { from: 'planner', to: 'backend', leave: B[2], arrive: B[3] },
  { from: 'designer', to: 'frontend', leave: B[4], arrive: B[5] },
  { from: 'backend', to: 'security', leave: B[4] + 8, arrive: B[5] + 4 },
  { from: 'frontend', to: 'audit', leave: B[6], arrive: B[6] + 6 },
  { from: 'security', to: 'audit', leave: B[6], arrive: B[6] + 6 },
];

const stateAt = (id: string, frame: number): NodeState => {
  let state: NodeState = 'idle';
  for (const [at, next] of STATES[id]) {
    if (frame >= at) {
      state = next;
    }
  }
  return state;
};

const CAPTIONS = [
  { lines: ['One team,', 'one task at a time.'], from: 0, to: B[4] },
  { lines: ['Every result,', 'audited.'], from: B[4], to: 200 },
];

/** Work flowing through the team on the beat: sparks travel the arrows, teams light up, the audit closes it. */
export function FlowRun() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill name="Flow run">
      <Backdrop start={SCENE_START.flow} driftX={-0.5} />
      <AbsoluteFill
        name="Camera"
        style={{
          transformOrigin: '1290px 540px',
          scale: interpolate(frame, [0, 141], [0.98, 1.04], { easing: EASE_IN_OUT, output: 'perceptual-scale', extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          translate: interpolate(frame, [0, 141], ['30px 0px', '-30px 0px'], { easing: EASE_IN_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        }}
      >
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          {EDGES.map(([from, to]) => {
            const token = TOKENS.find((candidate) => candidate.from === from && candidate.to === to);
            const active = token ? frame >= token.leave && frame <= token.arrive + 6 : false;
            return <EdgeLine key={`${from}-${to}`} from={nodeById.get(from)!} to={nodeById.get(to)!} drawFrom={-20} drawTo={-10} active={active} />;
          })}
        </svg>
        {NODES.map((node) => (
          <NodeCard key={node.id} node={node} appearAt={-30} state={stateAt(node.id, frame)} start={SCENE_START.flow} />
        ))}
        {TOKENS.map((token) => (
          <Token key={`${token.from}-${token.to}`} from={nodeById.get(token.from)!} to={nodeById.get(token.to)!} leaveAt={token.leave} arriveAt={token.arrive} />
        ))}
        <DoneBurst />
      </AbsoluteFill>
      <AbsoluteFill name="Captions" style={{ paddingLeft: 110, justifyContent: 'center' }}>
        <CameraMotionBlur samples={6} shutterAngle={200}>
          <Captions />
        </CameraMotionBlur>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function Captions() {
  const frame = useCurrentFrame();
  return (
    <>
      {CAPTIONS.map((caption) => (
        <div
          key={caption.lines[0]}
          style={{
            position: 'absolute',
            left: 110,
            top: 380,
            width: 800,
            fontFamily: FONT.title,
            fontSize: 98,
            lineHeight: 1.08,
            opacity: interpolate(frame, [caption.from, caption.from + 8, caption.to - 6, caption.to], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
            translate: interpolate(
              frame,
              [caption.from, caption.from + 16, caption.to - 8, caption.to],
              ['0px 70px', '0px 0px', '0px 0px', '0px -70px'],
              { easing: EASE_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
            ),
          }}
        >
          <div style={{ fontWeight: 700, color: C.text }}>{caption.lines[0]}</div>
          <div style={{ fontWeight: 500, fontStyle: 'italic', color: C.accent }}>{caption.lines[1]}</div>
        </div>
      ))}
    </>
  );
}

/** When the audit passes, a soft ring spreads from it. */
function DoneBurst() {
  const frame = useCurrentFrame();
  const audit = nodeById.get('audit')!;
  if (frame < ALL_DONE) {
    return null;
  }
  return (
    <div
      style={{
        position: 'absolute',
        left: audit.x,
        top: audit.y + 59,
        width: 0,
        height: 0,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: -300,
          top: -300,
          width: 600,
          height: 600,
          borderRadius: '50%',
          border: `3px solid ${C.ok}`,
          opacity: interpolate(frame, [ALL_DONE, ALL_DONE + 22], [0.8, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          scale: interpolate(frame, [ALL_DONE, ALL_DONE + 22], [0.3, 1.4], { easing: EASE_OUT, output: 'perceptual-scale', extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        }}
      />
    </div>
  );
}
