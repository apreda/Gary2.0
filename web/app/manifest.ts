import type { MetadataRoute } from 'next';

/**
 * Web app manifest — makes betwithgary.ai installable to the home screen.
 *
 * `display: standalone` + apple-mobile-web-app-capable (set in layout.tsx) is what
 * iOS Safari reads on "Add to Home Screen".
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Gary AI — Sports Predictions',
    short_name: 'Gary',
    description:
      'Gary’s free game picks and player props, his best bets in Winners, and insights and betting connections in the Hub.',
    start_url: '/today',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0A0908',
    theme_color: '#0A0908',
    categories: ['sports', 'news'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
