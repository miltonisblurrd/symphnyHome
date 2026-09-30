import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { installerAppReturnPath } from "@/lib/inspired-closets-access";
import InspiredClosetsAccessForm from "./InspiredClosetsAccessForm";

export const metadata: Metadata = {
  title: { absolute: "Inspired Closets login" },
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
};

export default async function InspiredClosetsAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { returnTo } = await searchParams;
  const installerPath = installerAppReturnPath(returnTo);
  if (installerPath) redirect(installerPath);

  return (
    <Suspense fallback={<div style={{ minHeight: "100dvh" }} />}>
      <InspiredClosetsAccessForm />
    </Suspense>
  );
}
