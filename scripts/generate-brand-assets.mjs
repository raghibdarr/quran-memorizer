#!/usr/bin/env node
// Every Takrar icon and splash, rendered from ONE vector mark (logo "2d", owner
// choice 2026-09-28): the letter ta (ت) as a wide bowl whose tip hooks up into a
// repeat arrow (takrar = repetition), two gold dots above. Change the mark here
// and re-run: node scripts/generate-brand-assets.mjs
//
// Writes: public/logos/takrar.svg (favicon + header), PWA + maskable + Apple
// touch icons, Android launcher (legacy, round, adaptive foreground) and splash
// screens at their existing sizes, the iOS app icon and splash.

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const TEAL = '#1B4D5C';
const CREAM = '#F3E7CF';
const GOLD = '#C8963E';
const PAPER = '#FEFCF9'; // app background (capacitor.config backgroundColor)

// The mark, in a 120×120 tile's coordinates, optically centred
const MARK = `
  <g transform="translate(0 2)">
    <path d="M24.55 55.83 A36 24 0 1 0 91.18 48" fill="none" stroke="${CREAM}" stroke-width="7" stroke-linecap="round"/>
    <path d="M85.3 41.2 L96.7 44.5 L86.9 53.1 Z" fill="${CREAM}" stroke="${CREAM}" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="53" cy="37" r="5" fill="${GOLD}"/>
    <circle cx="67" cy="37" r="5" fill="${GOLD}"/>
  </g>`;

const scaled = (s) => `<g transform="translate(60 60) scale(${s}) translate(-60 -60)">${MARK}</g>`;
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">${body}</svg>`;

/** Rounded tile (transparent corners) — favicon, header, PWA "any" icons, legacy launcher */
export const TILE_SVG = svg(`<rect width="120" height="120" rx="28" fill="${TEAL}"/>${MARK}`);
/** Full-bleed square — for platforms that apply their own mask (maskable, iOS, Apple touch) */
const fullBleed = (markScale) => svg(`<rect width="120" height="120" fill="${TEAL}"/>${scaled(markScale)}`);
const round = svg(`<circle cx="60" cy="60" r="60" fill="${TEAL}"/>${scaled(0.86)}`);
/** Adaptive-icon foreground: mark only, inside the 66/108 safe zone */
const foreground = svg(scaled(0.7));

const png = (svgText, size) => sharp(Buffer.from(svgText), { density: Math.max(72, (size / 120) * 72 * 2) }).resize(size, size);
const out = async (file, buf) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await buf.toFile(file);
  console.log('wrote', file);
};

// Web
fs.mkdirSync('public/logos', { recursive: true });
fs.writeFileSync('public/logos/takrar.svg', TILE_SVG.replace('<svg ', '<svg role="img" aria-label="Takrar" '));
console.log('wrote public/logos/takrar.svg');
await out('public/icons/icon-192.png', png(TILE_SVG, 192));
await out('public/icons/icon-512.png', png(TILE_SVG, 512));
await out('public/icons/icon-maskable-192.png', png(fullBleed(0.8), 192));
await out('public/icons/icon-maskable-512.png', png(fullBleed(0.8), 512));
await out('public/icons/apple-touch-icon.png', png(fullBleed(0.9), 180).flatten({ background: TEAL }));

// Android launcher
const RES = 'android/app/src/main/res';
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(DENSITIES)) {
  await out(`${RES}/mipmap-${d}/ic_launcher.png`, png(TILE_SVG, Math.round(48 * k)));
  await out(`${RES}/mipmap-${d}/ic_launcher_round.png`, png(round, Math.round(48 * k)));
  await out(`${RES}/mipmap-${d}/ic_launcher_foreground.png`, png(foreground, Math.round(108 * k)));
}
fs.writeFileSync(`${RES}/values/ic_launcher_background.xml`,
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${TEAL}</color>\n</resources>\n`);
console.log(`wrote ${RES}/values/ic_launcher_background.xml`);

// Splash screens: the tile centred on the app's paper colour, at each existing size
const splash = async (file) => {
  const { width, height } = await sharp(file).metadata();
  const tile = Math.round(Math.min(width, height) * 0.24);
  const tilePng = await png(TILE_SVG, tile).png().toBuffer();
  const buf = sharp({ create: { width, height, channels: 3, background: PAPER } }).composite([{ input: tilePng, gravity: 'center' }]).png();
  await out(file, buf);
};
for (const dir of fs.readdirSync(RES).filter((d) => d.startsWith('drawable'))) {
  const file = `${RES}/${dir}/splash.png`;
  if (fs.existsSync(file)) await splash(file);
}

// iOS (the App Store rejects icons with transparency)
const IOS = 'ios/App/App/Assets.xcassets';
await out(`${IOS}/AppIcon.appiconset/AppIcon-512@2x.png`, png(fullBleed(0.9), 1024).flatten({ background: TEAL }));
for (const f of fs.readdirSync(`${IOS}/Splash.imageset`).filter((f) => f.endsWith('.png'))) {
  await splash(`${IOS}/Splash.imageset/${f}`);
}
