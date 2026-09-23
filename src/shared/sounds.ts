import { readStoredUiPreferences } from '@/shared/uiPreferences';

/**
 * iMessage-flavoured send/receive cues, synthesized with the Web Audio API so
 * no recorded (copyrighted) audio ships with the app.
 *
 * Autoplay policy: the AudioContext is only created inside the first user
 * gesture. Until then both cues are silent no-ops, so nothing is ever logged
 * about a context that was not allowed to start.
 */

/** Peak gain for both cues; quiet on purpose so they never compete with the content. */
const PEAK_GAIN = 0.15;

const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const;

let audioContext: AudioContext | null = null;
let unlockListenersInstalled = false;

const getAudioContextConstructor = (): typeof AudioContext | undefined => {
  if (typeof window === 'undefined') return undefined;
  return window.AudioContext
    || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
};

/** Creates (or resumes) the context from inside a user gesture, then stops listening. */
const unlockAudio = (): void => {
  const AudioContextConstructor = getAudioContextConstructor();
  if (!AudioContextConstructor) return;

  try {
    if (!audioContext) {
      audioContext = new AudioContextConstructor();
    }
    if (audioContext.state === 'suspended') {
      void audioContext.resume().catch(() => undefined);
    }
  } catch {
    audioContext = null;
    return;
  }

  for (const eventName of UNLOCK_EVENTS) {
    window.removeEventListener(eventName, unlockAudio, true);
  }
};

/**
 * Called once by App on mount. Capture-phase listeners run before React's own
 * handlers, so the context already exists when a gesture triggers `playSendSound`.
 */
export const installSoundUnlock = (): void => {
  if (unlockListenersInstalled || typeof window === 'undefined') return;
  unlockListenersInstalled = true;

  for (const eventName of UNLOCK_EVENTS) {
    window.addEventListener(eventName, unlockAudio, { capture: true, passive: true });
  }
};

/** Returns a running context when sound effects are on and audio has been unlocked. */
const getPlayableContext = (): AudioContext | null => {
  if (!readStoredUiPreferences().soundEffects) return null;
  if (!audioContext || audioContext.state === 'closed') return null;
  if (audioContext.state === 'suspended') {
    // A backgrounded tab can suspend the context; resuming may still be refused.
    void audioContext.resume().catch(() => undefined);
  }
  return audioContext;
};

/** Short rising swoosh (~150ms): band-passed noise sweeping upward plus a faint rising sine. */
export const playSendSound = (): void => {
  const context = getPlayableContext();
  if (!context) return;

  try {
    const now = context.currentTime;
    const duration = 0.15;

    const noiseBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    for (let i = 0; i < samples.length; i += 1) {
      samples[i] = Math.random() * 2 - 1;
    }

    const noise = context.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.setValueAtTime(1.2, now);
    filter.frequency.setValueAtTime(500, now);
    filter.frequency.exponentialRampToValueAtTime(4000, now + duration);

    const noiseGain = context.createGain();
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.exponentialRampToValueAtTime(PEAK_GAIN, now + 0.04);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(context.destination);

    const tone = context.createOscillator();
    tone.type = 'sine';
    tone.frequency.setValueAtTime(420, now);
    tone.frequency.exponentialRampToValueAtTime(1300, now + duration);

    const toneGain = context.createGain();
    toneGain.gain.setValueAtTime(0.0001, now);
    toneGain.gain.exponentialRampToValueAtTime(PEAK_GAIN * 0.35, now + 0.03);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    tone.connect(toneGain);
    toneGain.connect(context.destination);

    noise.start(now);
    noise.stop(now + duration + 0.02);
    tone.start(now);
    tone.stop(now + duration + 0.02);
  } catch {
    // Sound is decorative; a failure here must never surface to the user.
  }
};

/** One soft sine "pop" with a quick attack and exponential decay. */
const scheduleBlip = (context: AudioContext, frequency: number, startsAt: number, duration: number): void => {
  const oscillator = context.createOscillator();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, startsAt);

  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, startsAt);
  gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, startsAt + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + duration);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startsAt);
  oscillator.stop(startsAt + duration + 0.02);
};

/** Soft two-note ding (~200ms), played once when an assistant reply finishes. */
export const playReceiveSound = (): void => {
  const context = getPlayableContext();
  if (!context) return;

  try {
    const now = context.currentTime;
    scheduleBlip(context, 1175, now, 0.09); // D6
    scheduleBlip(context, 1568, now + 0.08, 0.12); // G6
  } catch {
    // Sound is decorative; a failure here must never surface to the user.
  }
};

/** Reports whether the receive cue will stand in for the generic completion chime. */
export const isSoundEffectsEnabled = (): boolean => readStoredUiPreferences().soundEffects;
