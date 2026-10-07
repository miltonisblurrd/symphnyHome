import type { Viewport } from "next";
import FieldApp from "@/components/inspired-closets/FieldApp";

export const metadata = {
  title: { absolute: "Inspired Closets login" },
  description: "Sign in to Inspired Closets.",
  openGraph: {
    title: "Inspired Closets login",
    description: "Sign in to Inspired Closets.",
    siteName: "Inspired Closets",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Inspired Closets login" }],
  },
  twitter: {
    card: "summary_large_image" as const,
    title: "Inspired Closets login",
    description: "Sign in to Inspired Closets.",
    images: ["/opengraph-image"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
};

export default function InspiredClosetsInstallersPage() {
  return <FieldApp />;
}
