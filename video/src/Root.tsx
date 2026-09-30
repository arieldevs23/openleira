import { Composition, Folder } from 'remotion';

import { Ask } from './trailer/scenes/Ask';
import { Drop } from './trailer/scenes/Drop';
import { Finale } from './trailer/scenes/Finale';
import { Flow } from './trailer/scenes/Flow';
import { Intro } from './trailer/scenes/Intro';
import { RoseReveal } from './trailer/scenes/RoseReveal';
import { Tension } from './trailer/scenes/Tension';
import { Trailer } from './trailer/Trailer';
import './theme';

export const Root = () => (
  <>
    <Folder name="Trailer-Parts">
      <Composition id="Intro" component={Intro} width={1920} height={1080} fps={30} durationInFrames={162} />
      <Composition id="RoseReveal" component={RoseReveal} width={1920} height={1080} fps={30} durationInFrames={158} />
      <Composition id="Ask" component={Ask} width={1920} height={1080} fps={30} durationInFrames={80} />
      <Composition id="Flow" component={Flow} width={1920} height={1080} fps={30} durationInFrames={294} />
      <Composition id="Tension" component={Tension} width={1920} height={1080} fps={30} durationInFrames={92} />
      <Composition id="Drop" component={Drop} width={1920} height={1080} fps={30} durationInFrames={362} />
      <Composition id="Finale" component={Finale} width={1920} height={1080} fps={30} durationInFrames={219} />
    </Folder>
    <Composition id="OpenLeiraTrailer" component={Trailer} width={1920} height={1080} fps={30} durationInFrames={1297} />
  </>
);
