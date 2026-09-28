import { Audio } from '@remotion/media';
import { TransitionSeries } from '@remotion/transitions';
import type { ReactNode } from 'react';
import { AbsoluteFill, Freeze, interpolate, staticFile, useCurrentFrame } from 'remotion';

import { C } from '../theme';
import { Agents } from './scenes/Agents';
import { AuditList } from './scenes/AuditList';
import { Hook } from './scenes/Hook';
import { Outro } from './scenes/Outro';
import { PromptRun } from './scenes/PromptRun';
import { Reveal } from './scenes/Reveal';

/**
 * Dips a scene through the background at its edges: the old scene has left
 * before the cut, the new one arrives after it, so busy layouts never
 * cross-fade into a double exposure.
 */
function Dip({ children, length, fadeIn = 4, fadeOut = 6 }: { children: ReactNode; length: number; fadeIn?: number; fadeOut?: number }) {
  const frame = useCurrentFrame();
  const durationInFrames = length;
  const opacity = Math.min(
    fadeIn ? interpolate(frame, [0, fadeIn], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 1,
    fadeOut ? interpolate(frame, [durationInFrames - fadeOut, durationInFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 1,
  );
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
}

/**
 * The OpenLeira brag film (brag-output/brag-plan.md), cut to public/music.mp3.
 * Every scene starts on a bar (see beats.ts) and cuts there, dipping through
 * the background. The song fades out over the last second.
 */
/** The hook, fully settled: the film's poster, baked in as frame 0 so every platform's thumbnail shows it. */
export const POSTER_FRAME = 80;

export const Brag = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      {frame === 0 ? (
        <Freeze frame={POSTER_FRAME}>
          <Scenes />
        </Freeze>
      ) : (
        <Scenes />
      )}
      <Audio
        src={staticFile('music.mp3')}
        volume={(audioFrame) => interpolate(audioFrame, [700, 731], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
      />
    </AbsoluteFill>
  );
};

const Scenes = () => (
    <TransitionSeries>
      <TransitionSeries.Sequence name="Hook" durationInFrames={90}>
        <Dip length={90} fadeIn={0}>
          <Hook />
        </Dip>
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence name="Reveal" durationInFrames={70}>
        <Dip length={70}>
          <Reveal />
        </Dip>
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence name="One prompt" durationInFrames={142}>
        <Dip length={142}>
          <PromptRun />
        </Dip>
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence name="Audited, lists" durationInFrames={140}>
        <Dip length={140}>
          <AuditList />
        </Dip>
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence name="Your agents, your server" durationInFrames={142}>
        <Dip length={142}>
          <Agents />
        </Dip>
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence name="Outro" durationInFrames={148}>
        <Dip length={148} fadeOut={0}>
          <Outro />
        </Dip>
      </TransitionSeries.Sequence>
    </TransitionSeries>
);
