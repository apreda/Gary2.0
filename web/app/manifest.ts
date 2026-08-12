import type { MetadataRoute } from 'next';

/**
 * Web app manifest — makes betwithgary.ai installable to the home screen.
 *
 * Aug 11 2026: the App Store route for 2.23 is blocked (Apple no longer accepts
 * gambling-adjacent apps from individual developer accounts — see the App Review
 * thread on app 6751238914). 2.22 stays live, but every future update is gated on
 * the company account. This manifest gives the web the one thing it was missing
 * versus the iOS app: an icon on the home screen that opens without browser
 * chrome. Nothing here depends on Apple.
 *
 * `display: standalone` + apple-mobile-web-app-capable (set in layout.tsx) is what
 * iOS Safari reads on "Add to Home Screen".
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Gary AI — Sports Predictions',
    short_name: 'Gary',
    description:
      'A pick for every game, every day — with the full written reasoning and every result on the public record.',
    start_url: '/',
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
