import type { Metadata } from "next";
import { Geist, Geist_Mono, IBM_Plex_Mono, Inter } from "next/font/google";
import { brand } from "@/data/studio-data";
import { siteConfig } from "@/lib/site-config";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["300", "500"],
  style: ["italic", "normal"],
  variable: "--font-ibm-plex-mono",
});

export const metadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s | ${siteConfig.name}`,
  },
  description: brand.tagline,
  metadataBase: new URL(siteConfig.url),
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: siteConfig.name,
    description: brand.tagline,
    url: siteConfig.url,
    siteName: siteConfig.name,
    images: [{ url: siteConfig.ogImage, width: 1200, height: 630 }],
    locale: "en_US",
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
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${ibmPlexMono.variable} ${inter.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
