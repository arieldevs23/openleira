import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

import { C, EASE_IN_OUT } from '../../theme';
import { HIT } from '../beats';
import { PopText, SlideWords, SpacingText } from '../text';
import { at } from '../timeline';

/** Act one, text only: three short lines on the first hits, the last one held through the break. */
export function Intro() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <PopText text="Satu prompt." at={HIT} out={at('intro', 2) - 2} size={210} />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <SpacingText text="Satu tim AI." at={at('intro', 2)} out={at('intro', 4) - 2} size={200} italic weight={500} color={C.accent} />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          // Through the music's break the line drifts closer, slowly.
          scale: interpolate(frame, [at('intro', 5), 160], [1, 1.07], { easing: EASE_IN_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        }}
      >
        <SlideWords
          words={[
            { word: 'Di', at: at('intro', 4) },
            { word: 'server', at: at('intro', 4) + 9 },
            { word: 'lo', at: at('intro', 5) },
            { word: 'sendiri.', at: at('intro', 5) + 8 },
          ]}
          out={160}
          size={170}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
