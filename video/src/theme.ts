import { loadFont } from '@remotion/fonts';
import { Easing, staticFile } from 'remotion';

/** Dark-mode tokens from docs/DESIGN.md §2, the app's default look. */
export const C = {
  bg: '#0A0A0B',
  surface: '#141416',
  surface2: '#1C1C1F',
  surface3: '#232327',
  text: '#F2F2F0',
  textDim: '#C4C4C8',
  muted: '#8A8A90',
  border: '#2A2A2E',
  borderStrong: '#3A3A40',
  accent: '#C9CCD4',
  ok: '#7FB08A',
  warn: '#C9A96A',
} as const;

/** Soft deceleration: things arrive quickly and settle gently. */
export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
/** Gentle acceleration and deceleration for continuous camera moves. */
export const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);
/** Leaving: slow start, fast exit. */
export const EASE_IN = Easing.bezier(0.7, 0, 0.84, 0);

export const FONT = {
  ui: 'Inter',
  title: 'Playfair Display',
  display: 'Cinzel',
} as const;

// The app's own self-hosted fonts (src/assets/fonts in the app).
const faces: Array<[string, string, string]> = [
  ['Inter', 'inter-latin-400-normal.woff2', '400'],
  ['Inter', 'inter-latin-500-normal.woff2', '500'],
  ['Inter', 'inter-latin-600-normal.woff2', '600'],
  ['Playfair Display', 'playfair-display-latin-500-normal.woff2', '500'],
  ['Playfair Display', 'playfair-display-latin-700-normal.woff2', '700'],
  ['Cinzel', 'cinzel-latin-600-normal.woff2', '600'],
  ['Cinzel', 'cinzel-latin-700-normal.woff2', '700'],
];
for (const [family, file, weight] of faces) {
  loadFont({ family, url: staticFile(`fonts/${file}`), weight });
}
