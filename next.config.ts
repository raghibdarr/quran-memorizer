import type { NextConfig } from "next";

// Static export: the SAME `out/` artifact is served by Netlify (web) and bundled
// inside the Capacitor shells (iOS/Android). Nothing may depend on a Node server —
// no middleware, API routes, server actions, or request-time rendering (M11a).
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
