/**
 * Beat map of public/music.mp3, detected with librosa (≈112 BPM).
 * Seconds; every fourth beat from the first is a bar start.
 * The music fades out by 25.0 s, is silent until the hit at 26.33 s, and is
 * silent again after 27.1 s.
 */
export const BEATS = [
  0.116, 0.697, 1.324, 1.811, 2.299, 2.856, 3.413, 3.971, 4.528, 5.085, 5.642, 6.246, 6.85, 7.361, 7.895, 8.429,
  8.986, 9.543, 10.077, 10.612, 11.169, 11.773, 12.376, 12.957, 13.491, 14.025, 14.559, 15.139, 15.673, 16.277,
  16.811, 17.369, 17.856, 18.39, 18.947, 19.505, 20.039, 20.573, 21.13, 21.687, 22.221, 22.756, 23.29, 23.847,
  24.381, 24.892,
];

export const FPS = 30;

/** The loudest moment of the song, after the silence. */
export const HIT_SECONDS = 26.33;

/** Global frame of beat `index`. */
export const beatFrame = (index: number): number => Math.round(BEATS[index] * FPS);

export const HIT_FRAME = Math.round(HIT_SECONDS * FPS);

/** Global start frame of every scene; each one starts on a beat (or on the hit). */
export const SCENE_START = {
  rose: 0,
  statement: beatFrame(8),
  team: beatFrame(16),
  handOut: beatFrame(24),
  flow: beatFrame(32),
  words: beatFrame(40),
  pause: 750,
  hit: HIT_FRAME,
} as const;

/** The song is 30.4 s long. */
export const TOTAL_FRAMES = 912;

const BEAT_FRAMES = BEATS.map((beat) => beat * FPS);

/**
 * 1 on a beat, decaying towards 0 before the next one: drives small glows and
 * pulses. Zero once the music has stopped.
 */
export const beatPulse = (globalFrame: number, decay = 5): number => {
  let last = -Infinity;
  for (const beat of BEAT_FRAMES) {
    if (beat <= globalFrame) {
      last = beat;
    } else {
      break;
    }
  }
  if (!Number.isFinite(last) || globalFrame > 25 * FPS) {
    return 0;
  }
  return Math.exp(-(globalFrame - last) / decay);
};
