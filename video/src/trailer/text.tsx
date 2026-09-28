import type { CSSProperties } from 'react';
import { Easing, interpolate, useCurrentFrame } from 'remotion';

import { C, EASE_IN, EASE_OUT, FONT } from '../theme';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

type Look = {
  size: number;
  font?: 'title' | 'display' | 'ui';
  weight?: number;
  italic?: boolean;
  color?: string;
  style?: CSSProperties;
};

const lookStyle = ({ size, font = 'title', weight = 700, italic = false, color = C.text, style }: Look): CSSProperties => ({
  fontFamily: FONT[font],
  fontSize: size,
  fontWeight: weight,
  fontStyle: italic ? 'italic' : 'normal',
  color,
  lineHeight: 1.1,
  whiteSpace: 'nowrap',
  ...style,
});

/** Leaving: the whole line softens, grows a little and fades — a dissolve, never a hard cut. */
const exitStyle = (frame: number, out?: number): CSSProperties => (out === undefined ? {} : {
  opacity: interpolate(frame, [out - 9, out], [1, 0], clamp),
  filter: `blur(${interpolate(frame, [out - 9, out], [0, 14], { ...clamp, easing: EASE_IN })}px)`,
  scale: interpolate(frame, [out - 9, out], [1, 1.07], { ...clamp, easing: EASE_IN }),
});

/** Letters pop up one after another with a small spring. */
export function PopText({ text, at, out, stagger = 1.4, ...look }: Look & { text: string; at: number; out?: number; stagger?: number }) {
  const frame = useCurrentFrame();
  return (
    <div style={{ ...lookStyle(look), ...exitStyle(frame, out) }}>
      {text.split('').map((char, index) => {
        const start = at + index * stagger;
        return (
          <span
            key={index}
            style={{
              display: 'inline-block',
              whiteSpace: 'pre',
              opacity: interpolate(frame, [start, start + 3], [0, 1], clamp),
              scale: interpolate(frame, [start, start + 13], [0.2, 1], { ...clamp, easing: Easing.spring({ damping: 11, mass: 0.7 }) }),
              translate: interpolate(frame, [start, start + 13], ['0px 0.45em', '0px 0em'], { ...clamp, easing: EASE_OUT }),
            }}
          >
            {char}
          </span>
        );
      })}
    </div>
  );
}

/** The line arrives wide and blurred and closes up to its natural spacing. */
export function SpacingText({ text, at, out, tight = '0.02em', ...look }: Look & { text: string; at: number; out?: number; tight?: string }) {
  const frame = useCurrentFrame();
  const leaving = out === undefined ? 0 : interpolate(frame, [out - 10, out], [0, 1], { ...clamp, easing: EASE_IN });
  return (
    <div
      style={{
        ...lookStyle(look),
        letterSpacing: leaving > 0
          ? `calc(${tight} + ${leaving * 0.4}em)`
          : interpolate(frame, [at, at + 24], ['0.9em', tight], { ...clamp, easing: EASE_OUT }),
        opacity: interpolate(frame, [at, at + 10], [0, 1], clamp) * (1 - leaving),
        filter: `blur(${interpolate(frame, [at, at + 18], [18, 0], { ...clamp, easing: EASE_OUT }) + leaving * 10}px)`,
      }}
    >
      {text}
    </div>
  );
}

/** Words slide up out of a mask, each on its own frame. */
export function SlideWords({ words, out, gap = 0.26, ...look }: Look & { words: Array<{ word: string; at: number }>; out?: number; gap?: number }) {
  const frame = useCurrentFrame();
  return (
    <div style={{ ...lookStyle(look), display: 'flex', gap: `${gap}em`, ...exitStyle(frame, out) }}>
      {words.map(({ word, at }, index) => (
        <span key={`${word}-${index}`} style={{ display: 'inline-block', overflow: 'hidden', padding: '0 0.05em 0.14em', margin: '0 -0.05em -0.14em' }}>
          <span
            style={{
              display: 'inline-block',
              translate: interpolate(frame, [at, at + 10], ['0px 108%', '0px 0%'], { ...clamp, easing: EASE_OUT }),
              opacity: interpolate(frame, [at, at + 3], [0, 1], clamp),
            }}
          >
            {word}
          </span>
        </span>
      ))}
    </div>
  );
}

/** Typed out with a blinking caret. */
export function TypeText({ text, at, out, speed = 1.3, ...look }: Look & { text: string; at: number; out?: number; speed?: number }) {
  const frame = useCurrentFrame();
  const count = Math.max(0, Math.min(text.length, Math.floor((frame - at) * speed)));
  const caret = frame >= at && (count < text.length || Math.floor(frame / 12) % 2 === 0);
  return (
    <div style={{ ...lookStyle(look), ...exitStyle(frame, out) }}>
      {text.slice(0, count)}
      <span style={{ display: 'inline-block', width: '0.06em', height: '0.9em', marginLeft: '0.06em', translate: '0px 0.12em', backgroundColor: C.accent, opacity: caret ? 1 : 0 }} />
    </div>
  );
}

/** Punches in out of focus, a little large, and settles. */
export function BlurWord({ text, at, out, ...look }: Look & { text: string; at: number; out?: number }) {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        ...lookStyle(look),
        opacity: Math.min(
          interpolate(frame, [at, at + 5], [0, 1], clamp),
          out === undefined ? 1 : interpolate(frame, [out - 6, out], [1, 0], clamp),
        ),
        scale: interpolate(frame, [at, at + 12, out ?? at + 13], [1.35, 1, out === undefined ? 1 : 0.94], { ...clamp, easing: EASE_OUT, output: 'perceptual-scale' }),
        filter: `blur(${interpolate(frame, [at, at + 10], [22, 0], { ...clamp, easing: EASE_OUT }) + (out === undefined ? 0 : interpolate(frame, [out - 6, out], [0, 12], clamp))}px)`,
      }}
    >
      {text}
    </div>
  );
}
