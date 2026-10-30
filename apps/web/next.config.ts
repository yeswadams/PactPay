import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@pactpay/blockchain", "@pactpay/database"],
  outputFileTracingIncludes: {
    "/api/v1/*": ["../../packages/blockchain/deployments/*.json"],
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
