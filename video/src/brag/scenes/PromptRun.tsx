import { CameraMotionBlur } from '@remotion/motion-blur';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

import { Backdrop } from '../../components/Backdrop';
import { C, EASE_IN_OUT, EASE_OUT, FONT } from '../../theme';
import { AppCamera } from '../AppCamera';
import { APP_H, APP_W, AppWindow } from '../AppWindow';
import { localBeat, START } from '../beats';
import { appStateAt } from '../story';

const SEND_AT = localBeat(START.prompt, 12);

const CAPTIONS = [
  { lines: ['Give it', 'one prompt.'], from: 0, to: SEND_AT },
  { lines: ['It plans, splits', 'and builds.'], from: SEND_AT, to: 160 },
];

/** Highlight one: the real app flies in, a prompt is typed into its work chat, and the team runs it along the flow. */
export function PromptRun() {
  const frame = useCurrentFrame();
  const { state, key } = appStateAt(frame + START.prompt);
  const land = interpolate(frame, [0, 20], [0, 1], { easing: EASE_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const drift = interpolate(frame, [0, 150], [0, 1], { easing: EASE_IN_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill name="One prompt">
      <Backdrop start={START.prompt} driftX={-0.4} />
      <AbsoluteFill style={{ opacity: land, translate: `0px ${(1 - land) * 220}px` }}>
        <AppCamera
          anchor={{ x: 1250, y: 560 }}
          tiltY={-5 + drift * 4}
          keys={[
            { at: 0, x: 800, y: 470, scale: 0.7 },
            { at: 18, x: 800, y: 470, scale: 0.72 },
            { at: 34, x: 800, y: 845, scale: 1.32 },
            { at: SEND_AT + 2, x: 810, y: 845, scale: 1.36 },
            { at: SEND_AT + 16, x: 800, y: 390, scale: 1.05 },
            { at: 142, x: 800, y: 440, scale: 1.16 },
          ]}
        >
          <AppWindow state={state} stateKey={key} />
          <SendRing />
        </AppCamera>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: `linear-gradient(90deg, ${C.bg} 0%, ${C.bg}f0 30%, ${C.bg}00 46%)` }} />
      <CameraMotionBlur samples={6} shutterAngle={200}>
        <Captions />
      </CameraMotionBlur>
    </AbsoluteFill>
  );
}

/** A soft ring from the work chat's send button on the bar the prompt is sent. */
function SendRing() {
  const frame = useCurrentFrame();
  if (frame < SEND_AT || frame > SEND_AT + 24) {
    return null;
  }
  return (
    <div
      style={{
        position: 'absolute',
        left: APP_W / 2 + 340,
        top: APP_H - 88,
        width: 0,
        height: 0,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: -60,
          top: -60,
          width: 120,
          height: 120,
          borderRadius: '50%',
          border: `3px solid ${C.accent}`,
          opacity: interpolate(frame, [SEND_AT, SEND_AT + 24], [0.9, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          scale: interpolate(frame, [SEND_AT, SEND_AT + 24], [0.4, 2.4], { easing: EASE_OUT, output: 'perceptual-scale', extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        }}
      />
    </div>
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
            left: 96,
            top: 380,
            width: 640,
            fontFamily: FONT.title,
            fontSize: 96,
            lineHeight: 1.08,
            opacity: interpolate(frame, [caption.from, caption.from + 6, caption.to - 5, caption.to], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
            translate: interpolate(frame, [caption.from, caption.from + 12, caption.to - 6, caption.to], ['0px 60px', '0px 0px', '0px 0px', '0px -60px'], {
              easing: EASE_OUT,
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        >
          <div style={{ fontWeight: 700, color: C.text }}>{caption.lines[0]}</div>
          <div style={{ fontWeight: 500, fontStyle: 'italic', color: C.accent }}>{caption.lines[1]}</div>
        </div>
      ))}
    </>
  );
}
