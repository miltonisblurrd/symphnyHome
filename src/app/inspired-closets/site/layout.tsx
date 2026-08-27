import type { Metadata } from "next";
import SiteChrome from "@/components/inspired-closets/SiteChrome";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function InspiredClosetsSiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SiteChrome>{children}</SiteChrome>;
}
