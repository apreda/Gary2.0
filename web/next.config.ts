import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Match the small fixed artwork used throughout the desk so 2x screens do
    // not jump from a 72/110px display all the way to a 256/384px candidate.
    imageSizes: [32, 48, 64, 72, 96, 100, 110, 128, 140, 144, 200, 220, 256, 280, 384],
  },
  async redirects() {
    return [
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
