import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

import { RoseArt } from '../../components/RoseArt';
import { RoseWindow } from '../../components/RoseWindow';
import { C, EASE_IN_OUT, EASE_OUT, FONT } from '../../theme';
import { PopText, SpacingText } from '../text';
import { at } from '../timeline';

const ROSE_AT = at('finale', 61);

/** The rose returns in front of the morphing tracery; the name, the tagline, where to find it; then dark. */
export function Finale() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        opacity: interpolate(frame, [178, 216], [1, 0], { easing: EASE_IN_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        scale: interpolate(frame, [0, 219], [1, 1.06], { easing: EASE_IN_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
      }}
    >
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', top: -200 }}>
        <RoseWindow
          size={880}
          draw={interpolate(frame, [ROSE_AT, ROSE_AT + 40], [0, 1], { easing: EASE_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
          rotation={-frame * 0.1}
          opacity={0.3}
        />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', top: -200 }}>
        <RoseArt
          size={400}
          glow={1.6}
          style={{
            opacity: interpolate(frame, [ROSE_AT, ROSE_AT + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
            scale: interpolate(frame, [ROSE_AT, ROSE_AT + 24], [1.5, 1], { easing: EASE_OUT, output: 'perceptual-scale', extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
            filter: `blur(${interpolate(frame, [ROSE_AT, ROSE_AT + 20], [20, 0], { easing: EASE_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}px)`,
          }}
        />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 300 }}>
        <SpacingText text="OPENLEIRA" at={at('finale', 62)} size={160} font="display" tight="0.12em" />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 200 }}>
        <PopText text="tim AI lo sendiri." at={at('finale', 64)} size={72} weight={500} italic color={C.textDim} stagger={1} />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 104 }}>
        <div
          style={{
            fontFamily: FONT.ui,
            fontWeight: 600,
            fontSize: 46,
            color: C.bg,
            backgroundColor: C.accent,
            borderRadius: 10,
            padding: '8px 24px',
            opacity: interpolate(frame, [at('finale', 66), at('finale', 66) + 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
            letterSpacing: interpolate(frame, [at('finale', 66), at('finale', 66) + 20], ['0.4em', '0.02em'], { easing: EASE_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}
        >
          openleira.online
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
