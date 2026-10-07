import type { Metadata } from "next";
import { Lato } from "next/font/google";
import "./globals.css";

const lato = Lato({
  subsets: ["latin"],
  variable: "--font-gavin-sans",
  weight: ["300", "400", "700", "900"],
});

export const metadata: Metadata = {
  title: {
    default: "Inspired Closets",
    template: "%s",
  },
  description: "Sign in to Inspired Closets.",
  robots: { index: false, follow: false },
  icons: { icon: "/inspired-closets/InspiredClosets_Logo_RGB-300x277.png" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${lato.variable} antialiased`}>{children}</body>
    </html>
  );
}
