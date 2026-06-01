import type { Metadata, Viewport } from "next";
import { Lora, Caveat } from "next/font/google";
import "./globals.css";

const lora = Lora({
  variable: "--font-storybook",
  subsets: ["latin"],
  display: "swap",
});

const caveat = Caveat({
  variable: "--font-handwritten",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Story Ranger — Become the hero of a fairy tale",
  description:
    "An interactive storybook adventure for kids. Classic tales where your choices shape the story.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Story Ranger",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#7c4a1e",
};

/** Origin of the asset CDN (R2 custom domain / r2.dev), or null when serving
 *  from local public/. Used to warm the connection before the first image. */
function assetOrigin(): string | null {
  const base = process.env.NEXT_PUBLIC_ASSET_BASE_URL;
  if (!base) return null;
  try {
    return new URL(base).origin;
  } catch {
    return null;
  }
}
const ASSET_ORIGIN = assetOrigin();

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${lora.variable} ${caveat.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      {/* Body bg is set to ink (dark) instead of paper so any sliver the
          StoryPlayer's `w-dvw` fails to cover on iPad Safari (occasional
          1-2px viewport reporting quirk) blends with the cinematic black
          frame instead of flashing a cream margin. Page-level surfaces
          set their own bg-paper where needed. */}
      <body className="min-h-full flex flex-col bg-ink text-ink font-storybook">
        {/* Warm the asset-CDN connection before the first image/audio request
            (skipped in local dev, where assets are same-origin). Two links so
            both the plain <img> connection and the CORS audio/fetch connection
            are primed. React hoists rel=preconnect into <head>. */}
        {ASSET_ORIGIN && (
          <>
            <link rel="preconnect" href={ASSET_ORIGIN} />
            <link rel="preconnect" href={ASSET_ORIGIN} crossOrigin="anonymous" />
          </>
        )}
        {children}
      </body>
    </html>
  );
}
