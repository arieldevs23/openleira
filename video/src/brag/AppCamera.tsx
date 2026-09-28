import type { ReactNode } from 'react';
import { interpolate, useCurrentFrame } from 'remotion';

import { EASE_IN_OUT } from '../theme';
import { APP_H, APP_W } from './AppWindow';

/** Where the camera looks at a local frame: a point of the app (app pixels) and a zoom. */
export type CameraKey = { at: number; x: number; y: number; scale: number };

type AppCameraProps = {
  keys: CameraKey[];
  /** Screen point the focus point is held at. */
  anchor: { x: number; y: number };
  /** Degrees of Y rotation for depth (small). */
  tiltY?: number;
  children: ReactNode;
};

/**
 * A camera over the real app window: glides between focus points with the
 * film's ease, so the part of the UI that matters is large enough to read.
 */
export function AppCamera({ keys, anchor, tiltY = 0, children }: AppCameraProps) {
  const frame = useCurrentFrame();
  const at = keys.map((key) => key.at);
  const options = { easing: EASE_IN_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
  const x = interpolate(frame, at, keys.map((key) => key.x), options);
  const y = interpolate(frame, at, keys.map((key) => key.y), options);
  const scale = interpolate(frame, at, keys.map((key) => key.scale), options);
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: APP_W,
        height: APP_H,
        transformOrigin: '0 0',
        transform: `translate(${anchor.x - x * scale}px, ${anchor.y - y * scale}px) perspective(2400px) rotateY(${tiltY}deg) scale(${scale})`,
      }}
    >
      {children}
    </div>
  );
}
