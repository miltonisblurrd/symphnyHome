import type { Metadata } from "next";
import { Lato } from "next/font/google";

const lato = Lato({
  subsets: ["latin"],
  variable: "--font-gavin-sans",
  weight: ["300", "400", "700", "900"],
});

export const metadata: Metadata = {
  title: "Gavin Executive Dashboard · Inspired Closets",
  description:
    "Symphony prototype for Inspired Closets Las Vegas — executive visibility into jobs, money, and risk.",
  robots: { index: false, follow: false },
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
