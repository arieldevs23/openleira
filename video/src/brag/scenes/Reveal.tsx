import { CameraMotionBlur } from '@remotion/motion-blur';
import { AbsoluteFill, Interactive, interpolate, useCurrentFrame } from 'remotion';

import { Backdrop } from '../../components/Backdrop';
import { RoseArt } from '../../components/RoseArt';
import { RoseWindow } from '../../components/RoseWindow';
import { C, EASE_IN_OUT, EASE_OUT, FONT } from '../../theme';
import { localBeat, START } from '../beats';

const SUB_AT = localBeat(START.reveal, 5);

/** The name: rose, rose window and wordmark land on the bar and hold through the music's break. */
export function Reveal() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill name="Reveal">
      <Backdrop start={START.reveal} driftY={-0.2} />
      <AbsoluteFill
        name="Camera"
        style={{ scale: interpolate(frame, [0, 78], [1, 1.05], { easing: EASE_IN_OUT, output: 'perceptual-scale', extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}
      >
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', top: -150 }}>
          <RoseWindow
            size={920}
            draw={interpolate(frame, [0, 40], [0.1, 1], { easing: EASE_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
            rotation={30 * (1 - Math.exp(-frame / 12)) + frame * 0.05}
            opacity={0.22}
          />
        </AbsoluteFill>
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', top: -150 }}>
          <RoseArt
            size={420}
            style={{
              opacity: interpolate(frame, [0, 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
              scale: interpolate(frame, [0, 16], [1.25, 1], { easing: EASE_OUT, output: 'perceptual-scale', extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
            }}
          />
        </AbsoluteFill>
        <CameraMotionBlur samples={7} shutterAngle={200}>
          <Wordmark />
        </CameraMotionBlur>
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 150 }}>
          <Interactive.Div
            name="Subtitle"
            style={{
              fontFamily: FONT.ui,
              fontWeight: 500,
              fontSize: 50,
              color: C.textDim,
              textTransform: 'uppercase',
              opacity: interpolate(frame, [SUB_AT, SUB_AT + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
              letterSpacing: interpolate(frame, [SUB_AT, SUB_AT + 30], ['0.6em', '0.32em'], { easing: EASE_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
            }}
          >
            self-hosted AI workspace
          </Interactive.Div>
        </AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function Wordmark() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 250 }}>
      <div style={{ display: 'flex', fontFamily: FONT.display, fontWeight: 700, fontSize: 170, letterSpacing: '0.12em' }}>
        {'OPENLEIRA'.split('').map((letter, index) => (
          <span
            key={index}
            style={{
              display: 'inline-block',
              color: index >= 4 ? C.accent : C.text,
              opacity: interpolate(frame, [index * 1.5, index * 1.5 + 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
              translate: interpolate(frame, [index * 1.5, index * 1.5 + 12], ['0px 80px', '0px 0px'], { easing: EASE_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
            }}
          >
            {letter}
          </span>
        ))}
      </div>
    </AbsoluteFill>
  );
}
