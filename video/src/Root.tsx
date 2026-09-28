import { Composition, Folder } from 'remotion';

import { Brag } from './brag/Brag';
import { Agents } from './brag/scenes/Agents';
import { AuditList } from './brag/scenes/AuditList';
import { Hook } from './brag/scenes/Hook';
import { Outro } from './brag/scenes/Outro';
import { PromptRun } from './brag/scenes/PromptRun';
import { Reveal } from './brag/scenes/Reveal';
import './theme';

export const Root = () => (
  <>
    <Folder name="Brag-Scenes">
      <Composition id="Hook" component={Hook} width={1920} height={1080} fps={30} durationInFrames={90} />
      <Composition id="Reveal" component={Reveal} width={1920} height={1080} fps={30} durationInFrames={70} />
      <Composition id="PromptRun" component={PromptRun} width={1920} height={1080} fps={30} durationInFrames={142} />
      <Composition id="AuditList" component={AuditList} width={1920} height={1080} fps={30} durationInFrames={140} />
      <Composition id="Agents" component={Agents} width={1920} height={1080} fps={30} durationInFrames={142} />
      <Composition id="Outro" component={Outro} width={1920} height={1080} fps={30} durationInFrames={148} />
    </Folder>
    <Composition id="OpenLeiraBrag" component={Brag} width={1920} height={1080} fps={30} durationInFrames={732} />
  </>
);
