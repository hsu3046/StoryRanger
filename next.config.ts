import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable Next.js's built-in gzip compression. Compression layers
  // buffer their output before flushing, which collapses our SSE
  // streaming (the dialogue route) into a single end-of-stream payload.
  // Static assets are served straight; the dev hot-path doesn't need
  // compression anyway, and prod typically sits behind a CDN that handles
  // it more controllably.
  compress: false,
};

export default nextConfig;
