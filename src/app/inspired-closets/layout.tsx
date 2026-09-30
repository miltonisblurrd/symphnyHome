import type { Metadata } from "next";
import { Lato } from "next/font/google";

const lato = Lato({
  subsets: ["latin"],
  variable: "--font-gavin-sans",
  weight: ["300", "400", "700", "900"],
});

export const metadata: Metadata = {
  title: "Gavin Executive Dashboard · Inspired Closets",
  description: "Sign in to Inspired Closets.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "Inspired Closets login",
    description: "Sign in to Inspired Closets.",
    siteName: "Inspired Closets",
    images: [{ url: "/inspired-closets/opengraph-image", width: 1200, height: 630, alt: "Inspired Closets login" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Inspired Closets login",
    description: "Sign in to Inspired Closets.",
    images: ["/inspired-closets/opengraph-image"],
  },
  icons: {
    icon: [{ url: "/inspired-closets/InspiredClosets_Logo_RGB-300x277.png", type: "image/png" }],
    apple: "/inspired-closets/InspiredClosets_Logo_RGB-300x277.png",
  },
};

export default function InspiredClosetsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className={lato.variable}>{children}</div>;
}
