import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { GlobalEmojiSwap } from "@/components/GlobalEmojiSwap";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ppvs.io — Sell content on Telegram. Get paid instantly.",
  description:
    "The PPV platform built for Telegram creators and agencies. Upload your vault, let your chatters sell, and get paid — all in one dashboard.",
};

// Mobile baseline: device-width scaling so phones don't render at desktop
// width then shrink. maximumScale left default so users can still zoom.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        {/* Resource hints — the Apple-style emoji PNGs (GlobalEmojiSwap) load
            from the jsDelivr CDN. Preconnecting opens the TLS connection up
            front so the swapped Apple emojis arrive immediately instead of
            flashing the system (Segoe/Android) glyphs for ~0.5s first. No
            crossOrigin: the <img> swaps fetch without CORS, so a plain
            preconnect is what gets reused. */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
        <link rel="dns-prefetch" href="https://cdn.jsdelivr.net" />
        <GlobalEmojiSwap />
        {children}
      </body>
    </html>
  );
}
