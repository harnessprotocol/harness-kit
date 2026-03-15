import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Proxy API calls to board-server in dev
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `http://localhost:${process.env.BOARD_PORT ?? 4800}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
