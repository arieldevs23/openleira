import { Audio } from '@remotion/media';
import { springTiming, TransitionSeries } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { AbsoluteFill, staticFile } from 'remotion';

import { FlowRun } from './scenes/FlowRun';
import { HandOut } from './scenes/HandOut';
import { Pause } from './scenes/Pause';
import { RoseHit } from './scenes/RoseHit';
import { RoseOpen } from './scenes/RoseOpen';
import { Statement } from './scenes/Statement';
import { TeamBuild } from './scenes/TeamBuild';
import { Words } from './scenes/Words';
import { C } from './theme';

/**
 * OpenLeira launch film, cut to public/music.mp3. Every scene starts on a beat
 * (see beats.ts): each sequence lasts until the next scene's beat plus the
 * cross-fade, so the incoming scene's frame 0 lands exactly on its beat. The
 * silence cuts hard to the hit.
 */
export const Launch = () => (
  <AbsoluteFill style={{ backgroundColor: C.bg }}>
    <TransitionSeries>
      <TransitionSeries.Sequence name="Rose open" durationInFrames={146}>
        <RoseOpen />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={springTiming({ config: { damping: 200 }, durationInFrames: 10 })} />
      <TransitionSeries.Sequence name="Statement" durationInFrames={144}>
        <Statement />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={springTiming({ config: { damping: 200 }, durationInFrames: 10 })} />
      <TransitionSeries.Sequence name="Team build" durationInFrames={145}>
        <TeamBuild />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={springTiming({ config: { damping: 200 }, durationInFrames: 10 })} />
      <TransitionSeries.Sequence name="Hand out work" durationInFrames={141}>
        <HandOut />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={springTiming({ config: { damping: 200 }, durationInFrames: 10 })} />
      <TransitionSeries.Sequence name="Flow run" durationInFrames={141}>
        <FlowRun />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={springTiming({ config: { damping: 200 }, durationInFrames: 10 })} />
      <TransitionSeries.Sequence name="Words" durationInFrames={99}>
        <Words />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={springTiming({ config: { damping: 200 }, durationInFrames: 16 })} />
      <TransitionSeries.Sequence name="Pause" durationInFrames={40}>
        <Pause />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence name="Rose hit" durationInFrames={122}>
        <RoseHit />
      </TransitionSeries.Sequence>
    </TransitionSeries>
    <Audio src={staticFile('music.mp3')} />
  </AbsoluteFill>
);
