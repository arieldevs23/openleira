import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

import { C, EASE_IN, EASE_OUT } from '../../theme';
import { SIM_EDGES, SIM_NODES, SimEdge, SimNodeCard, Spark, simNode, type NodeState } from '../Sim';
import { SpacingText } from '../text';
import { at } from '../timeline';

const B = (index: number) => at('flow', index);

const APPEAR: Record<string, number> = { orch: B(20), fe: B(21), be: B(22), qa: B(23) };
const SEND = B(24);
const TO_QA = B(28);
const DONE = B(30);

const STATES: Record<string, Array<[number, NodeState]>> = {
  orch: [[B(20), 'jalan'], [SEND + 14, 'beres']],
  fe: [[SEND + 14, 'jalan'], [TO_QA + 14, 'dicek'], [DONE, 'beres']],
  be: [[SEND + 14, 'jalan'], [TO_QA + 14, 'dicek'], [DONE, 'beres']],
  qa: [[TO_QA + 14, 'jalan'], [DONE, 'beres']],
};

const stateAt = (id: string, frame: number): NodeState => STATES[id].reduce<NodeState>((state, [from, next]) => (frame >= from ? next : state), 'nunggu');

const SPARKS = [
  { from: 'orch', to: 'fe', leave: SEND, arrive: SEND + 14 },
  { from: 'orch', to: 'be', leave: SEND, arrive: SEND + 14 },
  { from: 'fe', to: 'qa', leave: TO_QA, arrive: TO_QA + 14 },
  { from: 'be', to: 'qa', leave: TO_QA, arrive: TO_QA + 14 },
];

const CAPTIONS = [
  { text: 'Orchestrator bagi tugasnya.', from: B(20), to: SEND - 2 },
  { text: 'Tiap tim jalan barengan.', from: SEND, to: TO_QA - 2 },
  { text: 'Semua dicek QA dulu.', from: TO_QA, to: DONE - 2 },
  { text: 'Baru dianggap beres.', from: DONE, to: 292 },
];

/** The simulated team, big and close: the work is split, runs side by side, goes through QA, and is done. */
export function Flow() {
  const frame = useCurrentFrame();
  const leave = interpolate(frame, [272, 292], [0, 1], { easing: EASE_IN, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill>
      {CAPTIONS.map((caption) => (
        <AbsoluteFill key={caption.text} style={{ alignItems: 'center', top: 90 }}>
          <SpacingText text={caption.text} at={caption.from} out={caption.to} size={92} />
        </AbsoluteFill>
      ))}
      <AbsoluteFill
        style={{
          opacity: 1 - leave,
          scale: interpolate(frame, [0, 60, 292], [1.08, 1, 1.04], { easing: EASE_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) + leave * 0.1,
          filter: `blur(${leave * 12}px)`,
        }}
      >
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          {SIM_EDGES.map(([from, to]) => {
            const spark = SPARKS.find((candidate) => candidate.from === from && candidate.to === to);
            const active = spark ? frame >= spark.leave && frame <= spark.arrive + 8 : false;
            return <SimEdge key={`${from}-${to}`} from={simNode(from)} to={simNode(to)} drawAt={APPEAR[to] - 10} active={active} />;
          })}
        </svg>
        {SIM_NODES.map((node) => (
          <SimNodeCard key={node.id} node={node} appearAt={APPEAR[node.id]} state={stateAt(node.id, frame)} doneAt={node.id === 'qa' ? DONE : undefined} />
        ))}
        {SPARKS.map((spark) => (
          <Spark key={`${spark.from}-${spark.to}`} from={simNode(spark.from)} to={simNode(spark.to)} leaveAt={spark.leave} arriveAt={spark.arrive} />
        ))}
        {frame >= DONE && (
          <div style={{ position: 'absolute', left: 960, top: 852, width: 0, height: 0 }}>
            <div
              style={{
                position: 'absolute',
                left: -320,
                top: -320,
                width: 640,
                height: 640,
                borderRadius: '50%',
                border: `3px solid ${C.ok}`,
                opacity: interpolate(frame, [DONE, DONE + 26], [0.8, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
                scale: interpolate(frame, [DONE, DONE + 26], [0.3, 1.5], { easing: EASE_OUT, output: 'perceptual-scale', extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
              }}
            />
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
