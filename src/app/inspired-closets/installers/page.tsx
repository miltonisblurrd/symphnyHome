import type { Viewport } from "next";
import FieldApp from "@/components/inspired-closets/FieldApp";

export const metadata = {
  title: "Inspired Closets OS · Installers",
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
