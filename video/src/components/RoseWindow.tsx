import { C } from '../theme';

type RoseWindowProps = {
  size: number;
  /** 0..1: how much of the tracery is drawn. */
  draw: number;
  rotation: number;
  opacity: number;
};

const PETALS = Array.from({ length: 12 }, (_, index) => index * 30);

/** The gothic rose window ornament; its lines draw themselves in with `draw`. */
export function RoseWindow({ size, draw, rotation, opacity }: RoseWindowProps) {
  const dash = { pathLength: 1, strokeDasharray: '1 1', strokeDashoffset: 1 - draw };
  return (
    <svg width={size} height={size} viewBox="-100 -100 200 200" style={{ opacity, rotate: `${rotation}deg` }}>
      <g fill="none" stroke={C.accent} strokeWidth={0.32} strokeLinecap="round">
        <circle r={98} {...dash} />
        <circle r={93} {...dash} />
        <circle r={62} {...dash} />
        <circle r={26} {...dash} />
        <circle r={8} {...dash} />
        {PETALS.map((angle) => (
          <g key={angle} transform={`rotate(${angle})`}>
            <path d="M 0 -26 C 15 -42 15 -72 0 -93 C -15 -72 -15 -42 0 -26 Z" {...dash} />
            <path d="M 0 -62 L 0 -98" {...dash} />
            <circle cy={-78} r={6.5} {...dash} />
          </g>
        ))}
        {PETALS.map((angle) => (
          <circle key={`o${angle}`} transform={`rotate(${angle + 15})`} cy={-62} r={3.2} {...dash} />
        ))}
      </g>
    </svg>
  );
}
