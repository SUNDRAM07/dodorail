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
  // Keep Prisma out of Next's bundle. Required so Vercel copies the Prisma
  // Query Engine native binary (`libquery_engine-rhel-openssl-3.0.x.so.node`)
  // alongside the function instead of Next trying to bundle it. Without this,
  // runtime throws `PrismaClientInitializationError: Could not locate Query Engine`.
  // Ref: https://pris.ly/d/engine-not-found-nextjs
  serverExternalPackages: ["@prisma/client", "@prisma/engines", "prisma"],
  // Force Next's file-tracer to include Prisma's generated client + the native
  // engine binary. In a pnpm monorepo the generated client lives inside the
  // hoisted `.pnpm` store; without these globs Vercel's function bundle misses
  // the `.so.node` file and Prisma initialisation fails at runtime.
  outputFileTracingIncludes: {
    "/api/**/*": [
      "../../node_modules/.pnpm/@prisma+client@**/node_modules/.prisma/client/**/*",
      "../../node_modules/.pnpm/@prisma+client@**/node_modules/@prisma/client/**/*",
      "../../node_modules/.pnpm/@prisma+engines@**/node_modules/@prisma/engines/**/*",
      "../../node_modules/.prisma/client/**/*",
    ],
    "/**/*": [
      "../../node_modules/.pnpm/@prisma+client@**/node_modules/.prisma/client/**/*",
      "../../node_modules/.prisma/client/**/*",
    ],
  },
  outputFileTracingRoot: require("path").join(__dirname, "../../"),
  // Mark WalletConnect's optional / Node-only transitive deps as externals so
  // webpack stops trying to bundle them into the client chunks.
  // `pino-pretty` is a dev-only peer of `pino`; `lokijs` / `encoding` are
  // optional deps that log warnings on bundle; all are safe to externalize.
  webpack: (config) => {
    config.externals = config.externals || [];
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};

export default nextConfig;
