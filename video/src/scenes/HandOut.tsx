import { CameraMotionBlur } from '@remotion/motion-blur';
import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from 'remotion';

import { beatFrame, SCENE_START } from '../beats';
import { Backdrop } from '../components/Backdrop';
import { C, EASE_IN, EASE_IN_OUT, EASE_OUT, FONT } from '../theme';

const local = (beat: number) => beatFrame(beat) - SCENE_START.handOut;

/** Each line starts typing on a beat. */
const LINES = [
  { text: 'For the shoe shop:', at: local(25), item: false },
  { text: 'product page', at: local(26), item: true },
  { text: 'checkout flow', at: local(27), item: true },
  { text: 'confirmation email', at: local(28), item: true },
];
const SPLIT_AT = local(29);
const SEND_AT = local(30);
const FLY_AT = local(31);

const CARD_TOP = 380;
const LINE_TOP = 182;
const LINE_HEIGHT = 74;

/** Handing out a work list: typed line by line on the beat, sent, and the items fly off to the teams. */
export function HandOut() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill name="Hand out work">
      <Backdrop start={SCENE_START.handOut} driftX={-0.4} driftY={-0.2} />
      <AbsoluteFill
        name="Camera"
        style={{
          scale: interpolate(frame, [0, 141], [1, 1.05], { easing: EASE_IN_OUT, output: 'perceptual-scale', extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        }}
      >
        <Interactive.Div
          name="Headline"
          style={{
            position: 'absolute',
            left: 160,
            top: 96,
            display: 'flex',
            gap: 36,
            fontFamily: FONT.title,
            fontSize: 124,
            lineHeight: 1.1,
            opacity: interpolate(frame, [0, 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
            translate: interpolate(frame, [0, 20], ['0px 40px', '0px 0px'], { easing: EASE_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}
        >
          <span style={{ fontWeight: 700, color: C.text }}>Hand out work.</span>
          <span
            style={{
              fontStyle: 'italic',
              fontWeight: 500,
              color: C.accent,
              opacity: interpolate(frame, [local(25), local(25) + 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
            }}
          >
            Any time.
          </span>
        </Interactive.Div>

        <Composer />
        <CameraMotionBlur samples={8} shutterAngle={240}>
          <FlyingItems />
        </CameraMotionBlur>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function Composer() {
  const frame = useCurrentFrame();
  const press = interpolate(frame, [SEND_AT - 3, SEND_AT, SEND_AT + 8], [1, 0.86, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div
      style={{
        position: 'absolute',
        left: 300,
        top: CARD_TOP,
        width: 1320,
        height: 560,
        boxSizing: 'border-box',
        padding: 44,
        borderRadius: 18,
        backgroundColor: C.surface,
        border: `2px solid ${C.borderStrong}`,
        boxShadow: '0 50px 120px #000000cc',
        fontFamily: FONT.ui,
        opacity: interpolate(frame, [0, 16, FLY_AT + 6, FLY_AT + 20], [0, 1, 1, 0.35], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        translate: interpolate(frame, [0, 22], ['0px 120px', '0px 0px'], { easing: EASE_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 34, color: C.muted }}>
        <span>To</span>
        <span style={{ color: C.text, backgroundColor: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 18px' }}>
          Orchestrator · plans it across the teams
        </span>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            color: C.textDim,
            opacity: interpolate(frame, [SPLIT_AT, SPLIT_AT + 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
            scale: interpolate(frame, [SPLIT_AT, SPLIT_AT + 14], [0.8, 1], { easing: Easing.spring({ damping: 200 }), output: 'perceptual-scale', extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}
        >
          <span style={{ width: 26, height: 26, borderRadius: 5, backgroundColor: C.accent }} />
          3 items
        </span>
      </div>
      {LINES.map((line, index) => {
        const chars = Math.max(0, Math.floor((frame - line.at) * 1.5));
        const typed = line.text.slice(0, chars);
        const gone = line.item && frame >= FLY_AT + (index - 1) * 3;
        const typing = frame >= line.at && chars < line.text.length;
        return (
          <div
            key={line.text}
            style={{
              position: 'absolute',
              left: 44,
              top: LINE_TOP - 44 + index * LINE_HEIGHT + 60,
              fontSize: 46,
              color: line.item ? C.text : C.textDim,
              opacity: gone ? 0 : 1,
              whiteSpace: 'pre',
            }}
          >
            {frame >= line.at && (line.item ? '– ' : '')}
            {typed}
            {typing && <span style={{ borderLeft: `3px solid ${C.accent}`, marginLeft: 2 }} />}
          </div>
        );
      })}
      <div
        style={{
          position: 'absolute',
          right: 44,
          bottom: 44,
          width: 104,
          height: 104,
          borderRadius: 16,
          backgroundColor: C.accent,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          scale: press,
          boxShadow: `0 0 ${interpolate(frame, [SEND_AT, SEND_AT + 4, SEND_AT + 24], [0, 60, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}px ${C.accent}`,
        }}
      >
        <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke={C.bg} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 2 11 13" />
          <path d="M22 2 15 22 11 13 2 9Z" />
        </svg>
      </div>
    </div>
  );
}

/** On the beat after "send", each item lifts off the box as its own card and flies up to the teams. */
function FlyingItems() {
  const frame = useCurrentFrame();
  return (
    <>
      {LINES.filter((line) => line.item).map((line, index) => {
        const leave = FLY_AT + index * 3;
        if (frame < leave) {
          return null;
        }
        return (
          <div
            key={line.text}
            style={{
              position: 'absolute',
              left: 344,
              top: CARD_TOP + LINE_TOP + 16 + (index + 1) * LINE_HEIGHT,
              padding: '14px 28px',
              borderRadius: 12,
              backgroundColor: C.accent,
              color: C.bg,
              fontFamily: FONT.ui,
              fontWeight: 600,
              fontSize: 42,
              boxShadow: `0 20px 60px #000000aa, 0 0 40px ${C.accent}55`,
              translate: interpolate(frame, [leave, leave + 22], ['0px 0px', `${760 - index * 120}px ${-760 - index * 90}px`], { easing: EASE_IN, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
              rotate: interpolate(frame, [leave, leave + 22], ['0deg', `${-8 + index * 5}deg`], { easing: EASE_IN, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
              scale: interpolate(frame, [leave, leave + 6, leave + 22], [1, 1.08, 0.7], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
            }}
          >
            {line.text}
          </div>
        );
      })}
    </>
  );
}
