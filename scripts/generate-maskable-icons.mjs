#!/usr/bin/env node
// Maskable PWA icons (M6): a maskable icon must be FULL-BLEED (no transparent
// corners — launchers apply their own circle/squircle mask) with the artwork
// inside the central safe zone (a circle of 40% radius). Built from
// public/icons/icon-512.png: its rounded-corner card is flattened onto the
// paper colour, and the artwork is scaled into the safe zone.
// Usage: node scripts/generate-maskable-icons.mjs

import sharp from 'sharp';

const SRC = 'public/icons/icon-512.png';
const ARTWORK_SCALE = 0.72; // of the canvas — keeps the arch's corners inside the safe circle

const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
// Paper colour: sampled from the card's opaque interior near the top edge
const at = (x, y) => {
  const i = (y * info.width + x) * info.channels;
  return { r: data[i], g: data[i + 1], b: data[i + 2] };
};
const paper = at(Math.round(info.width / 2), 12);

for (const size of [192, 512]) {
  const art = Math.round(size * ARTWORK_SCALE);
  const artwork = await sharp(SRC).resize(art, art).toBuffer();
  await sharp({ create: { width: size, height: size, channels: 3, background: paper } })
    .composite([{ input: artwork, gravity: 'center' }])
    .png()
    .toFile(`public/icons/icon-maskable-${size}.png`);
  console.log(`wrote public/icons/icon-maskable-${size}.png (paper rgb(${paper.r},${paper.g},${paper.b}))`);
}
