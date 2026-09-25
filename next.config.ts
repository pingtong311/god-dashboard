import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 實站（blackstockai.com）本身是 Next.js 且開著 trailingSlash: true
  // （實測 /learn → 301 → /learn/）。設為 true 後 next/link 會保留/補上尾斜線，
  // 底部列 5 個 href 才能在 render 期就帶 /today/ 等尾斜線，逐字對齊實站。
  trailingSlash: true,
  outputFileTracingRoot: process.cwd(),
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
