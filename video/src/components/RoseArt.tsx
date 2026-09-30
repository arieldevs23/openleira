import { Img, staticFile } from 'remotion';
import type { CSSProperties } from 'react';

import { C } from '../theme';

/**
 * The black rose as the landing page shows it: a glow melts the image's light
 * halo into the background and a radial mask cuts its grey corners.
 */
export function RoseArt({ size, style, glow = 1 }: { size: number; style?: CSSProperties; glow?: number }) {
  return (
    <div style={{ position: 'relative', width: size, height: size, ...style }}>
      <div
        style={{
          position: 'absolute',
          inset: -size * 0.18,
          background: `radial-gradient(closest-side, ${C.accent}${Math.round(0x22 * glow).toString(16).padStart(2, '0')}, transparent)`,
        }}
      />
      <Img
        src={staticFile('rose.webp')}
        style={{
          position: 'relative',
          width: size,
          height: size,
          maskImage: 'radial-gradient(closest-side, #000 58%, transparent 98%)',
          WebkitMaskImage: 'radial-gradient(closest-side, #000 58%, transparent 98%)',
        }}
      />
    </div>
  );
}
