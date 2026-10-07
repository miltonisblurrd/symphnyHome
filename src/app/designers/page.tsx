import type { Viewport } from "next";
import DesignerApp from "@/components/inspired-closets/DesignerApp";

export const metadata = {
  title: "Inspired Closets OS · Designers",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#efe9e5",
};

export default function InspiredClosetsDesignersPage() {
  return <DesignerApp />;
}
