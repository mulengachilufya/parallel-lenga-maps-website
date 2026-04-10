import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import LoadingScreen from "@/components/LoadingScreen";

export const metadata: Metadata = {
  title: "Lenga Maps — Unmasking Africa with Data and Intelligence",
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
    <html lang="en">
      <body className="antialiased">
        <LoadingScreen />
        <Navbar />
        <main>{children}</main>
      </body>
    </html>
  );
}
