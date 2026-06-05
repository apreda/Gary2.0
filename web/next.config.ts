import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/changelog', destination: '/', permanent: true },
    ];
  },
};

export default nextConfig;
