import { Composition } from 'remotion';

import { Launch, LAUNCH_DURATION } from './Launch';
import { FPS } from './theme';

export const Root = () => (
  <Composition
    id="OpenLeiraLaunch"
    component={Launch}
    durationInFrames={LAUNCH_DURATION}
    fps={FPS}
    width={1920}
    height={1080}
  />
);
