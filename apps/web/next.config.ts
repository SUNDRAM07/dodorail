import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Transpile workspace packages so Next can import their TS directly.
  transpilePackages: [
    "@dodorail/db",
    "@dodorail/sdk",
    "@dodorail/ui",
    "@dodorail/dodo",
  ],
  // Expose build metadata to the client for the footer + /api/health.
  env: {
    NEXT_PUBLIC_BUILD_VERSION: process.env.NEXT_PUBLIC_BUILD_VERSION ?? "0.1.0",
    NEXT_PUBLIC_GIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_GIT_SHA ?? "dev",
  },
  experimental: {
    // Server Actions are stable in 15 but opt-in for body-size tweaks.
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
