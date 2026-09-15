/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No server-side media handling — everything stays in the browser.
  // Static export is used where possible for the Vercel deploy (Phase 6);
  // left as the default (server) build for now so `next dev` works.
};

export default nextConfig;
