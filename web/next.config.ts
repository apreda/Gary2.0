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
      { source: '/record', destination: '/results', permanent: true },
      { source: '/changelog', destination: '/', permanent: true },
      { source: '/picks/world-cup', destination: '/results/world-cup', permanent: true },
    ];
  },
  async headers() {
    const noIndex = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }];
    const tokenPage = [
      ...noIndex,
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
    ];
    return [
      { source: '/api/:path*', headers: noIndex },
      { source: '/auth/:path*', headers: noIndex },
      { source: '/email/confirm', headers: tokenPage },
      { source: '/email/unsubscribe', headers: tokenPage },
    ];
  },
};

export default nextConfig;
