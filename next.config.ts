import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable Next.js's built-in gzip compression. Compression layers
  // buffer their output before flushing, which collapses our SSE
  // streaming (the dialogue route) into a single end-of-stream payload.
  // Static assets are served straight; the dev hot-path doesn't need
  // compression anyway, and prod typically sits behind a CDN that handles
  // it more controllably.
  compress: false,

  // Admin authoring + the play route are Server Components that pull in helpers
  // doing dynamic `process.cwd()/public` fs (admin `_lib`: contentFs /
  // resolveAsset / saveImage; play: BGM/map detection). Next's file tracer
  // can't resolve those dynamic paths, so it conservatively bundles the ENTIRE
  // ~372 MB public media tree into EACH such lambda — every one blows past
  // Vercel's 300 MB function limit (generate measured 364 MB, stories/basic
  // 362 MB, etc). Static serving is a SEPARATE Vercel layer, so excluding media
  // from a function's trace never stops the browser from loading it. Globs are
  // explicit (not braces) to avoid picomatch brace-expansion ambiguity.
  outputFileTracingExcludes: {
    // Every admin function: drop all public media. Admin never needs the static
    // art BYTES server-side (browser previews load from the CDN; authoring +
    // writes are a dev-time workflow — they don't persist on Vercel's read-only
    // FS). Trade-off: server-side resolveAssetPath()'s existsSync() returns null
    // on Vercel, so admin image previews fall back to placeholders THERE; local
    // dev keeps full fidelity.
    "/admin/**": [
      "public/**/*.jpeg",
      "public/**/*.jpg",
      "public/**/*.png",
      "public/**/*.webp",
      "public/**/*.mp3",
      "public/**/*.wav",
      "public/**/*.ogg",
      "public/**/*.m4a",
    ],
    // The play route fs-reads ONLY audio/bgm (readdir) + map (access) at runtime
    // for BGM/map detection; scene/background/character/monster art is served to
    // the browser via CDN/static URLs, never fs-read server-side. Its [storyId]
    // is dynamic so the tracer over-includes the whole tree too — drop just the
    // heavy image dirs while KEEPING audio + map present for those fs calls.
    "/play/**": [
      "public/stories/*/scenes/**",
      "public/stories/*/backgrounds/**",
      "public/stories/*/characters/**",
      "public/stories/*/monsters/**",
      "public/backgrounds/**",
      "public/characters/**",
      "public/monsters/**",
      "public/scenes/**",
    ],
  },
};

export default nextConfig;
