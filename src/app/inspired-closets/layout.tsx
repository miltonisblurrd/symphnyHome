import type { Metadata } from "next";
import { Manrope, Newsreader } from "next/font/google";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-gavin-sans",
  weight: ["400", "500", "600", "700"],
});

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-gavin-display",
  weight: ["500", "600"],
});

export const metadata: Metadata = {
  title: "Gavin Executive Dashboard · Inspired Closets",
  description:
    "Symphony prototype for Inspired Closets Las Vegas — executive visibility into jobs, money, and risk.",
  robots: { index: false, follow: false },
};

export default function InspiredClosetsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${manrope.variable} ${newsreader.variable}`}>{children}</div>
  );
}
