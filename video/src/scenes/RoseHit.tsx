import { CameraMotionBlur } from '@remotion/motion-blur';
import { AbsoluteFill, Interactive, interpolate, useCurrentFrame } from 'remotion';

import { SCENE_START } from '../beats';
import { Backdrop } from '../components/Backdrop';
import { RoseArt } from '../components/RoseArt';
import { RoseWindow } from '../components/RoseWindow';
import { C, EASE_IN_OUT, EASE_OUT, FONT } from '../theme';

/** Local frame of the tagline: the hit's second accent (26.9 s). */
const TAGLINE_AT = 17;

/** The hit: a flash, a shockwave, the rose slams in and the wordmark locks. Then it breathes out. */
export function RoseHit() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill name="Rose hit">
      <Backdrop start={SCENE_START.hit} pulse={0} />
      <AbsoluteFill
        name="Camera"
        style={{
          scale: interpolate(frame, [0, 122], [1, 1.06], { easing: EASE_IN_OUT, output: 'perceptual-scale', extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          opacity: interpolate(frame, [96, 121], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        }}
      >
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', top: -150 }}>
          <RoseWindow size={1000} draw={1} rotation={60 * (1 - Math.exp(-frame / 9)) + frame * 0.05} opacity={0.22} />
        </AbsoluteFill>
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', top: -150 }}>
          <div
            style={{
              width: 520,
              height: 520,
              borderRadius: '50%',
              border: `4px solid ${C.accent}`,
              opacity: interpolate(frame, [0, 26], [0.7, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
              scale: interpolate(frame, [0, 26], [0.5, 3.2], { easing: EASE_OUT, output: 'perceptual-scale', extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
            }}
          />
        </AbsoluteFill>
        <CameraMotionBlur samples={8} shutterAngle={240}>
          <Slam />
        </CameraMotionBlur>
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 150 }}>
          <Interactive.Div
            name="Tagline"
            style={{
              fontFamily: FONT.title,
              fontStyle: 'italic',
              fontWeight: 500,
              fontSize: 72,
              color: C.textDim,
              opacity: interpolate(frame, [TAGLINE_AT, TAGLINE_AT + 16], [0, 1], { easing: EASE_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
              translate: interpolate(frame, [TAGLINE_AT, TAGLINE_AT + 24], ['0px 30px', '0px 0px'], { easing: EASE_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
            }}
          >
            tim AI lo sendiri.
          </Interactive.Div>
        </AbsoluteFill>
      </AbsoluteFill>
      <AbsoluteFill
        name="Flash"
        style={{
          background: `radial-gradient(circle at 50% 36%, ${C.text} 0%, ${C.accent}99 22%, transparent 62%)`,
          mixBlendMode: 'screen',
          opacity: interpolate(frame, [0, 1, 8], [0.95, 0.7, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        }}
      />
    </AbsoluteFill>
  );
}

function Slam() {
  const frame = useCurrentFrame();
  return (
    <>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', top: -150 }}>
        <RoseArt
          size={460}
          glow={2}
          style={{
            scale: interpolate(frame, [0, 10], [1.7, 1], { easing: EASE_OUT, output: 'perceptual-scale', extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}
        />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 260 }}>
        <div
          style={{
            fontFamily: FONT.display,
            fontWeight: 700,
            fontSize: 176,
            color: C.text,
            letterSpacing: interpolate(frame, [0, 16], ['0.5em', '0.12em'], { easing: EASE_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
            opacity: interpolate(frame, [0, 4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}
        >
          OPEN<span style={{ color: C.accent }}>LEIRA</span>
        </div>
      </AbsoluteFill>
    </>
  );
}
