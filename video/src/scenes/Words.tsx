import { CameraMotionBlur } from '@remotion/motion-blur';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

import { beatFrame, SCENE_START } from '../beats';
import { Backdrop } from '../components/Backdrop';
import { C, EASE_IN, EASE_IN_OUT, EASE_OUT, FONT } from '../theme';

const local = (beat: number) => beatFrame(beat) - SCENE_START.words;

/** One word per beat; the next beat pushes it out. */
const WORDS = [
  { word: 'Self-hosted.', note: 'your server, your code', at: local(40) },
  { word: 'Audited.', note: 'QA checks every result', at: local(41) },
  { word: 'Git-native.', note: 'pull and push to GitHub', at: local(42) },
  { word: 'Any agent.', note: 'Claude Code · Codex · Cursor · OpenCode', at: local(43) },
  { word: 'Yours.', note: '', at: local(44) },
];

/** Kinetic type on the beat as the music winds down. */
export function Words() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill name="Words">
      <Backdrop start={SCENE_START.words} driftY={-0.6} />
      <AbsoluteFill
        name="Camera"
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          scale: interpolate(frame, [0, 99], [1, 1.12], { easing: EASE_IN_OUT, output: 'perceptual-scale', extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          // The music fades out after the last word: so does the picture.
          opacity: interpolate(frame, [80, 99], [1, 0.25], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        }}
      >
        <CameraMotionBlur samples={8} shutterAngle={240}>
          <Kinetic />
        </CameraMotionBlur>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function Kinetic() {
  const frame = useCurrentFrame();
  return (
    <>
      {WORDS.map((entry, index) => {
        const next = WORDS[index + 1]?.at ?? 400;
        if (frame < entry.at - 1 || frame > next + 1) {
          return null;
        }
        return (
          <AbsoluteFill key={entry.word} style={{ alignItems: 'center', justifyContent: 'center' }}>
            <div
              style={{
                textAlign: 'center',
                translate: interpolate(frame, [entry.at, entry.at + 8, next - 5, next], ['0px 140px', '0px 0px', '0px -10px', '0px -150px'], {
                  easing: [EASE_OUT, EASE_IN_OUT, EASE_IN],
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                }),
                opacity: interpolate(frame, [entry.at, entry.at + 5, next - 4, next], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
                scale: interpolate(frame, [entry.at, entry.at + 12, next], [1.12, 1, 0.97], { easing: EASE_OUT, output: 'perceptual-scale', extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
              }}
            >
              <div style={{ fontFamily: FONT.title, fontWeight: 700, fontSize: 230, color: index === WORDS.length - 1 ? C.accent : C.text, fontStyle: index === WORDS.length - 1 ? 'italic' : 'normal' }}>
                {entry.word}
              </div>
              {entry.note && (
                <div style={{ fontFamily: FONT.ui, fontSize: 48, color: C.textDim, marginTop: 10, letterSpacing: '0.02em' }}>{entry.note}</div>
              )}
            </div>
          </AbsoluteFill>
        );
      })}
    </>
  );
}
