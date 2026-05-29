import type { NextConfig } from "next";
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/ruralcaixa-mvp-production\.up\.railway\.app\/.*/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-cache',
        expiration: { maxEntries: 200, maxAgeSeconds: 24 * 60 * 60 },
        networkTimeoutSeconds: 10,
      },
    },
    {
      urlPattern: /\.(?:png|jpg|jpeg|svg|gif|ico|webp)$/,
      handler: 'CacheFirst',
      options: { cacheName: 'image-cache', expiration: { maxEntries: 50, maxAgeSeconds: 7 * 24 * 60 * 60 } },
    },
  ],
});

const nextConfig: NextConfig = withPWA({
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [{ key: "X-Robots-Tag", value: "all" }],
      },
    ];
  },
});

export default nextConfig;
