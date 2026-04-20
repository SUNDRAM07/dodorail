import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { BRAND } from "@dodorail/sdk";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#1A1A1A",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"),
  ),
  title: {
    default: `${BRAND.name} — ${BRAND.tagline}`,
    template: `%s · ${BRAND.name}`,
  },
  description: `${BRAND.name} is a stablecoin-native payments rail for Indian SaaS founders selling globally. Cards + UPI via Dodo, native USDC on Solana, bridgeless BTC/ETH via Ika, autonomous-agent payments via x402 — all settling in USDC on Solana with optional privacy and idle-treasury yield.`,
  keywords: [
    "solana payments",
    "stablecoin payments",
    "india saas",
    "usdc",
    "dodo payments",
    "merchant of record",
    "solana frontier hackathon",
    "colosseum",
    "x402",
    "agent payments",
  ],
  authors: [{ name: "Sundaram Mahajan", url: BRAND.social.github }],
  creator: "Sundaram Mahajan",
  publisher: BRAND.name,
  openGraph: {
    type: "website",
    siteName: BRAND.name,
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description:
      "One product. Seven rails. Stripe + Wise for Indian founders, with a Solana rail ready for when your customers or their agents want it.",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    site: BRAND.social.x,
    creator: BRAND.social.x,
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description:
      "One product. Seven rails. Stripe + Wise for Indian founders, with a Solana rail ready for when your customers or their agents want it.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
