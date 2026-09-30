import { AbsoluteFill, random, useCurrentFrame } from 'remotion';

import { beatPulse } from '../trailer/beats';
import { C } from '../theme';

type BackdropProps = {
  /** Global frame of this scene's frame 0, for the beat pulse. */
  start: number;
  /** Camera drift in px/frame; the dot grid follows at a fraction for parallax. */
  driftX?: number;
  driftY?: number;
  /** How much the beat brightens the centre glow. */
  pulse?: number;
};

const DUST = Array.from({ length: 46 }, (_, index) => ({
  x: random(`x${index}`) * 1920,
  y: random(`y${index}`) * 1080,
  // Depth 0 (far, small, sharp, slow) to 1 (near, large, soft, fast).
  depth: random(`d${index}`),
  phase: random(`p${index}`) * Math.PI * 2,
}));

/**
 * The layered background every scene sits on: a centre glow that breathes
 * with the beat, a dot grid that moves slower than the camera (parallax),
 * floating dust at three depths, and a vignette.
 */
export function Backdrop({ start, driftX = 0, driftY = 0, pulse = 1 }: BackdropProps) {
  const frame = useCurrentFrame();
  const beat = beatPulse(frame + start) * pulse;
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg, overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 60% 55% at 50% 45%, ${C.surface3}, ${C.bg} 70%)`,
          opacity: 0.75 + beat * 0.25,
        }}
      />
      <AbsoluteFill
        style={{
          inset: -120,
          backgroundImage: `radial-gradient(circle, ${C.muted}2e 1.3px, transparent 1.8px)`,
          backgroundSize: '34px 34px',
          translate: `${frame * driftX * 0.35}px ${frame * driftY * 0.35}px`,
          maskImage: 'radial-gradient(ellipse 70% 65% at 50% 50%, black 30%, transparent 85%)',
        }}
      />
      {DUST.map((dust, index) => {
        const size = 2 + dust.depth * 7;
        const speed = 0.15 + dust.depth * 0.6;
        const x = (dust.x + frame * (driftX * (0.4 + dust.depth) + 0.12) + 1920) % 1920;
        const y = (dust.y - frame * speed + frame * driftY * dust.depth + 1080 * 4) % 1080;
        return (
          <div
            key={index}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: size,
              height: size,
              borderRadius: '50%',
              backgroundColor: C.accent,
              opacity: (0.08 + 0.18 * (1 - dust.depth)) * (0.6 + 0.4 * Math.sin(frame / 20 + dust.phase)),
              filter: `blur(${dust.depth * 3.5}px)`,
            }}
          />
        );
      })}
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 85% 80% at 50% 50%, transparent 55%, ${C.bg} 100%)` }} />
    </AbsoluteFill>
  );
}
