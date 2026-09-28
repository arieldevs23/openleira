import { CameraMotionBlur } from '@remotion/motion-blur';
import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from 'remotion';

import { SCENE_START } from '../beats';
import { Backdrop } from '../components/Backdrop';
import { RoseArt } from '../components/RoseArt';
import { RoseWindow } from '../components/RoseWindow';
import { C, EASE_IN_OUT, EASE_OUT, FONT } from '../theme';

const LETTERS = 'OPENLEIRA'.split('');
/** Local frame of beat 4 (the second bar): the wordmark lands. */
const WORD_AT = 69;
/** The strong accent at 3.1 s: the light sweeps over the wordmark. */
const SWEEP_AT = 93;

/** Opening: the rose window draws itself, the black rose rises out of the dark, the wordmark lands on the bar. */
export function RoseOpen() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill name="Rose open">
      <Backdrop start={SCENE_START.rose} driftY={-0.15} pulse={0.6} />
      <AbsoluteFill
        name="Camera"
        style={{
          scale: interpolate(frame, [0, 146], [1, 1.07], { easing: EASE_IN_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        }}
      >
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', top: -150 }}>
          <RoseWindow
            size={980}
            draw={interpolate(frame, [3, 100], [0, 1], { easing: EASE_IN_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
            rotation={frame * 0.05}
            opacity={0.2}
          />
        </AbsoluteFill>
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', top: -150 }}>
          <RoseArt
            size={440}
            style={{
              opacity: interpolate(frame, [3, 45], [0, 1], { easing: EASE_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
              scale: interpolate(frame, [3, 70], [0.84, 1], { easing: EASE_OUT, output: 'perceptual-scale', extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
              translate: interpolate(frame, [3, 70], ['0px 60px', '0px 0px'], { easing: EASE_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
              filter: `blur(${interpolate(frame, [3, 55], [22, 0], { easing: EASE_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}px)`,
            }}
          />
        </AbsoluteFill>
        <CameraMotionBlur samples={7} shutterAngle={200}>
          <Wordmark />
        </CameraMotionBlur>
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 160 }}>
          <Interactive.Div
            name="Subtitle"
            style={{
              fontFamily: FONT.ui,
              fontWeight: 500,
              fontSize: 52,
              color: C.textDim,
              textTransform: 'uppercase',
              opacity: interpolate(frame, [SWEEP_AT, SWEEP_AT + 20], [0, 1], { easing: EASE_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
              letterSpacing: interpolate(frame, [SWEEP_AT, SWEEP_AT + 40], ['0.7em', '0.34em'], { easing: EASE_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
            }}
          >
            self-hosted AI workspace
          </Interactive.Div>
        </AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/** The letters land one by one on the bar; a light sweeps across them on the accent. */
function Wordmark() {
  const frame = useCurrentFrame();
  const sweep = interpolate(frame, [SWEEP_AT, SWEEP_AT + 30], [-2, LETTERS.length + 2], { easing: EASE_IN_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 250 }}>
    <div style={{ display: 'flex', fontFamily: FONT.display, fontWeight: 700, fontSize: 176, letterSpacing: '0.12em' }}>
      {LETTERS.map((letter, index) => {
        const at = WORD_AT + index * 2;
        const shine = Math.exp(-((sweep - index) ** 2) / 1.6);
        return (
          <span
            key={index}
            style={{
              display: 'inline-block',
              color: index >= 4 ? C.accent : C.text,
              textShadow: `0 0 ${40 * shine}px ${C.text}`,
              filter: `brightness(${1 + shine * 0.6})`,
              opacity: interpolate(frame, [at, at + 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
              translate: interpolate(frame, [at, at + 16], ['0px 90px', '0px 0px'], { easing: Easing.bezier(0.16, 1, 0.3, 1), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
            }}
          >
            {letter}
          </span>
        );
      })}
    </div>
    </AbsoluteFill>
  );
}
