import { SITE_NAME, SHORT_DESCRIPTION, THEME } from '@/lib/site';

export default function manifest() {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME.length > 12 ? SITE_NAME.split(' ')[0] : SITE_NAME,
    description: SHORT_DESCRIPTION,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: THEME.background,
    theme_color: THEME.background,
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/icon/small', sizes: '192x192', type: 'image/png' },
      { src: '/icon/large', sizes: '512x512', type: 'image/png' },
      { src: '/icon/maskable', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
