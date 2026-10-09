import type { Metadata, Viewport } from "next";
import { Archivo, Instrument_Serif } from "next/font/google";
import { publicEnv } from "@/lib/env";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo", display: "swap" });
const instrument = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-instrument", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.siteUrl),
  title: { default: "RT Performance — Raymond Tate Performance", template: "%s · RT Performance" },
  description: "Relentless Training. Intelligent Progress. Personal training built around intentional programming, consistent execution, and intelligent adjustment.",
  applicationName: "RT Performance",
  appleWebApp: { capable: true, title: "RT Performance", statusBarStyle: "black-translucent" },
  openGraph: {
    title: "RT Performance",
    description: "Built on discipline. Engineered for progress.",
    images: ["/images/hero-deadlift.jpg"],
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${instrument.variable}`}>
      <body className="min-h-dvh">
        <a href="#main" className="sr-only z-50 bg-accent px-4 py-2 text-accent-fg focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
