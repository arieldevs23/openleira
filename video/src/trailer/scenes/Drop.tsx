import { CameraMotionBlur } from '@remotion/motion-blur';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

import { C, EASE_IN_OUT } from '../../theme';
import { BlurWord, PopText, SlideWords, SpacingText } from '../text';
import { at } from '../timeline';

const B = (index: number) => at('drop', index);

/** The drop: one idea per beat or two, each with its own text move, handing over without a cut. */
export function Drop() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        // A slow push through the whole drop keeps the camera alive between words.
        scale: interpolate(frame, [0, 362], [1, 1.08], { easing: EASE_IN_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
      }}
    >
      <CameraMotionBlur samples={6} shutterAngle={200}>
        <Words />
      </CameraMotionBlur>
    </AbsoluteFill>
  );
}

function Center({ children, gap = 0 }: { children: React.ReactNode; gap?: number }) {
  return <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap }}>{children}</AbsoluteFill>;
}

function Words() {
  return (
    <>
      <Center>
        <PopText text="Kasih list." at={B(41)} out={B(43) - 1} size={220} />
      </Center>
      <Center>
        <SpacingText text="Jalan berurutan." at={B(43)} out={B(45) - 1} size={170} italic weight={500} color={C.accent} />
      </Center>
      <Center gap={6}>
        <BlurWord text="Satu tim," at={B(45)} out={B(49)} size={150} />
        <BlurWord text="satu tugas," at={B(46)} out={B(49)} size={150} />
        <BlurWord text="nggak tabrakan." at={B(47)} out={B(49)} size={150} italic weight={500} color={C.accent} />
      </Center>
      <Center gap={4}>
        <SpacingText text="Claude Code" at={B(49)} out={B(54) - 1} size={120} font="ui" weight={600} tight="-0.01em" />
        <SpacingText text="Codex" at={B(50)} out={B(54) - 1} size={120} font="ui" weight={600} tight="-0.01em" />
        <SpacingText text="Cursor" at={B(51)} out={B(54) - 1} size={120} font="ui" weight={600} tight="-0.01em" />
        <SpacingText text="OpenCode" at={B(52)} out={B(54) - 1} size={120} font="ui" weight={600} tight="-0.01em" color={C.accent} />
      </Center>
      <Center>
        <PopText text="Satu kanvas." at={B(54)} out={B(56) - 1} size={210} />
      </Center>
      <Center>
        <SlideWords
          words={[
            { word: 'Push', at: B(56) },
            { word: 'ke', at: B(56) + 6 },
            { word: 'GitHub.', at: B(57) },
          ]}
          out={B(58) - 1}
          size={180}
        />
      </Center>
      <Center gap={6}>
        <BlurWord text="Server lo." at={B(58)} out={B(61)} size={150} />
        <BlurWord text="Kunci lo." at={B(59)} out={B(61)} size={150} />
        <BlurWord text="Kode lo." at={B(60)} out={B(61)} size={150} italic weight={500} color={C.accent} />
      </Center>
    </>
  );
}
