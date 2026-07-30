import type { Metadata } from "next";
import "./globals.css";

const SITE_URL = "https://road-to-six-erl.erlrickylre.chatgpt.site";
const SOCIAL_IMAGE_ALT =
  "Road to Six technical product management case study with football forecasting, market context, and governed Runtime AI.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Road to Six | Technical PM and AI Case Study",
  description:
    "A technical product management case study combining sourced football evidence, transparent forecasting, responsible runtime AI, cost controls, and release governance.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Road to Six",
    title: "Road to Six: Frontier AI Product Case Study",
    description: "Evidence-grounded forecasting with measurable AI, cost controls, and release governance.",
    images: [
      {
        url: "/og-market-context.png",
        width: 1200,
        height: 630,
        alt: SOCIAL_IMAGE_ALT,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Road to Six: Frontier AI Product Case Study",
    description: "Evidence-grounded forecasting with measurable AI, cost controls, and release governance.",
    images: [
      {
        url: "/og-market-context.png",
        alt: SOCIAL_IMAGE_ALT,
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
