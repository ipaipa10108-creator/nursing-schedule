import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    unoptimized: true, // Vercel 免費方案不需要 image optimization
  },
};

export default nextConfig;
