import type { Metadata } from "next";
import { Inter, Spectral } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import LoadingScreen from "@/components/LoadingScreen";
import { Analytics } from '@vercel/analytics/next'

// Editorial pairing — Spectral for headlines (serif, six weights), Inter
// for body and UI. Loaded via next/font so the WOFF2 is inlined and the
// font-display: swap fallback is correct. Exposed as CSS variables so
// Tailwind's font-sans / font-serif utilities pick them up everywhere.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const spectral = Spectral({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lenga Maps - Unmasking Africa with Data and Intelligence",
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
    <html lang="en" className={`${inter.variable} ${spectral.variable}`}>
      <body className="antialiased font-sans">
        <LoadingScreen />
        <Navbar />
        <main>{children}</main>
        <Analytics />
      </body>
    </html>
  );
}
