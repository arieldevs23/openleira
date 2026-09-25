import { cn } from '@/shared/utils';

/*
 * Gothic ornaments (DESIGN.md §5). Every ornament is inline SVG, aria-hidden,
 * never catches pointer events and takes its opacity from --orn through the
 * .gothic-ornament class. They are allowed only on login/setup, splash,
 * empty states and the bottom app canvas; never behind transcripts, lists,
 * tables, code or anything that scrolls on its own.
 */

type OrnamentProps = {
  /** Positioning and size; the ornament itself is absolutely positioned. */
  className?: string;
};

/**
 * The cathedral rose window from the landing page, turning once every 120s
 * (stopped by prefers-reduced-motion). Used by the auth module (login, setup,
 * splash) and the onboarding module as the large backdrop behind the card.
 */
export function RoseWindowOrnament({ className }: OrnamentProps) {
  return (
    <div aria-hidden="true" className={cn('gothic-ornament gothic-rose-window', className)}>
      <svg viewBox="-320 -320 640 640" focusable="false">
        <defs>
          <g id="gothic-rw-petal">
            <path d="M0-60V-130M-22-130V-228A44 44 0 0 1 0-266A44 44 0 0 1 22-228V-130M0-266V-300" />
            <circle cy="-200" r="11" />
            <circle cy="-290" r="7" />
            <circle cx="56.6" cy="-284.4" r="5" />
            <path d="M-10-24V-44A20 20 0 0 1 0-61.3A20 20 0 0 1 10-44V-24" transform="rotate(11.25)" />
          </g>
          <g id="gothic-rw-quarter">
            <use href="#gothic-rw-petal" />
            <use href="#gothic-rw-petal" transform="rotate(22.5)" />
            <use href="#gothic-rw-petal" transform="rotate(45)" />
            <use href="#gothic-rw-petal" transform="rotate(67.5)" />
          </g>
        </defs>
        <g fill="none" stroke="currentColor" strokeWidth="1.3">
          <circle r="310" />
          <circle r="300" />
          <circle r="276" />
          <circle r="130" />
          <circle r="60" />
          <circle r="20" />
          <use href="#gothic-rw-quarter" />
          <use href="#gothic-rw-quarter" transform="rotate(90)" />
          <use href="#gothic-rw-quarter" transform="rotate(180)" />
          <use href="#gothic-rw-quarter" transform="rotate(270)" />
        </g>
      </svg>
    </div>
  );
}

/**
 * One thin, static ogival (pointed) arch placed behind an empty-state title.
 * Used by the project-workspace and sidebar modules for their empty states.
 */
export function OgivalArchOrnament({ className }: OrnamentProps) {
  return (
    <div aria-hidden="true" className={cn('gothic-ornament', className)}>
      <svg viewBox="0 0 200 240" preserveAspectRatio="xMidYMid meet" focusable="false">
        <g fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
          <path d="M10 239V120A95 110 0 0 1 100 6A95 110 0 0 1 190 120V239" />
          <path d="M30 239V124A75 92 0 0 1 100 30A75 92 0 0 1 170 124V239" />
          <circle cx="100" cy="92" r="22" />
          <circle cx="100" cy="92" r="8" />
          <path d="M100 70V114M78 92H122" />
        </g>
      </svg>
    </div>
  );
}
