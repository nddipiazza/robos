import { SITE_NAME_ASCII, SHORT_DESCRIPTION } from '@/lib/site';

export default function manifest() {
  return {
    name: `${SITE_NAME_ASCII} — Buddy Gigs for local bands`,
    short_name: SITE_NAME_ASCII,
    description: SHORT_DESCRIPTION,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0c0a12',
    theme_color: '#0c0a12',
    categories: ['music', 'social', 'entertainment'],
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
