#!/usr/bin/env node
/**
 * WCAG contrast check for the gothic theme token pairs the app actually uses
 * (docs/DESIGN.md §8). Reads the token values straight from src/index.css so
 * the check follows the single source of truth.
 *
 *   node scripts/check-theme-contrast.mjs
 *
 * Exits non-zero when a pair fails: 4.5:1 for text, 3:1 for large text and
 * graphics (borders of inputs, focus ring, status marks).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(ROOT, 'src/index.css'), 'utf8');

/** Pulls `--name: value;` declarations out of the first block matching `selector {`. */
function readBlock(selector) {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`missing ${selector}`);
  const end = css.indexOf('\n  }', start);
  const tokens = {};
  for (const match of css.slice(start, end).matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    tokens[match[1]] = match[2].trim();
  }
  return tokens;
}

const dark = readBlock(':root');
const light = { ...dark, ...readBlock(':root[data-theme="light"]') };

function parse(value, tokens, backdrop) {
  const ref = value.match(/^var\(--([\w-]+)\)$/);
  if (ref) return parse(tokens[ref[1]], tokens, backdrop);
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgba = value.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
  if (rgba) {
    const [r, g, b, a] = rgba.slice(1).map(Number);
    const under = backdrop ?? [0, 0, 0];
    return [r, g, b].map((c, i) => Math.round(c * a + under[i] * (1 - a)));
  }
  throw new Error(`cannot parse colour ${value}`);
}

const luminance = ([r, g, b]) => {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// [foreground token, background token, minimum ratio, what uses it, modes?]
const PAIRS = [
  ['text', 'bg', 4.5, 'body text on the app background'],
  ['text', 'surface', 4.5, 'text in sidebar, panels, cards, modals'],
  ['text', 'surface-2', 4.5, 'text in inputs, assistant bubbles, code blocks'],
  ['text', 'surface-3', 4.5, 'selected rows, tooltips'],
  ['text-dim', 'surface', 4.5, 'secondary text on panels'],
  ['text-dim', 'surface-2', 4.5, 'secondary text on inputs'],
  ['muted', 'bg', 4.5, 'metadata on the background'],
  ['muted', 'surface', 4.5, 'metadata, timestamps, labels on panels'],
  // Light mode swaps muted text on --surface-2 for --text-dim (see the
  // "Contrast by usage" rule in src/index.css), so this pair is dark-only.
  ['muted', 'surface-2', 4.5, 'placeholders and meta inside inputs and bubbles', ['dark']],
  ['on-accent', 'accent', 4.5, 'primary button label, user bubble text'],
  ['accent', 'surface', 3, 'focus ring, active icons on panels'],
  ['accent', 'bg', 3, 'focus ring on the background'],
  ['ok', 'surface', 4.5, 'ok status text'],
  ['warn', 'surface', 4.5, 'warning status text'],
  ['err', 'surface', 4.5, 'error text'],
  ['err', 'surface-2', 4.5, 'error text inside inputs/cards'],
  ['info', 'surface', 4.5, 'info text'],
  ['run', 'surface', 3, 'running status ring'],
  ['on-status', 'ok', 4.5, 'text on a solid ok fill'],
  ['on-status', 'warn', 4.5, 'text on a solid warn fill'],
  ['on-status', 'err', 4.5, 'text on a solid err fill (delete confirmation)'],
  ['term-fg', 'term-bg', 4.5, 'terminal text'],
];

let failures = 0;
for (const [mode, tokens] of [['dark', dark], ['light', light]]) {
  console.log(`\n${mode} mode`);
  for (const [fg, bg, min, use, modes] of PAIRS) {
    if (modes && !modes.includes(mode)) continue;
    const background = parse(tokens[bg], tokens);
    const foreground = parse(tokens[fg], tokens, background);
    const value = ratio(foreground, background);
    const ok = value >= min;
    if (!ok) failures += 1;
    console.log(`${ok ? 'pass' : 'FAIL'}  ${value.toFixed(2).padStart(5)}:1 (min ${min})  --${fg} on --${bg}  ${use}`);
  }
}

console.log(failures ? `\n${failures} failing pair(s)` : '\nall pairs pass');
process.exitCode = failures ? 1 : 0;
