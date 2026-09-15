/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No server-side media handling — everything stays in the browser.
  // Static export is used where possible for the Vercel deploy (Phase 6);
  // left as the default (server) build for now so `next dev` works.

  // The workspace packages are consumed as TypeScript source and use ESM-style
  // ".js" specifiers internally, so webpack must resolve "./x.js" to "./x.ts".
  webpack(config) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
  turbopack: {
    resolveExtensions: [".ts", ".tsx", ".mjs", ".js", ".jsx", ".mts", ".json"],
  },
};

export default nextConfig;
