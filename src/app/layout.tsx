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
        {children}
      </body>
    </html>
  );
}
