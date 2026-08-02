import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import LoadingScreen from "@/components/LoadingScreen";
import { Analytics } from '@vercel/analytics/next'
import Script from 'next/script'

// Distinct display typeface for eyebrow labels / accents. Loaded once here and
// exposed as the --font-display CSS variable, wired to the `font-display`
// Tailwind utility (see tailwind.config.ts).
const displayFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lenga Maps: Unmasking Africa with Data and Intelligence",
  description:
    "Africa's most centralized Environmental GIS Database. Download high-quality geospatial data for all 54 African countries.",
  keywords: ["GIS", "Africa", "maps", "geospatial", "environmental data", "Zambia"],
  openGraph: {
    title: "Lenga Maps",
    description: "Unmasking Africa with Data and Intelligence",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={displayFont.variable}>
      <body className="antialiased">
        <Script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1550056060479056"
          crossOrigin="anonymous"
          strategy="beforeInteractive"
        />
        <LoadingScreen />
        <Navbar />
        <main>{children}</main>
        <Analytics />
      </body>
    </html>
  );
}