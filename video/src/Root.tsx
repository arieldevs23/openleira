import { Composition, Folder } from 'remotion';

import { Launch } from './Launch';
import { FlowRun } from './scenes/FlowRun';
import { HandOut } from './scenes/HandOut';
import { Pause } from './scenes/Pause';
import { RoseHit } from './scenes/RoseHit';
import { RoseOpen } from './scenes/RoseOpen';
import { Statement } from './scenes/Statement';
import { TeamBuild } from './scenes/TeamBuild';
import { Words } from './scenes/Words';
import './theme';

export const Root = () => (
  <>
    <Folder name="OpenLeira-Scenes">
      <Composition id="RoseOpen" component={RoseOpen} width={1920} height={1080} fps={30} durationInFrames={146} />
      <Composition id="Statement" component={Statement} width={1920} height={1080} fps={30} durationInFrames={144} />
      <Composition id="TeamBuild" component={TeamBuild} width={1920} height={1080} fps={30} durationInFrames={145} />
      <Composition id="HandOut" component={HandOut} width={1920} height={1080} fps={30} durationInFrames={141} />
      <Composition id="FlowRun" component={FlowRun} width={1920} height={1080} fps={30} durationInFrames={141} />
      <Composition id="Words" component={Words} width={1920} height={1080} fps={30} durationInFrames={99} />
      <Composition id="Pause" component={Pause} width={1920} height={1080} fps={30} durationInFrames={40} />
      <Composition id="RoseHit" component={RoseHit} width={1920} height={1080} fps={30} durationInFrames={122} />
    </Folder>
    <Composition id="OpenLeiraLaunch" component={Launch} width={1920} height={1080} fps={30} durationInFrames={912} />
  </>
);
