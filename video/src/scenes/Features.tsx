import type { ReactNode } from 'react';
import { AbsoluteFill } from 'remotion';

import { DotGrid, Reveal } from '../parts';
import { C, FONT } from '../theme';

const icon = (children: ReactNode) => (
  <svg width={44} height={44} viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

const FEATURES = [
  {
    title: 'Self-hosted',
    body: 'Runs on your own server or VPS. Your code, your keys, your folder.',
    icon: icon(<><rect x={3} y={4} width={18} height={7} rx={1.5} /><rect x={3} y={13} width={18} height={7} rx={1.5} /><path d="M7 7.5h.01M7 16.5h.01" /></>),
  },
  {
    title: 'Audit before done',
    body: 'A QA agent checks every result and sends it back with notes when it fails.',
    icon: icon(<><path d="M12 3 4 6v6c0 4.5 3.4 7.7 8 9 4.6-1.3 8-4.5 8-9V6z" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>),
  },
  {
    title: 'Git & GitHub',
    body: 'Start from a repo, then fetch, pull and push with your stored token or SSH.',
    icon: icon(<><circle cx={6} cy={6} r={2.2} /><circle cx={6} cy={18} r={2.2} /><circle cx={18} cy={9} r={2.2} /><path d="M6 8.2v7.6M18 11.2c0 3-3 3.8-6 3.8H8.2" /></>),
  },
  {
    title: 'Live results',
    body: 'Status on every node, changed files, token usage, and a zip of the result.',
    icon: icon(<><path d="M3 20h18" /><path d="M6 16V10M11 16V5M16 16v-8M21 16v-3" /></>),
  },
];

/** Four cards: what else comes with the workspace. */
export function Features() {
  return (
    <AbsoluteFill style={{ background: C.bg, alignItems: 'center', justifyContent: 'center' }}>
      <DotGrid opacity={0.3} />
      <Reveal from={2}>
        <div style={{ fontFamily: FONT.title, fontWeight: 700, fontSize: 64, color: C.text, textAlign: 'center', marginBottom: 56 }}>
          Everything around the work.
        </div>
      </Reveal>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 380px)', gap: 28 }}>
        {FEATURES.map((feature, index) => (
          <Reveal key={feature.title} from={14 + index * 8}>
            <div style={{ height: 300, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 32, boxSizing: 'border-box', fontFamily: FONT.ui }}>
              {feature.icon}
              <div style={{ fontSize: 30, fontWeight: 600, color: C.text, marginTop: 26 }}>{feature.title}</div>
              <div style={{ fontSize: 21, lineHeight: 1.5, color: C.textDim, marginTop: 12 }}>{feature.body}</div>
            </div>
          </Reveal>
        ))}
      </div>
    </AbsoluteFill>
  );
}
