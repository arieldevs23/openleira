#!/usr/bin/env node
/**
 * Regenerates every OpenLeira logo asset from the black-rose source image
 * (`public/rose.webp`, the same art the landing page uses).
 *
 *   node scripts/generate-rose-icons.mjs
 *
 * Outputs:
 * - public/favicon.png (32), public/favicon.ico (16/32/48), public/favicon.svg
 * - public/apple-touch-icon.png (180, opaque)
 * - public/logo-{32,64,128,256,512}.png and public/logo.svg (transparent mark)
 * - public/icons/icon-<n>x<n>.png|svg and icon-template.svg (opaque PWA icons,
 *   rose inside the maskable safe zone on the dark `--bg` colour)
 * - electron/assets/logo-windows.ico
 *
 * The macOS .icns/.png pair is produced by electron/scripts/generate-macos-icon.js,
 * which renders the same opaque tile through `renderOpaqueRose` below.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'public', 'rose.webp');

/** Dark-mode `--bg` from docs/DESIGN.md; the PWA tile colour in both modes. */
const TILE_BACKGROUND = '#0A0A0B';
/** Maskable icons must keep their content inside the central 80% circle. */
const SAFE_ZONE = 0.78;
const PWA_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const LOGO_SIZES = [32, 64, 128, 256, 512];

/**
 * The source art sits on a soft grey square. The landing page hides that square
 * with `mask-image: radial-gradient(closest-side, #000 58%, transparent 98%)`;
 * the same mask is baked into every generated icon so the rose floats free.
 */
function radialMask(size) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <defs><radialGradient id="m" cx="50%" cy="50%" r="50%">
    <stop offset="58%" stop-color="#fff" stop-opacity="1"/>
    <stop offset="98%" stop-color="#fff" stop-opacity="0"/>
  </radialGradient></defs>
  <rect width="${size}" height="${size}" fill="url(#m)"/>
</svg>`);
}

/** The masked rose at `size`, transparent around it. */
async function maskedRose(size) {
  return sharp(SOURCE)
    .resize(size, size)
    .ensureAlpha()
    .composite([{ input: radialMask(size), blend: 'dest-in' }])
    .png()
    .toBuffer();
}

/** The rose on a transparent background. */
export function renderTransparentRose(size) {
  return maskedRose(size);
}

/** The rose centred inside the maskable safe zone on an opaque dark tile. */
export async function renderOpaqueRose(size) {
  const inner = Math.round(size * SAFE_ZONE);
  const rose = await maskedRose(inner);
  return sharp({
    create: { width: size, height: size, channels: 4, background: TILE_BACKGROUND },
  })
    .composite([{ input: rose, gravity: 'center' }])
    .png()
    .toBuffer();
}

/** Wraps a PNG in an SVG shell so `.svg` icon URLs keep working. */
function svgWrapping(png, size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <title>OpenLeira</title>
  <image width="${size}" height="${size}" xlink:href="data:image/png;base64,${png.toString('base64')}"/>
</svg>
`;
}

/** Builds a Windows .ico whose entries are embedded PNGs (supported since Vista). */
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  const directory = Buffer.alloc(16 * entries.length);
  let offset = 6 + directory.length;
  entries.forEach(({ size, png }, index) => {
    const base = index * 16;
    directory.writeUInt8(size >= 256 ? 0 : size, base);
    directory.writeUInt8(size >= 256 ? 0 : size, base + 1);
    directory.writeUInt8(0, base + 2);
    directory.writeUInt8(0, base + 3);
    directory.writeUInt16LE(1, base + 4);
    directory.writeUInt16LE(32, base + 6);
    directory.writeUInt32LE(png.length, base + 8);
    directory.writeUInt32LE(offset, base + 12);
    offset += png.length;
  });
  return Buffer.concat([header, directory, ...entries.map((entry) => entry.png)]);
}

async function write(relativePath, content) {
  await fs.writeFile(path.join(ROOT, relativePath), content);
  console.log(`wrote ${relativePath}`);
}

async function main() {
  await write('public/favicon.png', await renderTransparentRose(32));
  await write('public/favicon.svg', svgWrapping(await renderTransparentRose(64), 64));
  await write('public/favicon.ico', buildIco(await Promise.all(
    [16, 32, 48].map(async (size) => ({ size, png: await renderTransparentRose(size) })),
  )));
  await write('public/apple-touch-icon.png', await renderOpaqueRose(180));

  for (const size of LOGO_SIZES) {
    await write(`public/logo-${size}.png`, await renderTransparentRose(size));
  }
  await write('public/logo.svg', svgWrapping(await renderTransparentRose(256), 256));

  for (const size of PWA_SIZES) {
    const png = await renderOpaqueRose(size);
    await write(`public/icons/icon-${size}x${size}.png`, png);
    await write(`public/icons/icon-${size}x${size}.svg`, svgWrapping(png, size));
  }
  await write('public/icons/icon-template.svg', svgWrapping(await renderOpaqueRose(512), 512));

  await write('electron/assets/logo-windows.ico', buildIco(await Promise.all(
    [16, 24, 32, 48, 64, 128, 256].map(async (size) => ({ size, png: await renderOpaqueRose(size) })),
  )));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
