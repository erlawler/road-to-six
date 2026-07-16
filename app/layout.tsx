import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;

  return {
    title: "Road to Six | Cowboys Market Bias Lab",
    description:
      "An unofficial Dallas Cowboys forecasting lab with sourced football evidence, market context, transparent probabilities, and responsible runtime AI.",
    openGraph: {
      title: "Road to Six",
      description: "Cowboys Market Bias Lab",
      images: [
        { url: `${origin}/og-market-bias.png`, width: 1731, height: 909 },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Road to Six",
      description: "Cowboys Market Bias Lab",
      images: [`${origin}/og-market-bias.png`],
    },
  };
}

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
