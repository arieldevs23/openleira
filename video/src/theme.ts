import { continueRender, delayRender, Easing, staticFile } from 'remotion';

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
  err: '#C07C7C',
} as const;

/** The one easing of the design system (§6). */
export const EASE = Easing.bezier(0.22, 1, 0.36, 1);

export const FPS = 30;

export const FONT = {
  ui: 'Inter, sans-serif',
  title: '"Playfair Display", serif',
  display: 'Cinzel, serif',
};

const FACES: Array<[family: string, file: string, weight: string]> = [
  ['Inter', 'inter-latin-400-normal.woff2', '400'],
  ['Inter', 'inter-latin-500-normal.woff2', '500'],
  ['Inter', 'inter-latin-600-normal.woff2', '600'],
  ['Playfair Display', 'playfair-display-latin-500-normal.woff2', '500'],
  ['Playfair Display', 'playfair-display-latin-700-normal.woff2', '700'],
  ['Cinzel', 'cinzel-latin-600-normal.woff2', '600'],
  ['Cinzel', 'cinzel-latin-700-normal.woff2', '700'],
];

// The app's self-hosted fonts; frames wait until they are loaded.
const fontHandle = delayRender('Loading fonts');
Promise.all(FACES.map(async ([family, file, weight]) => {
  const face = new FontFace(family, `url(${staticFile(`fonts/${file}`)}) format('woff2')`, { weight });
  await face.load();
  document.fonts.add(face);
}))
  .then(() => continueRender(fontHandle))
  .catch((error) => {
    console.error(error);
    continueRender(fontHandle);
  });
