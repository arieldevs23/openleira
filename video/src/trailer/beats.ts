/**
 * Beat map of public/music.mp3 (≈103 BPM, 43.2 s), detected with librosa. The
 * first beat (0.65 s) is extrapolated: the track kicks in at 0.5 s. The music
 * breaks at 4.0–5.0 s, dips at 22.3–24.0 s and fades out after 41.5 s.
 */
export const BEATS = [
  0.65, 1.231, 1.811, 2.392, 2.995, 3.599, 4.18, 4.76, 5.341, 5.921, 6.502, 7.105, 7.686, 8.29, 8.87, 9.451,
  10.054, 10.635, 11.215, 11.796, 12.399, 12.98, 13.56, 14.164, 14.745, 15.325, 15.929, 16.509, 17.09, 17.67,
  18.274, 18.855, 19.458, 20.039, 20.619, 21.223, 21.804, 22.291, 22.779, 23.29, 23.847, 24.451, 25.054, 25.635,
  26.215, 26.796, 27.4, 28.003, 28.584, 29.164, 29.745, 30.348, 30.929, 31.509, 32.113, 32.694, 33.274, 33.855,
  34.458, 35.062, 35.643, 36.223, 36.804, 37.407, 37.988, 38.568, 39.172, 39.753, 40.333, 40.914, 41.517, 42.098,
];

export const FPS = 30;
/** The track kicks in. */
export const HIT = 15;
export const TOTAL = 1297;

/** Global frame of beat `index`. */
export const b = (index: number): number => Math.round(BEATS[index] * FPS);

const BEAT_FRAMES = BEATS.map((beat) => beat * FPS);

/** 1 on a beat, decaying before the next; quiet in the breaks. */
export const beatPulse = (frame: number, decay = 5): number => {
  if (frame < HIT || (frame > 125 && frame < 158) || (frame > 669 && frame < 725) || frame > 1245) {
    return 0;
  }
  let last = -Infinity;
  for (const beat of BEAT_FRAMES) {
    if (beat <= frame) {
      last = beat;
    } else {
      break;
    }
  }
  return Number.isFinite(last) ? Math.exp(-(frame - last) / decay) : 0;
};
