/**
 * Generate PWA icons from SVG source.
 * Run: node scripts/generate-icons.mjs
 */
import sharp from 'sharp';
import { mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SOURCE = join(ROOT, 'public/logos/light-88.svg');
const OUT_DIR = join(ROOT, 'public/icons');

await mkdir(OUT_DIR, { recursive: true });

const sizes = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
];

for (const { name, size } of sizes) {
  await sharp(SOURCE)
    .resize(size, size)
    .png()
    .toFile(join(OUT_DIR, name));
  console.log(`Generated ${name} (${size}x${size})`);
}

// Maskable icon: add 20% padding (safe zone) with cream background
const maskableSize = 192;
const innerSize = Math.round(maskableSize * 0.8);
const padding = Math.round((maskableSize - innerSize) / 2);

const inner = await sharp(SOURCE)
  .resize(innerSize, innerSize)
  .png()
  .toBuffer();

await sharp({
  create: {
    width: maskableSize,
    height: maskableSize,
    channels: 4,
    background: { r: 254, g: 252, b: 249, alpha: 1 }, // #FEFCF9 cream
  },
})
  .composite([{ input: inner, left: padding, top: padding }])
  .png()
  .toFile(join(OUT_DIR, 'icon-maskable-192.png'));
console.log(`Generated icon-maskable-192.png (${maskableSize}x${maskableSize} with safe zone)`);

console.log('Done!');
