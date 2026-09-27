import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Takrar · Quran Memorization',
    short_name: 'Takrar',
    description: 'A guided Quran memorization app with spaced repetition.',
    start_url: '/',
    display: 'standalone',
    background_color: '#FEFCF9',
    theme_color: '#1B4D5C',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      // Full-bleed with the artwork in the safe zone (scripts/generate-maskable-icons.mjs)
      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
