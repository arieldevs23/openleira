import { AbsoluteFill } from 'remotion';

import { SimChat } from '../Sim';
import { SlideWords } from '../text';
import { at } from '../timeline';

/** "Lo kasih kerjaan." and the prompt typed into the work chat, sent on the beat. */
export function Ask() {
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 70 }}>
      <SlideWords
        words={[
          { word: 'Lo', at: at('ask', 16) },
          { word: 'kasih', at: at('ask', 16) + 6 },
          { word: 'kerjaan.', at: at('ask', 16) + 12 },
        ]}
        out={78}
        size={150}
      />
      <SimChat enterAt={at('ask', 16) + 10} typeAt={at('ask', 17)} sendAt={at('ask', 19)} exitAt={78} text="bikin halaman checkout + email order" />
    </AbsoluteFill>
  );
}
