/**
 * DodoRail brand tokens. Single source of truth — any hex code or copy change
 * happens here first, then ripples through Tailwind config + marketing pages.
 */

export const BRAND = {
  name: "DodoRail",
  wordmark: "dodorail",
  tagline: "the stablecoin rail for Indian founders selling globally",
  domains: {
    primary: "dodorail.xyz",
    app: "app.dodorail.xyz",
    pay: "pay.dodorail.xyz",
    api: "api.dodorail.xyz",
    docs: "docs.dodorail.xyz",
    agent: "agent.dodorail.xyz",
    merchants: "merchants.dodorail.xyz",
  },
  sns: {
    root: "dodorail.sol",
    demoMerchant: "acme.dodorail.sol",
    treasury: "treasury.dodorail.sol",
    agent: "agent.dodorail.sol",
  },
  social: {
    x: "@dodorail",
    xUrl: "https://x.com/dodorail",
    telegram: "@dodorail_io",
    telegramUrl: "https://t.me/dodorail_io",
    github: "https://github.com/SUNDRAM07/dodorail",
  },
  colors: {
    charcoal: "#1A1A1A",
    burntOrange: "#E97F3B",
    burntOrangeSoft: "#F5A66D",
    ink: "#0A0A0A",
    paper: "#FAFAFA",
    muted: "#6B6B6B",
    line: "#2A2A2A",
  },
} as const;

export type BrandTokens = typeof BRAND;
