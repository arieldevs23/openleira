import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

import { C, EASE, FONT } from './theme';

export type Status = 'idle' | 'queued' | 'running' | 'done' | 'warning';

/** Fades and lifts a child in at `from` (and out at `to`, when given). */
export function Reveal({ from, to, children, lift = 18, style }: {
  from: number;
  to?: number;
  children: ReactNode;
  lift?: number;
  style?: CSSProperties;
}) {
  const frame = useCurrentFrame();
  const inProgress = interpolate(frame, [from, from + 18], [0, 1], { easing: EASE, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const outProgress = to === undefined ? 0 : interpolate(frame, [to - 12, to], [0, 1], { easing: EASE, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{ ...style, opacity: inProgress * (1 - outProgress), transform: `translateY(${(1 - inProgress) * lift - outProgress * 8}px)` }}>
      {children}
    </div>
  );
}

/** The faint static dot texture of the canvas background. */
export function DotGrid({ opacity = 1 }: { opacity?: number }) {
  return (
    <AbsoluteFill
      style={{
        opacity,
        backgroundImage: `radial-gradient(circle, ${C.muted}33 1.2px, transparent 1.6px)`,
        backgroundSize: '28px 28px',
      }}
    />
  );
}

/** A slowly turning rose window: rings, petals and tracery lines in the ornament colour. */
export function RoseWindow({ size, rotation, opacity }: { size: number; rotation: number; opacity: number }) {
  const petals = Array.from({ length: 12 }, (_, index) => index * 30);
  return (
    <svg width={size} height={size} viewBox="-100 -100 200 200" style={{ opacity, transform: `rotate(${rotation}deg)` }}>
      <g fill="none" stroke={C.accent} strokeWidth={0.35}>
        <circle r={98} />
        <circle r={92} />
        <circle r={60} />
        <circle r={24} />
        {petals.map((angle) => (
          <g key={angle} transform={`rotate(${angle})`}>
            <path d="M 0 -24 C 14 -40 14 -70 0 -92 C -14 -70 -14 -40 0 -24 Z" />
            <line x1={0} y1={-60} x2={0} y2={-98} />
            <circle cy={-76} r={6} />
          </g>
        ))}
        {petals.map((angle) => (
          <circle key={`o${angle}`} transform={`rotate(${angle + 15})`} cy={-60} r={3} />
        ))}
      </g>
    </svg>
  );
}

/** Status is told by shape, colour only reinforces it (DESIGN.md §2). */
export function StatusMark({ status, size = 12 }: { status: Status; size?: number }) {
  const frame = useCurrentFrame();
  if (status === 'done') {
    return <span style={{ width: size, height: size, borderRadius: '50%', background: C.ok, display: 'inline-block', flexShrink: 0 }} />;
  }
  if (status === 'running') {
    const pulse = (Math.sin(frame / 6) + 1) / 2;
    return (
      <span style={{ position: 'relative', width: size, height: size, display: 'inline-block', flexShrink: 0 }}>
        <span style={{ position: 'absolute', inset: -size * 0.45, borderRadius: '50%', border: `1.5px solid ${C.accent}`, opacity: 0.2 + pulse * 0.5 }} />
        <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid ${C.accent}` }} />
      </span>
    );
  }
  if (status === 'warning') {
    return (
      <svg width={size} height={size} viewBox="0 0 12 12" style={{ flexShrink: 0 }}>
        <path d="M6 1 L11 11 L1 11 Z" fill={C.warn} />
      </svg>
    );
  }
  return (
    <span
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'inline-block',
        border: `2px solid ${status === 'queued' ? C.muted : C.borderStrong}`,
      }}
    />
  );
}

export const statusLabel: Record<Status, string> = {
  idle: 'idle',
  queued: 'waiting for the item before it',
  running: 'running',
  done: 'done',
  warning: 'has a question',
};

export const uiText: CSSProperties = { fontFamily: FONT.ui, color: C.text };
