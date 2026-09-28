import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

import { DotGrid, Reveal } from '../parts';
import { C, EASE, FONT } from '../theme';

const AGENTS = ['Claude Code', 'Codex', 'Cursor', 'OpenCode'];

/** "Your AI team. On your own server." and the agent CLIs it runs. */
export function Tagline() {
  const frame = useCurrentFrame();
  const rule = interpolate(frame, [40, 70], [0, 1], { easing: EASE, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: C.bg, alignItems: 'center', justifyContent: 'center' }}>
      <DotGrid opacity={0.3} />
      <div style={{ textAlign: 'center' }}>
        <Reveal from={4}>
          <div style={{ fontFamily: FONT.title, fontWeight: 700, fontSize: 112, color: C.text, lineHeight: 1.05 }}>Your AI team.</div>
        </Reveal>
        <Reveal from={20}>
          <div style={{ fontFamily: FONT.title, fontWeight: 500, fontStyle: 'italic', fontSize: 112, color: C.accent, lineHeight: 1.15 }}>
            On your own server.
          </div>
        </Reveal>
        <div style={{ margin: '44px auto 30px', height: 1, width: 520 * rule, background: C.borderStrong }} />
        <div style={{ display: 'flex', gap: 22, justifyContent: 'center' }}>
          {AGENTS.map((agent, index) => (
            <Reveal key={agent} from={52 + index * 6}>
              <div style={{ fontFamily: FONT.ui, fontSize: 28, fontWeight: 500, color: C.textDim, padding: '10px 22px', border: `1px solid ${C.border}`, borderRadius: 6, background: C.surface }}>
                {agent}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
}
