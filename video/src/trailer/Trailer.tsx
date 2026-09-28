import { Audio } from '@remotion/media';
import { AbsoluteFill, Freeze, interpolate, Sequence, staticFile, useCurrentFrame } from 'remotion';

import { Backdrop } from '../components/Backdrop';
import { C } from '../theme';
import { MorphField } from './MorphField';
import { Ask } from './scenes/Ask';
import { Drop } from './scenes/Drop';
import { Finale } from './scenes/Finale';
import { Flow } from './scenes/Flow';
import { Intro } from './scenes/Intro';
import { RoseReveal } from './scenes/RoseReveal';
import { Tension } from './scenes/Tension';

/** The settled finale: the poster, baked in as frame 0 for thumbnails. */
export const POSTER_FRAME = 1200;

/**
 * The OpenLeira trailer, cut to the whole of public/music.mp3. One continuous
 * background (dust, glow, and the morphing gothic tracery) runs under every
 * part, and the parts overlap by a few frames, so text hands over to text
 * without a single hard cut.
 */
export const Trailer = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      {frame === 0 ? (
        <Freeze frame={POSTER_FRAME}>
          <Film />
        </Freeze>
      ) : (
        <Film />
      )}
      <Audio src={staticFile('music.mp3')} volume={(audioFrame) => interpolate(audioFrame, [1245, 1296], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
    </AbsoluteFill>
  );
};

const Film = () => (
  <AbsoluteFill>
    <Backdrop start={0} driftY={-0.25} />
    <MorphField />
    <Sequence name="Intro" from={0} durationInFrames={162}>
      <Intro />
    </Sequence>
    <Sequence name="Rose reveal" from={150} durationInFrames={158}>
      <RoseReveal />
    </Sequence>
    <Sequence name="Ask" from={296} durationInFrames={80}>
      <Ask />
    </Sequence>
    <Sequence name="Flow" from={364} durationInFrames={294}>
      <Flow />
    </Sequence>
    <Sequence name="Tension" from={648} durationInFrames={92}>
      <Tension />
    </Sequence>
    <Sequence name="Drop" from={728} durationInFrames={362}>
      <Drop />
    </Sequence>
    <Sequence name="Finale" from={1078} durationInFrames={219}>
      <Finale />
    </Sequence>
  </AbsoluteFill>
);
