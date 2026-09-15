import type { Metadata } from "next";
import { Instrument_Serif, Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";
import { t } from "@wellrun/i18n";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
});

const grotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-grotesk",
});

const instrument = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument",
});

const copy = t("en");

export const metadata: Metadata = {
  title: {
    default: `${copy.brand} — ${copy.discover.tagline}`,
    template: `%s · ${copy.brand}`,
  },
  description:
    "Discover and compare schools in Pakistan. Profiles, fees, facilities, and reviews in one place.",
  metadataBase: new URL("http://localhost:3001"),
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: copy.brand,
    description: copy.discover.tagline,
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${grotesk.variable} ${instrument.variable}`}>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
