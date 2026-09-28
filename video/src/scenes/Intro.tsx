import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';

import { DotGrid, Reveal, RoseWindow } from '../parts';
import { C, EASE, FONT } from '../theme';

/** Rose reveal: the rose window turns in, the black rose rises, the wordmark appears. */
export function Intro({ outro = false }: { outro?: boolean }) {
  const frame = useCurrentFrame();
  const rose = interpolate(frame, [4, 40], [0, 1], { easing: EASE, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const window = interpolate(frame, [0, 30], [0, 1], { easing: EASE, extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: C.bg, alignItems: 'center', justifyContent: 'center' }}>
      <DotGrid opacity={0.35} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', top: -90 }}>
        <RoseWindow size={620} rotation={frame * 0.06} opacity={window * 0.16} />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', top: -90 }}>
        <Img
          src={staticFile('rose.webp')}
          style={{
            width: 300,
            height: 300,
            opacity: rose,
            transform: `scale(${0.92 + rose * 0.08}) translateY(${(1 - rose) * 16}px)`,
            filter: `drop-shadow(0 0 60px ${C.accent}22)`,
          }}
        />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 250 }}>
        <Reveal from={34}>
          <div style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 104, letterSpacing: '0.14em', color: C.text }}>
            OPEN<span style={{ color: C.accent }}>LEIRA</span>
          </div>
        </Reveal>
        <Reveal from={56} style={{ marginTop: 18 }}>
          <div style={{ fontFamily: outro ? FONT.title : FONT.ui, fontStyle: outro ? 'italic' : 'normal', fontSize: outro ? 40 : 26, letterSpacing: outro ? '0.01em' : '0.32em', color: C.textDim, textTransform: outro ? 'none' : 'uppercase' }}>
            {outro ? 'tim AI lo sendiri.' : 'self-hosted AI workspace'}
          </div>
        </Reveal>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
