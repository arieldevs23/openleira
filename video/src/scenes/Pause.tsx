import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

import { SCENE_START } from '../beats';
import { Backdrop } from '../components/Backdrop';
import { RoseWindow } from '../components/RoseWindow';
import { C, EASE_IN } from '../theme';

/** The silence before the hit: near black, one line of light slowly opening. */
export function Pause() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill name="Pause">
      <Backdrop start={SCENE_START.pause} driftY={-0.2} pulse={0} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <RoseWindow
          size={900}
          draw={interpolate(frame, [0, 40], [0.2, 0.9], { easing: EASE_IN, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
          rotation={-frame * 0.2}
          opacity={0.14}
        />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            height: 2,
            backgroundColor: C.accent,
            boxShadow: `0 0 24px ${C.accent}`,
            width: interpolate(frame, [0, 40], [0, 1100], { easing: EASE_IN, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
            opacity: interpolate(frame, [0, 40], [0.45, 1], { easing: EASE_IN, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
