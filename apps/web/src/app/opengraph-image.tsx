import { ImageResponse } from "next/og";

/**
 * Dynamic Open Graph + Twitter card image for DodoRail's marketing landing.
 *
 * Next.js App Router convention: a file at `app/opengraph-image.{tsx,jpg,png,gif,webp}`
 * is automatically wired up as the `og:image` for `/`, AND as the
 * `twitter:image` if no separate `twitter-image` file is present.
 *
 * Why dynamic instead of a static PNG: the card auto-updates the
 * "DAY N OF 22" badge so every shared link always shows the current
 * build state. No manual re-export needed when Day 16 → 17 → 18.
 *
 * Renders a 1200x630 PNG that meets Open Graph + Twitter card-image
 * spec (2:1 aspect ratio recommended for `summary_large_image`).
 */

export const runtime = "edge";
export const alt =
  "DodoRail — the stablecoin payment rail for Indian SaaS founders selling globally. Day 17 of 22.";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

const DAY_OF = 17;
const TOTAL_DAYS = 22;

export default async function OpengraphImage(): Promise<ImageResponse> {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#0A0A0B",
          backgroundImage:
            "radial-gradient(at 20% 30%, rgba(232, 127, 59, 0.12), transparent 55%), radial-gradient(at 80% 70%, rgba(232, 127, 59, 0.08), transparent 60%)",
          padding: "72px 80px",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        }}
      >
        {/* Top row: wordmark + day badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          <div
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 56,
              fontWeight: 600,
              color: "#F5F1EA",
              letterSpacing: "-0.02em",
            }}
          >
            dodorail
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "10px 20px",
              borderRadius: 8,
              backgroundColor: "rgba(232, 127, 59, 0.15)",
              color: "#E97F3B",
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            DAY {DAY_OF} OF {TOTAL_DAYS}
          </div>
        </div>

        {/* Hero text */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 100,
            flex: 1,
          }}
        >
          <div
            style={{
              fontSize: 88,
              fontWeight: 600,
              color: "#F5F1EA",
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              fontFamily: "system-ui, sans-serif",
            }}
          >
            the stablecoin rail
          </div>
          <div
            style={{
              fontSize: 88,
              fontWeight: 600,
              color: "#E97F3B",
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              marginTop: 8,
              fontFamily: "system-ui, sans-serif",
            }}
          >
            for Indian founders
          </div>
          <div
            style={{
              fontSize: 88,
              fontWeight: 600,
              color: "#F5F1EA",
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              marginTop: 8,
              fontFamily: "system-ui, sans-serif",
            }}
          >
            selling globally
          </div>
        </div>

        {/* Bottom row: integrations + URL */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            marginTop: 60,
          }}
        >
          <div
            style={{
              fontSize: 22,
              color: "rgba(245, 241, 234, 0.55)",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            card · upi · usdc · btc · eth · agent · privacy · yield
          </div>
          <div
            style={{
              fontSize: 24,
              color: "#E97F3B",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontWeight: 600,
            }}
          >
            dodorail.vercel.app
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
