import '../app';

import { LLMProviderLogo } from '@/shared/ui/LLMProviderLogo';
import { CameraMotionBlur } from '@remotion/motion-blur';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';

import { Backdrop } from '../../components/Backdrop';
import { RoseWindow } from '../../components/RoseWindow';
import { C, EASE_IN, EASE_OUT, FONT } from '../../theme';
import { localBeat, START } from '../beats';

const AGENTS = [
  { provider: 'claude', name: 'Claude Code', at: localBeat(START.agents, 24) },
  { provider: 'codex', name: 'Codex', at: localBeat(START.agents, 25) },
  { provider: 'cursor', name: 'Cursor', at: localBeat(START.agents, 26) },
  { provider: 'opencode', name: 'OpenCode', at: localBeat(START.agents, 27) },
];
const SERVER_AT = localBeat(START.agents, 28);

/** Highlight three: the agent CLIs it runs, one per beat, then where it runs. */
export function Agents() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill name="Your agents, your server">
      <Backdrop start={START.agents} driftX={-0.5} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <RoseWindow size={1300} draw={1} rotation={frame * 0.1} opacity={0.06} />
      </AbsoluteFill>
      <CameraMotionBlur samples={7} shutterAngle={220}>
        <Content />
      </CameraMotionBlur>
    </AbsoluteFill>
  );
}

function Content() {
  const frame = useCurrentFrame();
  const out = interpolate(frame, [SERVER_AT - 6, SERVER_AT + 6], [0, 1], { easing: EASE_IN, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: 1 - out, translate: `0px ${-out * 90}px` }}>
        <div
          style={{
            fontFamily: FONT.title,
            fontWeight: 700,
            fontSize: 124,
            color: C.text,
            marginBottom: 80,
            opacity: interpolate(frame, [0, 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
            translate: interpolate(frame, [0, 14], ['0px 40px', '0px 0px'], { easing: EASE_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}
        >
          Bring your own agents.
        </div>
        <div style={{ display: 'flex', gap: 36 }}>
          {AGENTS.map((agent) => (
            <div
              key={agent.name}
              className="dark"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 22,
                padding: '26px 38px',
                borderRadius: 16,
                backgroundColor: C.surface,
                border: `2px solid ${C.borderStrong}`,
                boxShadow: '0 30px 70px #000000aa',
                fontFamily: FONT.ui,
                fontWeight: 600,
                fontSize: 46,
                color: C.text,
                opacity: interpolate(frame, [agent.at, agent.at + 5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
                scale: interpolate(frame, [agent.at, agent.at + 12], [0.7, 1], { easing: Easing.spring({ damping: 200 }), output: 'perceptual-scale', extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
                translate: interpolate(frame, [agent.at, agent.at + 12], ['0px 70px', '0px 0px'], { easing: EASE_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
              }}
            >
              <LLMProviderLogo provider={agent.provider} className="h-14 w-14" />
              {agent.name}
            </div>
          ))}
        </div>
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          opacity: interpolate(frame, [SERVER_AT, SERVER_AT + 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          translate: interpolate(frame, [SERVER_AT, SERVER_AT + 14], ['0px 90px', '0px 0px'], { easing: EASE_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        }}
      >
        <div style={{ fontFamily: FONT.title, fontWeight: 500, fontStyle: 'italic', fontSize: 170, color: C.accent }}>On your own server.</div>
        <div
          style={{
            fontFamily: FONT.ui,
            fontSize: 50,
            color: C.textDim,
            marginTop: 26,
            opacity: interpolate(frame, [SERVER_AT + 17, SERVER_AT + 25], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}
        >
          Your VPS · your keys · your folder
        </div>
      </AbsoluteFill>
    </>
  );
}
