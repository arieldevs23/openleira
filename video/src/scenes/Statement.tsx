import { CameraMotionBlur } from '@remotion/motion-blur';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

import { beatFrame, SCENE_START } from '../beats';
import { Backdrop } from '../components/Backdrop';
import { RoseWindow } from '../components/RoseWindow';
import { C, EASE_IN_OUT, EASE_OUT, FONT } from '../theme';

const local = (beat: number) => beatFrame(beat) - SCENE_START.statement;

/** Each word lands on its beat. */
const LINE_ONE = [
  { word: 'Your', at: local(8) },
  { word: 'AI', at: local(9) },
  { word: 'team.', at: local(10) },
];
const LINE_TWO = [
  { word: 'On', at: local(12) },
  { word: 'your', at: local(13) },
  { word: 'own', at: local(14) },
  { word: 'server.', at: local(15) },
];

/** "Your AI team. On your own server." — word by word on the beat, with a slow camera drift. */
export function Statement() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill name="Statement">
      <Backdrop start={SCENE_START.statement} driftX={-0.5} />
      <AbsoluteFill style={{ alignItems: 'flex-end', justifyContent: 'center', right: -260 }}>
        <RoseWindow size={1200} draw={1} rotation={40 + frame * 0.08} opacity={0.07} />
      </AbsoluteFill>
      <AbsoluteFill
        name="Camera"
        style={{
          scale: interpolate(frame, [0, 144], [1.05, 1], { easing: EASE_IN_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          translate: interpolate(frame, [0, 144], ['40px 0px', '-40px 0px'], { easing: EASE_IN_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        }}
      >
        <CameraMotionBlur samples={7} shutterAngle={200}>
          <Lines />
        </CameraMotionBlur>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function Lines() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ justifyContent: 'center', paddingLeft: 160 }}>
      <Line words={LINE_ONE} frame={frame} style={{ fontWeight: 700, color: C.text }} />
      <Line words={LINE_TWO} frame={frame} style={{ fontWeight: 500, fontStyle: 'italic', color: C.accent }} />
      <div
        style={{
          height: 3,
          marginTop: 40,
          backgroundColor: C.borderStrong,
          width: interpolate(frame, [LINE_TWO[3].at, LINE_TWO[3].at + 24], [0, 1180], { easing: EASE_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        }}
      />
    </AbsoluteFill>
  );
}

function Line({ words, frame, style }: { words: Array<{ word: string; at: number }>; frame: number; style: React.CSSProperties }) {
  return (
    <div style={{ display: 'flex', gap: 44, fontFamily: FONT.title, fontSize: 156, lineHeight: 1.18, ...style }}>
      {words.map(({ word, at }) => (
        <span key={word} style={{ display: 'inline-block', overflow: 'hidden', paddingBottom: 18, marginBottom: -18 }}>
          <span
            style={{
              display: 'inline-block',
              translate: interpolate(frame, [at, at + 14], ['0px 110%', '0px 0%'], { easing: EASE_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
              opacity: interpolate(frame, [at, at + 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
            }}
          >
            {word}
          </span>
        </span>
      ))}
    </div>
  );
}
