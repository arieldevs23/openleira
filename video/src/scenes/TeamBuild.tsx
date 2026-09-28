import { AbsoluteFill, Interactive, interpolate, useCurrentFrame } from 'remotion';

import { beatFrame, SCENE_START } from '../beats';
import { Backdrop } from '../components/Backdrop';
import { EDGES, EdgeLine, NODES, NodeCard, nodeById } from '../components/Graph';
import { C, EASE_IN_OUT, EASE_OUT, FONT } from '../theme';

const local = (beat: number) => beatFrame(beat) - SCENE_START.team;

/** One team pops in on each beat, top to bottom. */
const APPEAR: Record<string, number> = {
  orch: local(16),
  planner: local(17),
  designer: local(18),
  backend: local(19),
  frontend: local(20),
  security: local(21),
  audit: local(22),
};

/** The drop: the camera pulls back from the orchestrator while the team draws itself, one node per beat. */
export function TeamBuild() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill name="Team build">
      <Backdrop start={SCENE_START.team} driftX={0.3} driftY={-0.4} />
      <AbsoluteFill
        name="Camera"
        style={{
          transformOrigin: '1290px 300px',
          scale: interpolate(frame, [0, 145], [1.22, 0.98], { easing: EASE_IN_OUT, output: 'perceptual-scale', extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          translate: interpolate(frame, [0, 145], ['0px 40px', '0px 0px'], { easing: EASE_IN_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        }}
      >
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          {EDGES.map(([from, to]) => (
            <EdgeLine
              key={`${from}-${to}`}
              from={nodeById.get(from)!}
              to={nodeById.get(to)!}
              drawFrom={APPEAR[to] - 12}
              drawTo={APPEAR[to] + 2}
              active={false}
            />
          ))}
        </svg>
        {NODES.map((node) => (
          <NodeCard key={node.id} node={node} appearAt={APPEAR[node.id]} state="idle" start={SCENE_START.team} />
        ))}
      </AbsoluteFill>

      <AbsoluteFill
        name="Foreground"
        style={{
          paddingLeft: 110,
          justifyContent: 'center',
          translate: interpolate(frame, [0, 145], ['0px 0px', '-36px 0px'], { easing: EASE_IN_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        }}
      >
        <Interactive.Div
          name="Headline"
          style={{
            fontFamily: FONT.title,
            fontWeight: 700,
            fontSize: 138,
            lineHeight: 1.05,
            color: C.text,
            width: 700,
            opacity: interpolate(frame, [0, 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
            translate: interpolate(frame, [0, 20], ['-60px 0px', '0px 0px'], { easing: EASE_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}
        >
          Draw your team.
        </Interactive.Div>
        <Interactive.Div
          name="Subline"
          style={{
            fontFamily: FONT.ui,
            fontSize: 44,
            lineHeight: 1.4,
            color: C.textDim,
            width: 660,
            marginTop: 36,
            opacity: interpolate(frame, [16, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
            translate: interpolate(frame, [16, 36], ['-40px 0px', '0px 0px'], { easing: EASE_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}
        >
          Every node is an agent: its own role, model and skills.
        </Interactive.Div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
