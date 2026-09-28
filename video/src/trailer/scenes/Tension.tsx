import { AbsoluteFill } from 'remotion';

import { C } from '../../theme';
import { PopText, TypeText } from '../text';
import { at } from '../timeline';

/** The dip in the music: a question, then the answer typed out slowly. */
export function Tension() {
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <PopText text="Kerjaan numpuk?" at={at('tension', 36)} out={at('tension', 38) - 2} size={170} stagger={1.6} />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <TypeText text="Kasih aja semuanya." at={at('tension', 38)} out={at('tension', 41)} speed={0.75} size={150} italic weight={500} color={C.accent} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
