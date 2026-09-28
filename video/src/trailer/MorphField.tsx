import { interpolatePaths } from '@remotion/paths';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

import { C, EASE_IN_OUT } from '../theme';
import { beatPulse } from './beats';

const POINTS = 240;

/** A closed outline from a polar radius function; every shape has the same points, so they morph smoothly. */
const polar = (radius: (theta: number) => number): string => {
  const commands: string[] = [];
  for (let index = 0; index < POINTS; index += 1) {
    const theta = (index / POINTS) * Math.PI * 2 - Math.PI / 2;
    const r = 100 * radius(theta);
    commands.push(`${index === 0 ? 'M' : 'L'} ${(Math.cos(theta) * r).toFixed(2)} ${(Math.sin(theta) * r).toFixed(2)}`);
  }
  return `${commands.join(' ')} Z`;
};

/** The gothic shapes the background morphs through. */
export const SHAPES = {
  circle: polar(() => 0.92),
  rose: polar((t) => 0.78 + 0.2 * Math.abs(Math.cos(6 * t))),
  quatrefoil: polar((t) => 0.58 + 0.4 * Math.abs(Math.cos(2 * t))),
  star: polar((t) => 0.5 + 0.46 * Math.abs(Math.cos(4 * t)) ** 3),
  trefoil: polar((t) => 0.6 + 0.36 * Math.abs(Math.cos(1.5 * t))),
  sun: polar((t) => 0.84 + 0.12 * Math.abs(Math.cos(12 * t)) ** 6),
};

/** How strongly the background shows at a global frame: full behind the rose, quieter behind text. */
const INTENSITY: Array<[number, number]> = [
  [0, 0.2], [15, 0.45], [150, 0.5], [170, 1], [290, 1], [320, 0.3], [640, 0.3], [660, 0.7], [725, 0.7], [740, 0.55],
  [1070, 0.55], [1095, 1], [1297, 1],
];

type LayerProps = { size: number; keys: number[]; shapes: string[]; spin: number; stroke: number; opacity: number };

/**
 * The film's continuous background: three rings of gothic outlines at
 * different sizes that morph between shapes, turn at different speeds
 * (parallax) and breathe with the beat. It never cuts, so the scenes above
 * it flow into each other.
 */
export function MorphField() {
  const frame = useCurrentFrame();
  const intensity = interpolate(frame, INTENSITY.map(([at]) => at), INTENSITY.map(([, value]) => value), { easing: EASE_IN_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const pulse = beatPulse(frame, 6);
  const layers: LayerProps[] = [
    { size: 1500, keys: [0, 170, 320, 660, 740, 1095, 1297], shapes: [SHAPES.circle, SHAPES.rose, SHAPES.circle, SHAPES.sun, SHAPES.quatrefoil, SHAPES.rose, SHAPES.rose], spin: 0.03, stroke: 0.5, opacity: 0.16 },
    { size: 1000, keys: [0, 170, 320, 660, 740, 1095, 1297], shapes: [SHAPES.star, SHAPES.quatrefoil, SHAPES.trefoil, SHAPES.star, SHAPES.rose, SHAPES.star, SHAPES.quatrefoil], spin: -0.06, stroke: 0.6, opacity: 0.2 },
    { size: 620, keys: [0, 170, 320, 660, 740, 1095, 1297], shapes: [SHAPES.quatrefoil, SHAPES.sun, SHAPES.star, SHAPES.circle, SHAPES.star, SHAPES.sun, SHAPES.circle], spin: 0.11, stroke: 0.8, opacity: 0.26 },
  ];
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: intensity, pointerEvents: 'none' }}>
      <AbsoluteFill
        style={{
          background: `conic-gradient(from ${frame * 0.4}deg at 50% 50%, transparent 0deg, ${C.accent}10 20deg, transparent 45deg, transparent 90deg, ${C.accent}0c 115deg, transparent 140deg, transparent 180deg, ${C.accent}10 205deg, transparent 230deg, transparent 270deg, ${C.accent}0c 295deg, transparent 320deg)`,
          maskImage: 'radial-gradient(circle at 50% 50%, black 0%, transparent 55%)',
          WebkitMaskImage: 'radial-gradient(circle at 50% 50%, black 0%, transparent 55%)',
        }}
      />
      {layers.map((layer, index) => (
        <AbsoluteFill key={index} style={{ alignItems: 'center', justifyContent: 'center' }}>
          <svg
            width={layer.size}
            height={layer.size}
            viewBox="-110 -110 220 220"
            style={{
              rotate: `${frame * layer.spin + index * 15}deg`,
              scale: 1 + pulse * 0.025 * (index + 1),
              opacity: layer.opacity + pulse * 0.12,
              filter: `drop-shadow(0 0 ${6 + pulse * 10}px ${C.accent}66)`,
            }}
          >
            <path
              d={interpolatePaths(frame, layer.keys, layer.shapes, { easing: EASE_IN_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
              fill="none"
              stroke={C.accent}
              strokeWidth={layer.stroke}
            />
            <path
              d={interpolatePaths(frame, layer.keys, layer.shapes, { easing: EASE_IN_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
              transform="scale(0.93)"
              fill="none"
              stroke={C.accent}
              strokeWidth={layer.stroke * 0.5}
              opacity={0.6}
            />
          </svg>
        </AbsoluteFill>
      ))}
    </AbsoluteFill>
  );
}
