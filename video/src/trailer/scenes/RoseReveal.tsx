import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

import { RoseArt } from '../../components/RoseArt';
import { RoseWindow } from '../../components/RoseWindow';
import { C, EASE_IN, EASE_OUT } from '../../theme';
import { PopText, SpacingText } from '../text';
import { at } from '../timeline';

const ROSE_AT = at('rose', 8);

/** The name, out of the dark: the rose rises in front of the morphing tracery, the wordmark closes up, the tagline pops. */
export function RoseReveal() {
  const frame = useCurrentFrame();
  const leave = interpolate(frame, [138, 158], [0, 1], { easing: EASE_IN, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ opacity: 1 - leave, scale: 1 + leave * 0.25 }}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', top: -150 }}>
        <RoseWindow
          size={880}
          draw={interpolate(frame, [ROSE_AT, ROSE_AT + 50], [0, 1], { easing: EASE_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
          rotation={frame * 0.12}
          opacity={0.3}
        />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', top: -150 }}>
        <RoseArt
          size={420}
          glow={1.5}
          style={{
            opacity: interpolate(frame, [ROSE_AT, ROSE_AT + 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
            scale: interpolate(frame, [ROSE_AT, ROSE_AT + 40], [0.6, 1], { easing: EASE_OUT, output: 'perceptual-scale', extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
            filter: `blur(${interpolate(frame, [ROSE_AT, ROSE_AT + 30], [24, 0], { easing: EASE_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}px)`,
          }}
        />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 240 }}>
        <SpacingText text="OPENLEIRA" at={at('rose', 10)} size={170} font="display" tight="0.12em" />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 130 }}>
        <PopText text="tim AI lo sendiri." at={at('rose', 12)} size={76} weight={500} italic color={C.textDim} stagger={1} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
