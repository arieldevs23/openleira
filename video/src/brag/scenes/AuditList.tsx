import { CameraMotionBlur } from '@remotion/motion-blur';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

import { Backdrop } from '../../components/Backdrop';
import { C, EASE_IN_OUT, EASE_OUT, FONT } from '../../theme';
import { AppCamera } from '../AppCamera';
import { AppWindow } from '../AppWindow';
import { localBeat, START } from '../beats';
import { appStateAt } from '../story';

const LIST_AT = localBeat(START.audit, 20);

const CAPTIONS = [
  { text: <>Every result is <em style={{ color: C.accent, fontWeight: 500 }}>audited.</em></>, from: 0, to: LIST_AT, id: 'audit' },
  { text: <>Hand out a list. <em style={{ color: C.accent, fontWeight: 500 }}>It runs in order.</em></>, from: LIST_AT, to: 160, id: 'list' },
];

/** Highlight two: results go through QA and turn done, then a work list runs item after item in the real work chat. */
export function AuditList() {
  const frame = useCurrentFrame();
  const { state, key } = appStateAt(frame + START.audit);
  return (
    <AbsoluteFill name="Audited, lists">
      <Backdrop start={START.audit} driftX={0.3} />
      <AppCamera
        anchor={{ x: 960, y: 640 }}
        tiltY={interpolate(frame, [0, 140], [4, -4], { easing: EASE_IN_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
        keys={[
          { at: 0, x: 800, y: 430, scale: 1.18 },
          { at: LIST_AT - 12, x: 800, y: 480, scale: 1.3 },
          { at: LIST_AT + 12, x: 800, y: 560, scale: 1.45 },
          { at: 140, x: 800, y: 600, scale: 1.52 },
        ]}
      >
        <AppWindow state={state} stateKey={key} />
      </AppCamera>
      <AbsoluteFill style={{ background: `linear-gradient(180deg, ${C.bg} 0%, ${C.bg}e6 12%, ${C.bg}00 26%)` }} />
      <CameraMotionBlur samples={6} shutterAngle={200}>
        <Captions />
      </CameraMotionBlur>
    </AbsoluteFill>
  );
}

function Captions() {
  const frame = useCurrentFrame();
  return (
    <>
      {CAPTIONS.map((caption) => (
        <AbsoluteFill key={caption.id} style={{ alignItems: 'center', top: 56 }}>
          <div
            style={{
              fontFamily: FONT.title,
              fontWeight: 700,
              fontSize: 92,
              color: C.text,
              opacity: interpolate(frame, [caption.from, caption.from + 6, caption.to - 5, caption.to], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
              translate: interpolate(frame, [caption.from, caption.from + 12, caption.to - 6, caption.to], ['0px 50px', '0px 0px', '0px 0px', '0px -50px'], {
                easing: EASE_OUT,
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              }),
            }}
          >
            {caption.text}
          </div>
        </AbsoluteFill>
      ))}
    </>
  );
}
