import { b } from './beats';

/** Where each part sits on the global timeline; parts overlap a little so text hands over without a cut. */
export const PART = {
  intro: { from: 0, length: 162 },
  rose: { from: 150, length: 158 },
  ask: { from: 296, length: 80 },
  flow: { from: 364, length: 294 },
  tension: { from: 648, length: 92 },
  drop: { from: 728, length: 362 },
  finale: { from: 1078, length: 219 },
} as const;

/** Local frame (inside `part`) of beat `index`. */
export const at = (part: keyof typeof PART, index: number): number => b(index) - PART[part].from;
