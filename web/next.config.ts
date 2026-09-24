import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Match the small fixed artwork used throughout the desk so 2x screens do
    // not jump from a 72/110px display all the way to a 256/384px candidate.
    imageSizes: [32, 48, 64, 72, 96, 100, 110, 128, 140, 144, 200, 220, 256, 280, 384],
  },
  async rewrites() {
    // Preserve submitted URLs. Generate database inventories on the first
    // request with ISR, so an unavailable database cannot break a deployment.
    return [
      { source: '/archive/sitemap.xml', destination: '/sitemap-data/archive' },
      { source: '/archive/inventory.xml', destination: '/sitemap-data/archive' },
      { source: '/sitemap-index.xml', destination: '/sitemap-data/index' },
      { source: '/picks/sitemap/:id.xml', destination: '/sitemap-data/games-:id' },
    ];
  },
  async redirects() {
    return [
      // betwithgary.com is a legacy alias attached to the same deployment. Google
      // saw both hosts answer 200; only the .ai canonical tag separated them.
      { source: '/:path*', has: [{ type: 'host', value: 'betwithgary.com' }], destination: 'https://www.betwithgary.ai/:path*', permanent: true },
      { source: '/:path*', has: [{ type: 'host', value: 'www.betwithgary.com' }], destination: 'https://www.betwithgary.ai/:path*', permanent: true },
      { source: '/record', destination: '/results', permanent: true },
      { source: '/changelog', destination: '/', permanent: true },
      { source: '/picks/world-cup', destination: '/results/world-cup', permanent: true },
      // The Hub left the app Sep 24 2026; its research lives on each game page.
      { source: '/hub', destination: '/picks', permanent: true },
    ];
  },
  async headers() {
    const noIndex = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }];
    // Public boards are identical for every visitor; signed-in details hydrate in
    // the browser. Keep browsers on Next's conservative policy while allowing
    // Vercel's edge to absorb repeat crawler traffic and serve a warm response
    // through a short upstream interruption.
    const publicHtml = [{
      key: 'Vercel-CDN-Cache-Control',
      value: 'public, max-age=300, stale-while-revalidate=3600, stale-if-error=86400',
    }];
    const tokenPage = [
      ...noIndex,
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
    ];
    return [
      { source: '/', headers: publicHtml },
      { source: '/today', headers: publicHtml },
      { source: '/picks', headers: publicHtml },
      { source: '/picks/:sport', headers: publicHtml },
      { source: '/picks/:sport/:date', headers: publicHtml },
      { source: '/picks/:sport/:date/:game', headers: publicHtml },
      { source: '/props', headers: publicHtml },
      { source: '/props/:lane', headers: publicHtml },
      { source: '/results', headers: publicHtml },
      { source: '/results/:sport', headers: publicHtml },
      { source: '/archive', headers: publicHtml },
      { source: '/archive/:path*', headers: publicHtml },
      { source: '/leaderboard', headers: publicHtml },
      { source: '/api/:path*', headers: noIndex },
      { source: '/auth/:path*', headers: noIndex },
      { source: '/email/confirm', headers: tokenPage },
      { source: '/email/unsubscribe', headers: tokenPage },
    ];
  },
};

export default nextConfig;
