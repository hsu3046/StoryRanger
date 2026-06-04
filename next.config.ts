import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable Next.js's built-in gzip compression. Compression layers
  // buffer their output before flushing, which collapses our SSE
  // streaming (the dialogue route) into a single end-of-stream payload.
  // Static assets are served straight; the dev hot-path doesn't need
  // compression anyway, and prod typically sits behind a CDN that handles
  // it more controllably.
  compress: false,

  // The admin generate route is a Server Component that pulls in _lib helpers
  // (resolveAsset / contentFs / saveImage) which fs-read from
  // `process.cwd()/public` via dynamically-built paths. Next's file tracer
  // can't resolve those statically, so it conservatively bundles the ENTIRE
  // ~372 MB public media tree into this one lambda — pushing it past Vercel's
  // 300 MB function limit (it measured 364 MB). The generate flow creates NEW
  // content and serves previews from the CDN/R2 in the browser; it never needs
  // the existing static art catalog inside its bundle. Exclude the heavy media
  // from THIS route's trace only. Static serving is a separate Vercel layer
  // (unaffected), and every other route — notably /play, which fs-reads
  // public/stories/*/audio + map at runtime for BGM/map detection — keeps its
  // full trace. Globs are listed explicitly (not braces) to avoid any
  // picomatch brace-expansion ambiguity in the tracer.
  outputFileTracingExcludes: {
    "/admin/generate/**": [
      "public/**/*.jpeg",
      "public/**/*.jpg",
      "public/**/*.png",
      "public/**/*.webp",
      "public/**/*.mp3",
      "public/**/*.wav",
      "public/**/*.ogg",
      "public/**/*.m4a",
    ],
  },
};

export default nextConfig;
