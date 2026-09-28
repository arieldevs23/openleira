import { CameraMotionBlur } from '@remotion/motion-blur';
import { AbsoluteFill, Interactive, interpolate, useCurrentFrame } from 'remotion';

import { Backdrop } from '../../components/Backdrop';
import { RoseArt } from '../../components/RoseArt';
import { RoseWindow } from '../../components/RoseWindow';
import { C, EASE_IN, EASE_IN_OUT, EASE_OUT, FONT } from '../../theme';
import { localBeat, START } from '../beats';

const BRAND_AT = localBeat(START.outro, 36);

/** Punchline, then the name, the tagline and where to get it, held through the music's dip. */
export function Outro() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill name="Outro">
      <Backdrop start={START.outro} driftY={-0.25} />
      <AbsoluteFill
        name="Camera"
        style={{
          scale: interpolate(frame, [0, 148], [1, 1.05], { easing: EASE_IN_OUT, output: 'perceptual-scale', extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          opacity: interpolate(frame, [130, 148], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        }}
      >
        <CameraMotionBlur samples={7} shutterAngle={220}>
          <Punchline />
        </CameraMotionBlur>
        <AbsoluteFill style={{ opacity: interpolate(frame, [BRAND_AT, BRAND_AT + 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
          <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', top: -170 }}>
            <RoseWindow
              size={900}
              draw={interpolate(frame, [BRAND_AT, BRAND_AT + 30], [0.2, 1], { easing: EASE_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
              rotation={frame * 0.06}
              opacity={0.2}
            />
          </AbsoluteFill>
          <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', top: -170 }}>
            <RoseArt
              size={380}
              style={{ scale: interpolate(frame, [BRAND_AT, BRAND_AT + 14], [1.3, 1], { easing: EASE_OUT, output: 'perceptual-scale', extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}
            />
          </AbsoluteFill>
          <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 262 }}>
            <div
              style={{
                fontFamily: FONT.display,
                fontWeight: 700,
                fontSize: 150,
                color: C.text,
                letterSpacing: interpolate(frame, [BRAND_AT, BRAND_AT + 16], ['0.4em', '0.12em'], { easing: EASE_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
              }}
            >
              OPEN<span style={{ color: C.accent }}>LEIRA</span>
            </div>
          </AbsoluteFill>
          <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 120 }}>
            <Interactive.Div
              name="Tagline and link"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 36,
                opacity: interpolate(frame, [BRAND_AT + 10, BRAND_AT + 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
                translate: interpolate(frame, [BRAND_AT + 10, BRAND_AT + 26], ['0px 30px', '0px 0px'], { easing: EASE_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
              }}
            >
              <span style={{ fontFamily: FONT.title, fontStyle: 'italic', fontWeight: 500, fontSize: 64, color: C.textDim }}>tim AI lo sendiri.</span>
              <span style={{ fontFamily: FONT.ui, fontWeight: 600, fontSize: 46, color: C.bg, backgroundColor: C.accent, borderRadius: 10, padding: '10px 26px' }}>openleira.online</span>
            </Interactive.Div>
          </AbsoluteFill>
        </AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function Punchline() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        opacity: interpolate(frame, [0, 5, BRAND_AT - 8, BRAND_AT], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        scale: interpolate(frame, [0, 14, BRAND_AT], [1.15, 1, 0.94], { easing: [EASE_OUT, EASE_IN], output: 'perceptual-scale', extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
      }}
    >
      <div style={{ fontFamily: FONT.title, fontWeight: 700, fontSize: 230, color: C.text }}>
        Your <em style={{ color: C.accent, fontWeight: 500 }}>AI team.</em>
      </div>
    </AbsoluteFill>
  );
}
