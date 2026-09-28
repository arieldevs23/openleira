import { CameraMotionBlur } from '@remotion/motion-blur';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

import { Backdrop } from '../../components/Backdrop';
import { C, EASE_IN_OUT, EASE_OUT, FONT } from '../../theme';
import { AppWindow } from '../AppWindow';
import { beatFrame, HOOK_HIT, START } from '../beats';
import { appStateAt } from '../story';

const LINE_ONE = [
  { word: 'Prompt', at: HOOK_HIT },
  { word: 'once.', at: beatFrame(0) },
];
const LINE_TWO = [
  { word: 'Your', at: beatFrame(1) },
  { word: 'AI', at: beatFrame(1) + 5 },
  { word: 'team', at: beatFrame(1) + 10 },
  { word: 'ships', at: beatFrame(2) },
  { word: 'it.', at: beatFrame(2) + 5 },
];

/** The hook: the title slams in on the track's first hit over the real canvas lighting up, out of focus. */
export function Hook() {
  const frame = useCurrentFrame();
  const { state, key } = appStateAt(frame + START.hook);
  return (
    <AbsoluteFill name="Hook" style={{ backgroundColor: C.bg }}>
      <Backdrop start={START.hook} driftY={-0.3} />
      <AbsoluteFill
        name="Product behind"
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          filter: `blur(${interpolate(frame, [0, 98], [5, 3], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}px)`,
          opacity: interpolate(frame, [0, HOOK_HIT, HOOK_HIT + 6], [0.25, 0.25, 0.8], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          scale: interpolate(frame, [0, 98], [1.4, 1.2], { easing: EASE_IN_OUT, output: 'perceptual-scale', extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        }}
      >
        <AppWindow state={state} stateKey={key} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 55% 45% at 50% 50%, ${C.bg}d9, ${C.bg}55 70%, transparent)` }} />
      <CameraMotionBlur samples={8} shutterAngle={220}>
        <Title />
      </CameraMotionBlur>
    </AbsoluteFill>
  );
}

function Title() {
  const frame = useCurrentFrame();
  const words = (list: typeof LINE_ONE, style: React.CSSProperties) => (
    <div style={{ display: 'flex', gap: '0.26em', justifyContent: 'center', fontFamily: FONT.title, lineHeight: 1.12, ...style }}>
      {list.map(({ word, at }) => (
        <span key={word} style={{ display: 'inline-block', overflow: 'hidden', padding: '0 0.04em 0.12em', margin: '0 -0.04em -0.12em' }}>
          <span
            style={{
              display: 'inline-block',
              translate: interpolate(frame, [at, at + 9], ['0px 105%', '0px 0%'], { easing: EASE_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
              opacity: interpolate(frame, [at, at + 3], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
            }}
          >
            {word}
          </span>
        </span>
      ))}
    </div>
  );
  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        scale: interpolate(frame, [HOOK_HIT, 98], [1.06, 1], { easing: EASE_OUT, output: 'perceptual-scale', extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
      }}
    >
      {words(LINE_ONE, { fontSize: 200, fontWeight: 700, color: C.text })}
      {words(LINE_TWO, { fontSize: 128, fontWeight: 500, fontStyle: 'italic', color: C.accent })}
    </AbsoluteFill>
  );
}
