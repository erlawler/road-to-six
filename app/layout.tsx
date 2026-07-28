import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://road-to-six-erl.erlrickylre.chatgpt.site"),
  title: "Road to Six | Technical PM and AI Case Study",
  description:
    "A technical product management case study combining sourced football evidence, transparent forecasting, responsible runtime AI, cost controls, and release governance.",
  openGraph: {
    title: "Road to Six: Frontier AI Product Case Study",
    description: "Evidence-grounded forecasting with measurable AI, cost controls, and release governance.",
    images: [
      { url: "/og-market-context.png", width: 1200, height: 630 },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Road to Six: Frontier AI Product Case Study",
    description: "Evidence-grounded forecasting with measurable AI, cost controls, and release governance.",
    images: ["/og-market-context.png"],
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
