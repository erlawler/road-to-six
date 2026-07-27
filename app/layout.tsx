import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://road-to-six-erl.erlrickylre.chatgpt.site"),
  title: "Road to Six | Cowboys Market Bias Lab",
  description:
    "An unofficial Dallas Cowboys forecasting lab with sourced football evidence, market context, transparent probabilities, and responsible runtime AI.",
  openGraph: {
    title: "Road to Six",
    description: "Cowboys Market Bias Lab",
    images: [
      { url: "/og-market-bias.jpg", width: 1200, height: 630 },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Road to Six",
    description: "Cowboys Market Bias Lab",
    images: ["/og-market-bias.jpg"],
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
