import type { ReactNode } from 'react';
import { AbsoluteFill, interpolate, Sequence, useCurrentFrame } from 'remotion';

import { CANVAS_DURATION, CanvasScene } from './scenes/CanvasScene';
import { Features } from './scenes/Features';
import { Intro } from './scenes/Intro';
import { Tagline } from './scenes/Tagline';
import { C } from './theme';

const INTRO = 120;
const TAGLINE = 120;
const FEATURES = 180;
const OUTRO = 150;

/** Cross-fade in and out around a scene of `length` frames. */
function Fade({ length, children, fadeIn = 12, fadeOut = 12 }: { length: number; children: ReactNode; fadeIn?: number; fadeOut?: number }) {
  const frame = useCurrentFrame();
  const opacity = Math.min(
    fadeIn ? interpolate(frame, [0, fadeIn], [0, 1], { extrapolateRight: 'clamp' }) : 1,
    fadeOut ? interpolate(frame, [length - fadeOut, length], [1, 0], { extrapolateLeft: 'clamp' }) : 1,
  );
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
}

const SCENES: Array<{ length: number; node: ReactNode; fadeIn?: number; fadeOut?: number }> = [
  { length: INTRO, node: <Intro />, fadeIn: 0 },
  { length: TAGLINE, node: <Tagline /> },
  { length: CANVAS_DURATION, node: <CanvasScene />, fadeOut: 0 },
  { length: FEATURES, node: <Features /> },
  { length: OUTRO, node: <Intro outro />, fadeOut: 20 },
];

export const LAUNCH_DURATION = SCENES.reduce((total, scene) => total + scene.length, 0);

/** OpenLeira launch film: rose → tagline → the Node Design canvas at work → features → rose. */
export function Launch() {
  let start = 0;
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {SCENES.map((scene, index) => {
        const from = start;
        start += scene.length;
        return (
          <Sequence key={index} from={from} durationInFrames={scene.length}>
            <Fade length={scene.length} fadeIn={scene.fadeIn} fadeOut={scene.fadeOut}>{scene.node}</Fade>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
