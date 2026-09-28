/**
 * Beat map of public/music.mp3 (≈103 BPM), detected with librosa; the first
 * beat (0.65 s) is extrapolated from the grid because the track only kicks in
 * at 0.5 s. Every fourth beat from the first is a bar start. The music breaks
 * at 4.0–5.0 s and dips at 22.5 s; the film ends at 24.4 s.
 */
export const BEATS = [
  0.65, 1.231, 1.811, 2.392, 2.995, 3.599, 4.18, 4.76, 5.341, 5.921, 6.502, 7.105, 7.686, 8.29, 8.87, 9.451,
  10.054, 10.635, 11.215, 11.796, 12.399, 12.98, 13.56, 14.164, 14.745, 15.325, 15.929, 16.509, 17.09, 17.67,
  18.274, 18.855, 19.458, 20.039, 20.619, 21.223, 21.804, 22.291, 22.779, 23.29, 23.847, 24.451,
];

export const FPS = 30;
export const HOOK_HIT = 15; // 0.5 s: the track kicks in

export const beatFrame = (index: number): number => Math.round(BEATS[index] * FPS);

/** Global start frame of each scene; each starts on a bar. */
export const START = {
  hook: 0,
  reveal: beatFrame(4),
  prompt: beatFrame(8),
  audit: beatFrame(16),
  agents: beatFrame(24),
  outro: beatFrame(32),
} as const;

export const TOTAL = 732;

/** Local frame of beat `index` inside the scene starting at `start`. */
export const localBeat = (start: number, index: number): number => beatFrame(index) - start;

const BEAT_FRAMES = BEATS.map((beat) => beat * FPS);

/** 1 on a beat, decaying before the next one. */
export const beatPulse = (globalFrame: number, decay = 5): number => {
  let last = -Infinity;
  for (const beat of BEAT_FRAMES) {
    if (beat <= globalFrame) {
      last = beat;
    } else {
      break;
    }
  }
  return Number.isFinite(last) ? Math.exp(-(globalFrame - last) / decay) : 0;
};
